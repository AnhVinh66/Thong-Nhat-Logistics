'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  supabase, vnd, expenseCode, expenseTypes, expenseStatus, needsVehicle, methodLabel, displayLogin, EXPENSE_BUCKET, commas, fmtDateTime,
} from '../../../lib/supabase';
import { fmtTime } from '../../../lib/bank';
import Modal from '../../../components/staff/Modal';
import DateInput from '../../../components/DateInput';
import ExpenseForm from '../../../components/staff/ExpenseForm';
import DropZone from '../../../components/staff/DropZone';
import { useRole } from '../../../components/staff/Role';
import { compress } from '../../../components/staff/DeliveryDocs';

const dmy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const stamp = fmtDateTime;
const hm = (ts) => (ts ? new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '');
const reconMark = { ok: '✓', bad: '✕', na: '–' };

const purposeOf = (r) => `${expenseTypes[r.type] || r.type}${needsVehicle(r.type) && r.vehicles?.plate ? ` · ${r.vehicles.plate}` : ''}`;

// Đối chiếu với dòng sao kê TIỀN RA: tích xanh / X đỏ / gạch xám (tiền mặt)
function reconOf(r, cands, banks) {
  if (r.method !== 'transfer') return { state: 'na', text: 'Tiền mặt: không đối chiếu với sao kê ngân hàng.' };
  if (r.bank_transaction_id) {
    const t = r.bank_transactions;
    const ft = t ? fmtTime(t.txn_time, t.has_time) : null;
    return {
      state: 'ok',
      text: `Đã khớp dòng sao kê ${r.bank_accounts?.bank_name || ''}${ft ? ` · ${ft.date}${ft.time ? ' ' + ft.time : ''}` : ''} · − ${commas(r.amount)} VNĐ`,
    };
  }
  if (!r.bank_account_id) return { state: 'bad', text: 'Chưa chọn ngân hàng. Hãy sửa phiếu (hoàn về Chờ duyệt) để chọn ngân hàng.' };
  const day = (c) => fmtTime(c.txn_time).date;
  const want = dmy(r.expense_date);
  const same = cands.filter((c) => Number(c.amount) === -Number(r.amount));
  const sameBank = same.filter((c) => c.bank_account_id === r.bank_account_id);
  if (sameBank.some((c) => day(c) === want)) {
    return { state: 'bad', text: 'Có dòng sao kê tiền ra cùng ngân hàng, số tiền, ngày nhưng đã được phiếu chi khác sử dụng (mỗi dòng sao kê chỉ khớp một phiếu).' };
  }
  if (sameBank.length) {
    const days = [...new Set(sameBank.map(day))].slice(0, 3).join(', ');
    return { state: 'bad', text: `Có dòng sao kê tiền ra cùng ngân hàng và số tiền nhưng khác ngày (${days}). Hãy sửa ngày chi cho đúng.` };
  }
  if (same.length) {
    const names = [...new Set(same.map((c) => banks[c.bank_account_id]?.bank_name).filter(Boolean))].join(', ');
    return { state: 'bad', text: `Có dòng sao kê tiền ra cùng số tiền nhưng ở ngân hàng khác (${names}). Hãy sửa ngân hàng.` };
  }
  return { state: 'bad', text: 'Chưa có dòng sao kê tiền ra nào đúng ngân hàng, số tiền và ngày. Hãy tải sao kê ngân hàng hoặc kiểm tra lại thông tin phiếu.' };
}

function StatusPill({ status }) {
  return <span className={`st-pill st-${status}`}>{expenseStatus[status]}</span>;
}

