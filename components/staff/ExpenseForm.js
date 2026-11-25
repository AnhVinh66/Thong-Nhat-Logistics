'use client';

import { useEffect, useRef, useState } from 'react';
import {
  supabase, displayLogin, expenseCode, expenseTypes, needsVehicle, EXPENSE_BUCKET,
} from '../../lib/supabase';
import Modal from './Modal';
import DropZone from './DropZone';
import MoneyInput from './MoneyInput';
import DateInput from '../DateInput';
import TypePicker from './TypePicker';
import { compress } from './DeliveryDocs';

const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// edit: dòng phiếu chi đang sửa (chỉ sửa được khi Chờ duyệt); bỏ trống = Đề xuất Chi mới
// draft: điền sẵn cho phiếu mới { type, vehicle_id, expense_date, content, fuel_refill_id, title } (VD lần đổ dầu chờ nhập tiền)
export default function ExpenseForm({ onClose, onSaved, edit = null, draft = null }) {
  const init = edit || draft;
  const [amount, setAmount] = useState(edit ? String(edit.amount) : '');
  const [type, setType] = useState(init?.type || '');
  const [vehicleId, setVehicleId] = useState(init?.vehicle_id || '');
  const [method, setMethod] = useState(edit?.method || '');
  const [bankId, setBankId] = useState(edit?.bank_account_id || '');
  const [date, setDate] = useState(init?.expense_date || todayISO());
  const [content, setContent] = useState(init?.content || '');
  const [vehicles, setVehicles] = useState(null);
  const [banks, setBanks] = useState(null);
  const [files, setFiles] = useState([]);
  const [oldPhotos, setOldPhotos] = useState([]);
  const [removed, setRemoved] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  const filesRef = useRef([]);
  filesRef.current = files;
  const editId = edit?.id || null;

  useEffect(() => {
    supabase.from('vehicles').select('id, plate, payload_tons, volume_cbm').order('plate').then(({ data }) => setVehicles(data || []));
    supabase.from('bank_accounts').select('id, bank_name, account_number, account_name').order('bank_name').then(({ data }) => setBanks(data || []));
    return () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.url));
  }, []);

  useEffect(() => {
    if (!editId) return;
    (async () => {
      const { data } = await supabase.from('expense_photos').select('id, path').eq('expense_id', editId).order('created_at');
      if (!data?.length) return;
      const { data: signed } = await supabase.storage.from(EXPENSE_BUCKET).createSignedUrls(data.map((p) => p.path), 3600);
      const url = Object.fromEntries((signed || []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));
      setOldPhotos(data.map((p) => ({ ...p, url: url[p.path] })));
    })();
  }, [editId]);

  function addFiles(list) {
    const add = [...list].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name)).map((file) => ({ file, url: URL.createObjectURL(file) }));
    setFiles((s) => [...s, ...add]);
    if (fileRef.current) fileRef.current.value = '';
  }
  const removeFile = (i) => setFiles((s) => {
    URL.revokeObjectURL(s[i].url);
    return s.filter((_, j) => j !== i);
  });

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const amt = Number(amount || 0);
    if (!(amt > 0)) return setErr('Vui lòng nhập số tiền thanh toán.');
    if (!type) return setErr('Vui lòng chọn loại yêu cầu chi.');
    if (needsVehicle(type) && !vehicleId) return setErr('Vui lòng chọn xe cho khoản chi này.');
    if (!method) return setErr('Vui lòng chọn hình thức (Tiền mặt hoặc Chuyển khoản).');
    if (method === 'transfer' && !bankId) return setErr('Vui lòng chọn ngân hàng chi tiền.');
    if (!date) return setErr('Vui lòng chọn ngày chi.');
    if (content.trim().length < 3) return setErr('Vui lòng nhập giải trình về nội dung đề xuất chi.');

    setBusy(true);
    const fields = {
      expense_date: date,
      type,
      vehicle_id: needsVehicle(type) ? vehicleId : null,
      amount: amt,
      method,
      bank_account_id: method === 'transfer' ? bankId : null,
      content: content.trim(),
    };
    const { data: u } = await supabase.auth.getUser();
    const by = displayLogin(u?.user?.email);
    let id = editId;
    let no = edit?.expense_no;

    if (edit) {
      const r = await supabase.from('expenses').update({ ...fields, updated_at: new Date().toISOString(), updated_by_name: by }).eq('id', editId);
      if (r.error) {
        setBusy(false);
        return setErr(r.error.code === 'P0001' ? r.error.message : 'Không lưu được thay đổi. Vui lòng thử lại.');
      }
    } else {
      const ins = await supabase.from('expenses').insert({ ...fields, created_by_name: by, ...(draft?.fuel_refill_id ? { fuel_refill_id: draft.fuel_refill_id } : {}) }).select('id, expense_no').single();
      if (ins.error) {
        setBusy(false);
        return setErr(
          ins.error.code === '42P01' || ins.error.code === 'PGRST205'
            ? 'Chưa có bảng chi tiền. Hãy chạy supabase/expenses.sql trên Supabase.'
            : ins.error.code === 'P0001' ? ins.error.message : 'Không lưu được phiếu chi. Vui lòng thử lại.'
        );
      }
      id = ins.data.id;
      no = ins.data.expense_no;
    }

    let failed = 0;
    for (const pid of removed) {
      const p = oldPhotos.find((x) => x.id === pid);
      if (!p) continue;
      await supabase.storage.from(EXPENSE_BUCKET).remove([p.path]);
      const d = await supabase.from('expense_photos').delete().eq('id', pid);
      if (d.error) failed++;
    }
    for (const f of files) {
      const { blob, ext, type: mime } = await compress(f.file);
      const path = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const up = await supabase.storage.from(EXPENSE_BUCKET).upload(path, blob, { contentType: mime });
      const row = up.error ? { error: up.error } : await supabase.from('expense_photos').insert({ expense_id: id, path });
      if (row.error) {
        failed++;
        if (!up.error) await supabase.storage.from(EXPENSE_BUCKET).remove([path]);
      }
    }
    setBusy(false);
    onSaved({ no, failedPhotos: failed, edited: !!edit });
  }

  const shownOld = oldPhotos.filter((p) => !removed.includes(p.id));

  return (
    <Modal title={edit ? `Sửa phiếu chi ${expenseCode(edit.expense_no)}` : draft?.title || 'Đề xuất Chi'} onClose={onClose} width={780}>
      <form className="form" onSubmit={submit} noValidate>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="e-amount">Số tiền thanh toán (đồng) *</label>
            <MoneyInput id="e-amount" value={amount} onChange={setAmount} placeholder="VD: 5,000,000" className="money-big" />
          </div>
          <div className="field">
            <label htmlFor="e-date">Ngày chi *</label>
            <DateInput id="e-date" value={date} onChange={setDate} />
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <span className="label-like" id="e-type-l">Loại yêu cầu chi *</span>
            <TypePicker id="e-type" value={type} onChange={setType} aria-labelledby="e-type-l" />
          </div>
          <div className="field">
            <label htmlFor="e-veh">Xe{needsVehicle(type) ? ' *' : ''}</label>
            <select id="e-veh" value={needsVehicle(type) ? vehicleId : ''} onChange={(e) => setVehicleId(e.target.value)} disabled={!needsVehicle(type)}>
              <option value="">
                {!needsVehicle(type) ? 'Chỉ chọn với chi bảo dưỡng / nhiên liệu' : vehicles === null ? 'Đang tải...' : 'Chọn xe trong danh sách xe'}
              </option>
              {(vehicles || []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate}{v.payload_tons != null ? ` – ${Number(v.payload_tons)} tấn` : ''}{v.volume_cbm != null ? ` (${Number(v.volume_cbm)} CBM)` : ''}
                </option>
              ))}
            </select>
            {needsVehicle(type) && vehicles && vehicles.length === 0 && <p className="sum-warn small" style={{ margin: 0 }}>Chưa có xe nào. Hãy thêm ở mục <strong>Danh sách xe</strong> trước.</p>}
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <span className="label-like" id="e-method-l">Hình thức *</span>
            <div className="seg seg-full" role="radiogroup" aria-labelledby="e-method-l">
              {[['cash', 'Tiền mặt'], ['transfer', 'Chuyển khoản']].map(([v, label]) => (
                <button type="button" key={v} role="radio" aria-checked={method === v} className={method === v ? 'on' : ''} onClick={() => setMethod(v)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="e-bank">Ngân hàng chi tiền{method === 'transfer' ? ' *' : ''}</label>
            <select id="e-bank" value={method === 'transfer' ? bankId : ''} onChange={(e) => setBankId(e.target.value)} disabled={method !== 'transfer'}>
              <option value="">
                {method !== 'transfer' ? 'Chỉ chọn khi chuyển khoản' : banks === null ? 'Đang tải...' : 'Chọn ngân hàng (để đối chiếu sao kê)'}
              </option>
              {(banks || []).map((b) => <option key={b.id} value={b.id}>{b.bank_name} · {b.account_number} – {b.account_name}</option>)}
            </select>
            {method === 'transfer' && banks && banks.length === 0 && <p className="sum-warn small" style={{ margin: 0 }}>Chưa có ngân hàng nào. Hãy thêm ở mục <strong>Giao dịch ngân hàng</strong> trước.</p>}
          </div>
        </div>

        <div className="field">
          <label htmlFor="e-content">Giải trình về nội dung đề xuất chi *</label>
          <textarea id="e-content" rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder="VD: Thay lốp trước xe 29E-373.03 theo báo giá của garage ABC..." />
        </div>

        <div className="field">
          <span className="label-like">Hoá đơn / Ảnh thanh toán</span>
          <div className="bill-row">
            <DropZone id="e-files" onFiles={addFiles} />
            {files.length === 0 && shownOld.length === 0 && <span className="muted small">Chưa có ảnh (có thể gắn nhiều ảnh)</span>}
            <ul className="bill-thumbs">
              {shownOld.map((p, i) => (
                <li key={p.id}>
                  {p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt={`Ảnh đã lưu ${i + 1}`} />
                  ) : <span className="muted small">...</span>}
                  <button type="button" onClick={() => setRemoved((r) => [...r, p.id])} aria-label={`Bỏ ảnh đã lưu ${i + 1}`}>✕</button>
                </li>
              ))}
              {files.map((f, i) => (
                <li key={f.url}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={`Ảnh mới ${i + 1}`} />
                  <button type="button" onClick={() => removeFile(i)} aria-label={`Bỏ ảnh mới ${i + 1}`}>✕</button>
                </li>
              ))}
            </ul>
          </div>
          {removed.length > 0 && <p className="muted small" style={{ margin: 0 }}>{removed.length} ảnh đã lưu sẽ bị xoá khi bạn bấm Lưu.</p>}
        </div>

        {err && <p className="err" role="alert">{err}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>Huỷ</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Đang lưu...' : edit ? 'Lưu thay đổi' : 'Gửi đề xuất chi'}</button>
        </div>
      </form>
    </Modal>
  );
}
