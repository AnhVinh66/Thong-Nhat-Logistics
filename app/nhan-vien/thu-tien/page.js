'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  supabase, vnd, orderCode, stopCode, customerCode, collectionCode, methodLabel, BILLS_BUCKET, commas, fmtDateTime,
} from '../../../lib/supabase';
import { fmtTime } from '../../../lib/bank';
import Modal from '../../../components/staff/Modal';
import DateInput from '../../../components/DateInput';
import { compress } from '../../../components/staff/DeliveryDocs';
import CollectionForm from '../../../components/staff/CollectionForm';
import DropZone from '../../../components/staff/DropZone';
import { useRole } from '../../../components/staff/Role';

const dmy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const stamp = fmtDateTime;

// Trạng thái đối soát của một lệnh Thu: ok (tích xanh) / bad (X đỏ) / na (tiền mặt, không áp dụng)
function reconOf(r, cands, banks) {
  if (r.method !== 'transfer') return { state: 'na', text: 'Tiền mặt: không đối soát với sao kê ngân hàng.' };
  if (r.bank_transaction_id) {
    const t = r.bank_transactions;
    const ft = t ? fmtTime(t.txn_time, t.has_time) : null;
    return {
      state: 'ok',
      text: `Đã khớp dòng sao kê ${r.bank_accounts?.bank_name || ''}${ft ? ` · ${ft.date}${ft.time ? ' ' + ft.time : ''}` : ''} · + ${commas(r.amount)} VNĐ`,
      txn: t,
    };
  }
  if (!r.bank_account_id) return { state: 'bad', text: 'Chưa chọn ngân hàng. Bấm Sửa để chọn ngân hàng nhận tiền.' };
  const day = (c) => fmtTime(c.txn_time).date;
  const want = dmy(r.collected_on);
  const same = cands.filter((c) => Number(c.amount) === Number(r.amount));
  const sameBank = same.filter((c) => c.bank_account_id === r.bank_account_id);
  if (sameBank.some((c) => day(c) === want)) {
    return { state: 'bad', text: 'Có dòng sao kê cùng ngân hàng, số tiền, ngày nhưng đã được lệnh Thu khác sử dụng (mỗi dòng sao kê chỉ khớp một lệnh Thu).' };
  }
  if (sameBank.length) {
    const days = [...new Set(sameBank.map(day))].slice(0, 3).join(', ');
    return { state: 'bad', text: `Có dòng sao kê cùng ngân hàng và số tiền nhưng khác ngày (${days}). Hãy sửa ngày thu cho đúng.` };
  }
  if (same.length) {
    const names = [...new Set(same.map((c) => banks[c.bank_account_id]?.bank_name).filter(Boolean))].join(', ');
    return { state: 'bad', text: `Có dòng sao kê cùng số tiền nhưng ở ngân hàng khác (${names}). Hãy sửa ngân hàng.` };
  }
  return { state: 'bad', text: 'Chưa có dòng sao kê nào đúng ngân hàng, số tiền và ngày. Hãy tải sao kê ngân hàng hoặc kiểm tra lại thông tin phiếu.' };
}

const reconMark = { ok: '✓', bad: '✕', na: '–' };

// Mã hiển thị của một dòng phân bổ: đơn 1 điểm = DH0004; đơn nhiều điểm = mã con của các điểm trả thuộc khách (DH0004-1, DH0004-3)
const itemCode = (i, customerId) => {
  const o = i.orders;
  if (!o) return '';
  if (o.order_type === 'multi') {
    const mine = (o.order_stops || []).filter((s) => s.customer_id === customerId).sort((a, b) => a.stop_no - b.stop_no);
    if (mine.length) return mine.map((s) => stopCode(o.order_no, s.stop_no)).join(', ');
  }
  return orderCode(o.order_no);
};