function Detail({ row, recon, onClose, onChanged, onEdit, onStatus }) {
  const { manageAllExpenses, userId } = useRole();
  const mine = manageAllExpenses || row.created_by === userId;
  const [photos, setPhotos] = useState([]);
  const [urls, setUrls] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('expense_photos').select('*').eq('expense_id', row.id).order('created_at');
    setPhotos(data || []);
    if (data?.length) {
      const { data: signed } = await supabase.storage.from(EXPENSE_BUCKET).createSignedUrls(data.map((p) => p.path), 3600);
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
      const up = await supabase.storage.from(EXPENSE_BUCKET).upload(path, blob, { contentType: type });
      if (up.error) continue;
      const ins = await supabase.from('expense_photos').insert({ expense_id: row.id, path });
      if (ins.error) await supabase.storage.from(EXPENSE_BUCKET).remove([path]);
      else ok++;
    }
    setBusy(false);
    setMsg(ok === list.length ? { ok: true, text: `Đã gắn ${ok} ảnh.` } : { ok: false, text: `Gắn được ${ok}/${list.length} ảnh. Ảnh lỗi có thể quá 10 MB.` });
    load();
    onChanged();
  }

  async function removePhoto(p) {
    if (!window.confirm('Xoá ảnh này?')) return;
    await supabase.storage.from(EXPENSE_BUCKET).remove([p.path]);
    await supabase.from('expense_photos').delete().eq('id', p.id);
    load();
    onChanged();
  }

  const s = row.status;
  return (
    <Modal title={`Phiếu chi ${expenseCode(row.expense_no)}`} onClose={onClose} width={780}>
      <div className="exp-flow" aria-label="Tiến trình duyệt">
        {['pending', 'approved', 'paid'].map((k, i) => {
          const order = ['pending', 'approved', 'paid'];
          const done = order.indexOf(s) >= i;
          return (
            <div key={k} className={`exp-step ${done ? 'done' : ''} ${s === k ? 'now' : ''}`}>
              <span className="exp-dot">{done ? '✓' : i + 1}</span>
              <strong>{expenseStatus[k]}</strong>
              <small>
                {k === 'pending' && `${row.created_by_name || '—'} · ${stamp(row.created_at)}`}
                {k === 'approved' && (row.approved_at ? `${row.approved_by_name || '—'} · ${stamp(row.approved_at)}` : 'Chưa duyệt')}
                {k === 'paid' && (row.paid_at ? `${row.paid_by_name || '—'} · ${stamp(row.paid_at)}` : 'Chưa thanh toán')}
              </small>
            </div>
          );
        })}
      </div>

      <dl className="detail">
        <div><dt>Mục đích chi</dt><dd><strong>{purposeOf(row)}</strong></dd></div>
        <div><dt>Số tiền</dt><dd><strong style={{ color: 'var(--err)' }}>{vnd(row.amount)}</strong></dd></div>
        <div><dt>Hình thức</dt><dd>{methodLabel[row.method]}{row.bank_accounts ? ` · ${row.bank_accounts.bank_name} ${row.bank_accounts.account_number}` : ''}</dd></div>
        <div><dt>Ngày chi</dt><dd>{dmy(row.expense_date)}</dd></div>
        <div style={{ gridColumn: '1 / -1' }}><dt>Giải trình</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{row.content || '—'}</dd></div>
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

      <div className="doc-head" style={{ marginTop: 18 }}>
        <h3 style={{ margin: 0 }}>Hoá đơn / ảnh thanh toán ({photos.length})</h3>
      </div>
      <DropZone id="x-add" wide disabled={busy} onFiles={add} label={busy ? 'Đang tải ảnh lên...' : 'Gắn thêm ảnh'} />
      {msg && <p className={msg.ok ? 'ok-msg' : 'err'} role="status">{msg.text}</p>}
      {photos.length ? (
        <ul className="thumbs">
          {photos.map((p) => (
            <li key={p.id}>
              {urls[p.path] ? (
                <a href={urls[p.path]} target="_blank" rel="noopener noreferrer" aria-label="Mở ảnh cỡ lớn">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urls[p.path]} alt="Hoá đơn / ảnh thanh toán" loading="lazy" />
                </a>
              ) : <div className="thumb-ph">Đang tải...</div>}
              <button type="button" className="thumb-del" onClick={() => removePhoto(p)} aria-label="Xoá ảnh này">✕</button>
            </li>
          ))}
        </ul>
      ) : <p className="muted small">Chưa có ảnh.</p>}

      <div className="modal-actions" style={{ marginTop: 16, flexWrap: 'wrap' }}>
        {manageAllExpenses && s !== 'pending' && <button className="btn btn-outline" style={{ marginRight: 'auto' }} onClick={() => onStatus(row, s === 'paid' ? 'approved' : 'pending')}>↩ Hoàn về {s === 'paid' ? 'Đã duyệt' : 'Chờ duyệt'}</button>}
        <button className="btn btn-outline" onClick={onClose}>Đóng</button>
        {mine && s === 'pending' && <button className="btn btn-outline" onClick={() => onEdit(row)}>Sửa phiếu</button>}
        {manageAllExpenses && s === 'pending' && <button className="btn btn-primary" onClick={() => onStatus(row, 'approved')}>Duyệt</button>}
        {manageAllExpenses && s === 'approved' && <button className="btn btn-primary" onClick={() => onStatus(row, 'paid')}>Đánh dấu Đã thanh toán</button>}
      </div>
    </Modal>
  );
}

export default function Page() {
  const { manageAllExpenses, userId } = useRole();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fType, setFType] = useState('');
  const [fMethod, setFMethod] = useState('');
  const [fRec, setFRec] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState(null); // null | { edit: row|null }
  const [notice, setNotice] = useState(null);
  const [cands, setCands] = useState([]);
  const [banks, setBanks] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('expenses')
      .select('*, vehicles(plate), bank_accounts(bank_name, account_number), bank_transactions(txn_time, has_time, amount, description), expense_photos(id)')
      .order('expense_date', { ascending: false })
      .order('expense_no', { ascending: false });
    if (error) {
      setErr('Chưa có bảng chi tiền. Hãy chạy supabase/expenses.sql trên Supabase.');
    } else {
      setErr('');
      setRows(data || []);
      const need = (data || []).filter((r) => r.method === 'transfer' && !r.bank_transaction_id);
      const [c, b] = await Promise.all([
        need.length
          ? supabase.from('bank_transactions').select('id, bank_account_id, amount, txn_time').in('amount', [...new Set(need.map((r) => -Number(r.amount)))]).limit(3000)
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
      if (fStatus && r.status !== fStatus) return false;
      if (fType && r.type !== fType) return false;
      if (fMethod && r.method !== fMethod) return false;
      if (fRec && recon[r.id]?.state !== fRec) return false;
      if (from && r.expense_date < from) return false;
      if (to && r.expense_date > to) return false;
      if (!s) return true;
      return [expenseCode(r.expense_no), purposeOf(r), r.content, r.created_by_name].some((v) => (v || '').toLowerCase().includes(s));
    });
  }, [rows, q, fStatus, fType, fMethod, fRec, from, to, recon]);

  const sums = useMemo(() => {
    const t = { all: { n: 0, v: 0 }, pending: { n: 0, v: 0 }, approved: { n: 0, v: 0 }, paid: { n: 0, v: 0 } };
    shown.forEach((r) => {
      t.all.n++; t.all.v += Number(r.amount);
      t[r.status].n++; t[r.status].v += Number(r.amount);
    });
    return t;
  }, [shown]);

  async function changeStatus(r, next) {
    const label = { approved: 'duyệt', paid: 'đánh dấu ĐÃ THANH TOÁN cho', pending: 'hoàn về CHỜ DUYỆT' };
    const text = next === 'pending'
      ? `Hoàn phiếu ${expenseCode(r.expense_no)} về Chờ duyệt? Thông tin duyệt sẽ bị xoá.`
      : next === 'approved' && r.status === 'paid'
        ? `Hoàn phiếu ${expenseCode(r.expense_no)} về Đã duyệt?`
        : `Xác nhận ${label[next]} phiếu ${expenseCode(r.expense_no)} (${vnd(r.amount)})?`;
    if (!window.confirm(text)) return;
    const { data: u } = await supabase.auth.getUser();
    const by = displayLogin(u?.user?.email);
    const patch = { status: next };
    if (next === 'approved' && r.status === 'pending') patch.approved_by_name = by;
    if (next === 'paid') patch.paid_by_name = by;
    const { error } = await supabase.from('expenses').update(patch).eq('id', r.id);
    if (error) return window.alert(error.code === 'P0001' ? error.message : 'Không đổi được trạng thái. Vui lòng thử lại.');
    setOpen(null);
    setNotice({ ok: true, text: `Phiếu ${expenseCode(r.expense_no)} → ${expenseStatus[next]}.` });
    load();
  }

  async function remove(r) {
    if (!window.confirm(`Xoá phiếu chi ${expenseCode(r.expense_no)} (${vnd(r.amount)})? Không thể hoàn tác.`)) return;
    const { data: ph } = await supabase.from('expense_photos').select('path').eq('expense_id', r.id);
    const { error } = await supabase.from('expenses').delete().eq('id', r.id);
    if (error) return window.alert(error.code === 'P0001' ? error.message : 'Không xoá được. Vui lòng thử lại.');
    if (ph?.length) await supabase.storage.from(EXPENSE_BUCKET).remove(ph.map((p) => p.path));
    load();
  }

  return (
    <>
      <div className="staff-head">
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Chi tiền</h1>
        <button className="btn btn-primary btn-lg" onClick={() => { setNotice(null); setForm({ edit: null }); }}>+ Đề xuất Chi</button>
      </div>

      <div className="kpis" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <div className="kpi"><span className="kpi-icon tone-err"><span aria-hidden="true">₫</span></span><span className="kpi-text"><span className="kpi-label">Tổng chi (theo bộ lọc)</span><span className="kpi-value">{vnd(sums.all.v)}</span><span className="kpi-sub">{sums.all.n} phiếu</span></span></div>
        <div className="kpi"><span className="kpi-icon tone-warn"><span aria-hidden="true">⏳</span></span><span className="kpi-text"><span className="kpi-label">Chờ duyệt</span><span className="kpi-value">{vnd(sums.pending.v)}</span><span className="kpi-sub">{sums.pending.n} phiếu</span></span></div>
        <div className="kpi"><span className="kpi-icon tone-blue"><span aria-hidden="true">✓</span></span><span className="kpi-text"><span className="kpi-label">Đã duyệt</span><span className="kpi-value">{vnd(sums.approved.v)}</span><span className="kpi-sub">{sums.approved.n} phiếu · chờ thanh toán</span></span></div>
        <div className="kpi"><span className="kpi-icon tone-ok"><span aria-hidden="true">✓✓</span></span><span className="kpi-text"><span className="kpi-label">Đã thanh toán</span><span className="kpi-value">{vnd(sums.paid.v)}</span><span className="kpi-sub">{sums.paid.n} phiếu</span></span></div>
      </div>

      <div className="toolbar">
        <input aria-label="Tìm kiếm" placeholder="Tìm theo mã phiếu, mục đích, nội dung, người tạo..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Trạng thái" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">Mọi trạng thái</option>
          {Object.entries(expenseStatus).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Loại chi" value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="">Mọi loại chi</option>
          {Object.entries(expenseTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Hình thức" value={fMethod} onChange={(e) => setFMethod(e.target.value)}>
          <option value="">Mọi hình thức</option>
          <option value="cash">Tiền mặt</option>
          <option value="transfer">Chuyển khoản</option>
        </select>
        <select aria-label="Đối chiếu sao kê" value={fRec} onChange={(e) => setFRec(e.target.value)}>
          <option value="">Mọi đối chiếu</option>
          <option value="ok">✓ Đã khớp sao kê</option>
          <option value="bad">✕ Chưa khớp sao kê</option>
        </select>
        <span className="date-filter">Từ <DateInput aria-label="Từ ngày" value={from} onChange={setFrom} /></span>
        <span className="date-filter">Đến <DateInput aria-label="Đến ngày" value={to} onChange={setTo} /></span>
      </div>

      {err && <p className="err" role="alert">{err}</p>}
      {notice && <p className={notice.ok ? 'ok-msg' : 'err'} role="status" style={{ marginBottom: 10 }}>{notice.text}</p>}

      <table className="cus-table exp-table">
        <thead>
          <tr>
            <th className="x-time">Thời gian</th>
            <th className="x-recon">Đối chiếu giao dịch</th>
            <th className="x-purpose">Mục đích chi</th>
            <th>Nội dung</th>
            <th className="x-method">Hình thức thanh toán</th>
            <th className="x-amt">Số tiền</th>
            <th className="x-status">Trạng thái</th>
            <th className="x-by">Người tạo</th>
            <th className="x-act"><span className="sr-only">Thao tác</span></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const rc = recon[r.id];
            return (
              <tr key={r.id}>
                <td className="x-time"><strong>{dmy(r.expense_date)}</strong><div className="muted small">{expenseCode(r.expense_no)} · {hm(r.created_at)}</div></td>
                <td className="x-recon">
                  {rc && (
                    <button
                      className={`recon-btn recon-${rc.state}`}
                      onClick={() => setOpen(r)}
                      title={rc.text}
                      aria-label={rc.state === 'ok' ? 'Đã khớp sao kê' : rc.state === 'bad' ? `Chưa khớp sao kê. ${rc.text}` : 'Tiền mặt, không đối chiếu với sao kê'}
                    >
                      {reconMark[rc.state]}
                    </button>
                  )}
                </td>
                <td className="x-purpose"><strong>{expenseTypes[r.type]}</strong>{needsVehicle(r.type) && r.vehicles?.plate && <div className="muted small">{r.vehicles.plate}</div>}</td>
                <td className="x-content">{r.content}</td>
                <td className="x-method">
                  <span className={`pill ${r.method === 'cash' ? 'pill-ok' : 'pill-blue'}`}>{methodLabel[r.method]}</span>
                  {r.bank_accounts && <div className="muted small">{r.bank_accounts.bank_name}</div>}
                </td>
                <td className="x-amt"><strong style={{ color: 'var(--err)' }}>{vnd(r.amount)}</strong></td>
                <td className="x-status"><StatusPill status={r.status} /></td>
                <td className="x-by">{r.created_by_name || '—'}</td>
                <td className="x-act">
                  <div className="actions">
                    <button className="btn btn-outline sm" onClick={() => setOpen(r)}>Xem</button>
                    {manageAllExpenses && r.status === 'pending' && <button className="btn btn-primary sm" onClick={() => changeStatus(r, 'approved')}>Duyệt</button>}
                    {manageAllExpenses && r.status === 'approved' && <button className="btn btn-primary sm" onClick={() => changeStatus(r, 'paid')}>Đã TT</button>}
                    {(manageAllExpenses || r.created_by === userId) && r.status === 'pending' && <button className="btn btn-outline sm" onClick={() => { setNotice(null); setForm({ edit: r }); }}>Sửa</button>}
                    {(manageAllExpenses || r.created_by === userId) && r.status === 'pending' && <button className="btn btn-danger sm" onClick={() => remove(r)}>Xoá</button>}
                  </div>
                </td>
              </tr>
            );
          })}
          {!loading && !shown.length && <tr><td colSpan={9} className="muted">Chưa có phiếu chi nào.</td></tr>}
          {loading && <tr><td colSpan={9} className="muted">Đang tải...</td></tr>}
        </tbody>
      </table>

      {open && (
        <Detail
          row={open}
          recon={recon[open.id]}
          onClose={() => setOpen(null)}
          onChanged={load}
          onEdit={(r) => { setOpen(null); setForm({ edit: r }); }}
          onStatus={changeStatus}
        />
      )}

      {form && (
        <ExpenseForm
          edit={form.edit}
          onClose={() => setForm(null)}
          onSaved={({ no, failedPhotos, edited }) => {
            setForm(null);
            setNotice({
              ok: !failedPhotos,
              text: `${edited ? 'Đã lưu thay đổi phiếu chi' : 'Đã gửi đề xuất chi'} ${expenseCode(no)}.${failedPhotos ? ` Có ${failedPhotos} ảnh chưa xử lý được, hãy mở phiếu để kiểm tra.` : ''}`,
            });
            load();
          }}
        />
      )}
    </>
  );
}