function Detail({ row, recon, onClose, onChanged, onEdit }) {
  const { editCollection: canEdit, addCollection: canAdd } = useRole();
  const [photos, setPhotos] = useState([]);
  const [urls, setUrls] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('collection_photos').select('*').eq('collection_id', row.id).order('created_at');
    setPhotos(data || []);
    if (data?.length) {
      const { data: signed } = await supabase.storage.from(BILLS_BUCKET).createSignedUrls(data.map((p) => p.path), 3600);
      setUrls(Object.fromEntries((signed || []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl])));
    }
  }, [row.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(files) {
    const list = [...(files || [])].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (!list.length) return;
    setBusy(true);
    let ok = 0;
    for (const f of list) {
      const { blob, ext, type } = await compress(f);
      const path = `${row.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const up = await supabase.storage.from(BILLS_BUCKET).upload(path, blob, { contentType: type });
      if (up.error) continue;
      const ins = await supabase.from('collection_photos').insert({ collection_id: row.id, path });
      if (ins.error) await supabase.storage.from(BILLS_BUCKET).remove([path]);
      else ok++;
    }
    setBusy(false);
    setMsg(ok === list.length ? { ok: true, text: `Đã gắn ${ok} ảnh.` } : { ok: false, text: `Gắn được ${ok}/${list.length} ảnh. Ảnh lỗi có thể quá 10 MB.` });
    load();
    onChanged();
  }

  async function removePhoto(p) {
    if (!window.confirm('Xoá ảnh bill này?')) return;
    await supabase.storage.from(BILLS_BUCKET).remove([p.path]);
    await supabase.from('collection_photos').delete().eq('id', p.id);
    load();
    onChanged();
  }

  const items = row.collection_items || [];
  const allocated = items.reduce((a, i) => a + Number(i.amount), 0);

  return (
    <Modal title={`Phiếu Thu ${collectionCode(row.collection_no)}`} onClose={onClose} width={760}>
      <dl className="detail">
        <div><dt>Khách hàng</dt><dd><strong>{customerCode(row.customers?.customer_no)} – {row.customers?.name}</strong></dd></div>
        <div><dt>Số tiền thu</dt><dd><strong className="debt-has" style={{ color: 'var(--ok)' }}>{vnd(row.amount)}</strong></dd></div>
        <div><dt>Hình thức</dt><dd>{methodLabel[row.method]}{row.bank_accounts ? ` · ${row.bank_accounts.bank_name} ${row.bank_accounts.account_number}` : ''}</dd></div>
        <div><dt>Ngày thu tiền</dt><dd>{dmy(row.collected_on)}</dd></div>
        <div><dt>Nội dung</dt><dd>{row.content || '—'}</dd></div>
        <div><dt>Người tạo</dt><dd>{row.created_by_name || '—'} · {stamp(row.created_at)}</dd></div>
        {row.updated_at && <div><dt>Sửa lần cuối</dt><dd>{row.updated_by_name || '—'} · {stamp(row.updated_at)}</dd></div>}
      </dl>

      {recon && (
        <div className={`recon-box recon-${recon.state}`} role="status">
          <span className="recon-icon" aria-hidden="true">{reconMark[recon.state]}</span>
          <div>
            <strong>{recon.state === 'ok' ? 'Đã khớp sao kê' : recon.state === 'bad' ? 'Chưa khớp sao kê' : 'Không áp dụng'}</strong>
            <p style={{ margin: '2px 0 0' }}>{recon.text}</p>
          </div>
        </div>
      )}

      <h3 style={{ margin: '16px 0 8px' }}>Đơn hàng đã thu</h3>
      {items.length ? (
        <table className="alloc-table">
          <thead><tr><th>Đơn hàng</th><th className="num">Số tiền thu</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id || i.order_id}><td><strong>{itemCode(i, row.customer_id)}</strong></td><td className="num">{vnd(i.amount)}</td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td><strong>Tổng đã gán</strong></td><td className="num"><strong>{vnd(allocated)}</strong></td></tr>
            {allocated < Number(row.amount) && (
              <tr><td className="muted">Chưa gán cho đơn nào</td><td className="num sum-warn">{vnd(Number(row.amount) - allocated)}</td></tr>
            )}
          </tfoot>
        </table>
      ) : (
        <p className="muted">Phiếu này chưa gán cho đơn hàng nào.</p>
      )}

      <div className="doc-head" style={{ marginTop: 18 }}>
        <h3 style={{ margin: 0 }}>Ảnh bill ({photos.length})</h3>
      </div>
      {canAdd && <DropZone id="d-add" wide disabled={busy} onFiles={add} label={busy ? 'Đang tải ảnh lên...' : 'Gắn thêm ảnh bill'} />}
      {msg && <p className={msg.ok ? 'ok-msg' : 'err'} role="status">{msg.text}</p>}
      {photos.length ? (
        <ul className="thumbs">
          {photos.map((p) => (
            <li key={p.id}>
              {urls[p.path] ? (
                <a href={urls[p.path]} target="_blank" rel="noopener noreferrer" aria-label="Mở ảnh bill cỡ lớn">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urls[p.path]} alt="Ảnh bill thu tiền" loading="lazy" />
                </a>
              ) : <div className="thumb-ph">Đang tải...</div>}
              <button type="button" className="thumb-del" onClick={() => removePhoto(p)} aria-label="Xoá ảnh này" hidden={!canEdit}>✕</button>
            </li>
          ))}
        </ul>
      ) : <p className="muted small">Chưa có ảnh bill.</p>}
      <div className="modal-actions" style={{ marginTop: 16 }}>
        <button className="btn btn-outline" onClick={onClose}>Đóng</button>
        {canEdit && <button className="btn btn-primary" onClick={() => onEdit(row)}>Sửa phiếu</button>}
      </div>
    </Modal>
  );
}

export default function Page() {
  const { addCollection, editCollection } = useRole();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [method, setMethod] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState(null);
  const [rec, setRec] = useState('');
  const [cands, setCands] = useState([]);
  const [banks, setBanks] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('collections')
      .select('*, customers(customer_no, name), bank_accounts(bank_name, account_number), bank_transactions(txn_time, has_time, amount, description), collection_items(id, order_id, amount, orders(order_no, order_type, order_stops(customer_id, stop_no))), collection_photos(id)')
      .order('collected_on', { ascending: false })
      .order('collection_no', { ascending: false });
    if (error) setErr('Không tải được danh sách Thu. Hãy chạy supabase/collections.sql trên Supabase.');
    else {
      setErr('');
      setRows(data || []);
      // Dữ liệu để giải thích vì sao lệnh Thu chưa khớp (dòng sao kê cùng số tiền, tên ngân hàng)
      const need = (data || []).filter((r) => r.method === 'transfer' && !r.bank_transaction_id);
      const [c, b] = await Promise.all([
        need.length
          ? supabase.from('bank_transactions').select('id, bank_account_id, amount, txn_time').in('amount', [...new Set(need.map((r) => r.amount))]).limit(3000)
          : Promise.resolve({ data: [] }),
        supabase.from('bank_accounts').select('id, bank_name'),
      ]);
      setCands(c.data || []);
      setBanks(Object.fromEntries((b.data || []).map((x) => [x.id, x])));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const recon = useMemo(() => Object.fromEntries(rows.map((r) => [r.id, reconOf(r, cands, banks)])), [rows, cands, banks]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (method && r.method !== method) return false;
      if (rec && recon[r.id]?.state !== rec) return false;
      if (from && r.collected_on < from) return false;
      if (to && r.collected_on > to) return false;
      if (!s) return true;
      const hay = [collectionCode(r.collection_no), customerCode(r.customers?.customer_no), r.customers?.name, r.content, r.created_by_name,
        ...(r.collection_items || []).map((i) => itemCode(i, r.customer_id))];
      return hay.some((v) => (v || '').toLowerCase().includes(s));
    });
  }, [rows, q, method, from, to, rec, recon]);

  const total = useMemo(() => {
    const t = { all: 0, cash: 0, transfer: 0 };
    shown.forEach((r) => {
      t.all += Number(r.amount);
      t[r.method] += Number(r.amount);
    });
    return t;
  }, [shown]);

  async function remove(r) {
    if (!window.confirm(`Xoá phiếu Thu ${collectionCode(r.collection_no)} (${vnd(r.amount)})? Công nợ của khách sẽ tăng lại tương ứng. Không thể hoàn tác.`)) return;
    const { data: ph } = await supabase.from('collection_photos').select('path').eq('collection_id', r.id);
    if (ph?.length) await supabase.storage.from(BILLS_BUCKET).remove(ph.map((p) => p.path));
    const { error } = await supabase.from('collections').delete().eq('id', r.id);
    if (error) return window.alert('Không xoá được. Vui lòng thử lại.');
    load();
  }

  return (
    <>
      <div className="staff-head">
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Thu tiền</h1>
        {addCollection && <button className="btn btn-primary btn-lg" onClick={() => { setNotice(null); setCreating(true); }}>+ Đề xuất Thu</button>}
      </div>

      <div className="kpis" style={{ marginBottom: 16 }}>
        <div className="kpi"><span className="kpi-icon tone-ok"><span aria-hidden="true">₫</span></span><span className="kpi-text"><span className="kpi-label">Tổng thu (theo bộ lọc)</span><span className="kpi-value">{vnd(total.all)}</span><span className="kpi-sub">{shown.length} phiếu</span></span></div>
        <div className="kpi"><span className="kpi-icon tone-navy"><span aria-hidden="true">₫</span></span><span className="kpi-text"><span className="kpi-label">Tiền mặt</span><span className="kpi-value">{vnd(total.cash)}</span></span></div>
        <div className="kpi"><span className="kpi-icon tone-blue"><span aria-hidden="true">₫</span></span><span className="kpi-text"><span className="kpi-label">Chuyển khoản</span><span className="kpi-value">{vnd(total.transfer)}</span></span></div>
      </div>

      <div className="toolbar">
        <input aria-label="Tìm kiếm" placeholder="Tìm theo mã phiếu, khách hàng, mã KH, đơn hàng, nội dung..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Hình thức" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">Mọi hình thức</option>
          <option value="cash">Tiền mặt</option>
          <option value="transfer">Chuyển khoản</option>
        </select>
        <select aria-label="Đối soát sao kê" value={rec} onChange={(e) => setRec(e.target.value)}>
          <option value="">Mọi đối soát</option>
          <option value="ok">✓ Đã khớp sao kê</option>
          <option value="bad">✕ Chưa khớp sao kê</option>
        </select>
        <span className="date-filter">Từ <DateInput aria-label="Từ ngày" value={from} onChange={setFrom} /></span>
        <span className="date-filter">Đến <DateInput aria-label="Đến ngày" value={to} onChange={setTo} /></span>
      </div>

      {err && <p className="err" role="alert">{err}</p>}
      {notice && <p className={notice.ok ? 'ok-msg' : 'err'} role="status" style={{ marginBottom: 10 }}>{notice.text}</p>}
      <table className="cus-table col-table">
        <thead>
          <tr>
            <th className="w-code">Mã phiếu</th>
            <th className="w-date">Ngày thu</th>
            <th>Khách hàng</th>
            <th>Nội dung / Đơn hàng</th>
            <th className="w-method">Hình thức</th>
            <th className="w-recon">Đối soát</th>
            <th className="c-debt">Số tiền</th>
            <th className="w-bill">Bill</th>
            <th className="c-act c-act3"><span className="sr-only">Thao tác</span></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}>
              <td className="w-code"><strong>{collectionCode(r.collection_no)}</strong><div className="muted small">{r.created_by_name}</div></td>
              <td className="w-date">{dmy(r.collected_on)}</td>
              <td><strong className="c-name">{r.customers?.name}</strong><span className="muted small">{customerCode(r.customers?.customer_no)}</span></td>
              <td>
                {r.content || <span className="muted">—</span>}
                {r.collection_items?.length > 0 && (
                  <div className="muted small">{r.collection_items.map((i) => `${itemCode(i, r.customer_id)}: ${vnd(i.amount)}`).join(' · ')}</div>
                )}
              </td>
              <td className="w-method">
                <span className={`pill ${r.method === 'cash' ? 'pill-ok' : 'pill-blue'}`}>{methodLabel[r.method]}</span>
                {r.bank_accounts && <div className="muted small">{r.bank_accounts.bank_name}</div>}
              </td>
              <td className="w-recon">
                {recon[r.id] && (
                  <button
                    className={`recon-btn recon-${recon[r.id].state}`}
                    onClick={() => setOpen(r)}
                    title={recon[r.id].text}
                    aria-label={recon[r.id].state === 'ok' ? 'Đã khớp sao kê' : recon[r.id].state === 'bad' ? `Chưa khớp sao kê. ${recon[r.id].text}` : 'Tiền mặt, không đối soát với sao kê'}
                  >
                    {reconMark[recon[r.id].state]}
                  </button>
                )}
              </td>
              <td className="c-debt"><strong style={{ color: 'var(--ok)' }}>{vnd(r.amount)}</strong></td>
              <td className="w-bill">{r.collection_photos?.length ? `${r.collection_photos.length} ảnh` : <span className="muted">—</span>}</td>
              <td className="c-act c-act3">
                <div className="actions">
                  <button className="btn btn-outline sm" onClick={() => setOpen(r)}>Xem</button>
                  {editCollection && <button className="btn btn-outline sm" onClick={() => { setNotice(null); setEditRow(r); }}>Sửa</button>}
                  {editCollection && <button className="btn btn-danger sm" onClick={() => remove(r)}>Xoá</button>}
                </div>
              </td>
            </tr>
          ))}
          {!loading && !shown.length && <tr><td colSpan={9} className="muted">Chưa có phiếu Thu nào.</td></tr>}
          {loading && <tr><td colSpan={9} className="muted">Đang tải...</td></tr>}
        </tbody>
      </table>

      {open && <Detail row={open} recon={recon[open.id]} onClose={() => setOpen(null)} onChanged={load} onEdit={(r) => { setOpen(null); setEditRow(r); }} />}

      {(editRow || creating) && (
        <CollectionForm
          edit={editRow}
          onClose={() => { setEditRow(null); setCreating(false); }}
          onSaved={({ no, failedPhotos, edited }) => {
            setEditRow(null);
            setCreating(false);
            setNotice({ ok: !failedPhotos, text: `${edited ? 'Đã lưu thay đổi phiếu Thu' : 'Đã tạo đề xuất Thu'} ${collectionCode(no)}.${failedPhotos ? ` Có ${failedPhotos} ảnh bill chưa xử lý được, hãy mở phiếu để kiểm tra.` : ''}` });
            load();
          }}
        />
      )}
    </>
  );
}
