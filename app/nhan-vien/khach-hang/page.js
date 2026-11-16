'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, customerTypes, vnd, customerCode } from '../../../lib/supabase';
import Modal from '../../../components/staff/Modal';

const blank = { name: '', phone: '', email: '', address: '', company: '', tax_code: '', type: 'le', note: '' };
const dmy = (ts) => (ts ? new Date(ts).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

// Công nợ theo khách = tổng cước các đơn của khách − tiền đã thu theo phiếu Thu.
// Đơn 1 điểm: cước của đơn; đơn nhiều điểm: cước của từng điểm trả thuộc khách đó.
function debtByCustomer(orders, paidItems) {
  const m = {};
  const row = (id) => (m[id] = m[id] || { fee: 0, paid: 0, debt: 0, orders: new Set() });
  const add = (id, v, orderId) => {
    if (!id) return;
    row(id).fee += Number(v || 0);
    row(id).orders.add(orderId);
  };
  orders.forEach((o) => {
    if (o.order_type === 'multi') (o.order_stops || []).forEach((s) => add(s.customer_id, s.fee, o.id));
    else add(o.customer_id, o.fee, o.id);
  });
  (paidItems || []).forEach((i) => {
    const cid = i.collections?.customer_id;
    if (cid) row(cid).paid += Number(i.amount || 0);
  });
  Object.values(m).forEach((r) => {
    r.debt = r.fee - r.paid;
  });
  return m;
}

export default function Page() {
  const [rows, setRows] = useState([]);
  const [debts, setDebts] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState('debt'); // debt | new | name
  const [editing, setEditing] = useState(null);
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, o, p] = await Promise.all([
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('id, order_type, customer_id, fee, order_stops(customer_id, fee)'),
      supabase.from('collection_items').select('amount, collections(customer_id)'),
    ]);
    if (c.error) setErr('Không tải được danh sách khách hàng.');
    else {
      setErr('');
      setRows(c.data);
    }
    if (!o.error) setDebts(debtByCustomer(o.data || [], p.error ? [] : p.data));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (!type || r.type === type) &&
        (!s || [r.name, r.phone, r.email, r.company, r.tax_code, r.address, customerCode(r.customer_no)].some((v) => (v || '').toLowerCase().includes(s)))
    );
    const debtOf = (r) => debts[r.id]?.debt || 0;
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'vi');
      if (sort === 'new') return (b.created_at || '').localeCompare(a.created_at || '');
      return debtOf(b) - debtOf(a) || a.name.localeCompare(b.name, 'vi');
    });
  }, [rows, q, type, sort, debts]);

  const totalDebt = useMemo(() => shown.reduce((a, r) => a + (debts[r.id]?.debt || 0), 0), [shown, debts]);

  async function save(e) {
    e.preventDefault();
    setFormErr('');
    if (!editing.name.trim() || !editing.phone.trim()) {
      setFormErr('Vui lòng nhập tên và số điện thoại.');
      return;
    }
    setBusy(true);
    const { id, created_at, customer_no, ...fields } = editing;
    const clean = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
    const { error } = id
      ? await supabase.from('customers').update(clean).eq('id', id)
      : await supabase.from('customers').insert(clean);
    setBusy(false);
    if (error) {
      setFormErr('Không lưu được. Vui lòng thử lại.');
      return;
    }
    setEditing(null);
    load();
  }

  async function remove(r) {
    if (!window.confirm(`Xoá khách hàng "${r.name}"? Thao tác này không thể hoàn tác.`)) return;
    const { error } = await supabase.from('customers').delete().eq('id', r.id);
    if (error) {
      window.alert(
        error.code === '23503'
          ? 'Không thể xoá: khách hàng này còn đơn hàng. Hãy xoá hoặc chuyển các đơn hàng trước.'
          : 'Không xoá được. Vui lòng thử lại.'
      );
      return;
    }
    load();
  }

  const set = (k) => (e) => setEditing((s) => ({ ...s, [k]: e.target.value }));
  const openEdit = (r) => {
    setFormErr('');
    const { created_at, customer_no, ...rest } = r || {};
    setEditing(r ? { ...blank, ...rest } : { ...blank });
  };

  return (
    <>
      <div className="staff-head">
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Khách hàng</h1>
        <button className="btn btn-primary" onClick={() => openEdit(null)}>+ Thêm khách hàng</button>
      </div>

      <div className="toolbar">
        <input aria-label="Tìm kiếm" placeholder="Tìm theo mã KH, tên, SĐT, công ty, MST..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Lọc theo loại khách" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Tất cả loại khách</option>
          {Object.entries(customerTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Sắp xếp" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="debt">Công nợ: nhiều → ít</option>
          <option value="new">Mới tạo trước</option>
          <option value="name">Tên A → Z</option>
        </select>
      </div>

      {err && <p className="err" role="alert">{err}</p>}

      <table className="cus-table">
        <thead>
          <tr>
            <th className="c-date">Ngày tạo</th>
            <th>Khách hàng</th>
            <th>Liên hệ</th>
            <th>Công ty / MST</th>
            <th>Địa chỉ</th>
            <th className="c-debt">Công nợ</th>
            <th className="c-act"><span className="sr-only">Thao tác</span></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const d = debts[r.id];
            return (
              <tr key={r.id}>
                <td className="c-date" data-label="Ngày tạo"><div>{dmy(r.created_at)}</div></td>
                <td data-label="Khách hàng">
                  <div>
                    <span className="cus-code">{customerCode(r.customer_no)}</span>
                    <strong className="c-name">{r.name}</strong>
                    <span className={`pill pill-type-${r.type}`}>{customerTypes[r.type]}</span>
                    {r.note && <div className="muted small c-note">{r.note}</div>}
                  </div>
                </td>
                <td data-label="Liên hệ">
                  <div>
                    <a href={`tel:${r.phone}`} className="c-phone">{r.phone}</a>
                    {r.email && <div className="muted small c-break">{r.email}</div>}
                  </div>
                </td>
                <td data-label="Công ty / MST">
                  <div>
                    {r.company || <span className="muted">—</span>}
                    {r.tax_code && <div className="muted small">MST: {r.tax_code}</div>}
                  </div>
                </td>
                <td data-label="Địa chỉ" className="c-break"><div>{r.address || <span className="muted">—</span>}</div></td>
                <td className="c-debt" data-label="Công nợ">
                  <div>
                    <strong className={d?.debt ? 'debt-has' : 'debt-zero'}>{vnd(d?.debt || 0)}</strong>
                    {d && <div className="muted small">{d.orders.size} đơn{d.paid > 0 ? ` · đã thu ${vnd(d.paid)}` : ''}</div>}
                  </div>
                </td>
                <td className="c-act">
                  <div className="actions">
                    <button className="btn btn-outline sm" onClick={() => openEdit(r)}>Sửa</button>
                    <button className="btn btn-danger sm" onClick={() => remove(r)}>Xoá</button>
                  </div>
                </td>
              </tr>
            );
          })}
          {!loading && !shown.length && <tr><td colSpan={7} className="muted">Chưa có khách hàng nào.</td></tr>}
          {loading && <tr><td colSpan={7} className="muted">Đang tải...</td></tr>}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={5}><strong>Tổng ({shown.length} khách hàng)</strong></td>
              <td className="c-debt" data-label="Tổng công nợ"><div><strong>{vnd(totalDebt)}</strong></div></td>
              <td className="c-act" />
            </tr>
          </tfoot>
        )}
      </table>

      {editing && (
        <Modal title={editing.id ? 'Sửa khách hàng' : 'Thêm khách hàng'} onClose={() => setEditing(null)}>
          <form className="form" onSubmit={save} noValidate>
            <div className="grid-2">
              <div className="field"><label htmlFor="f-name">Tên khách hàng *</label><input id="f-name" value={editing.name} onChange={set('name')} /></div>
              <div className="field"><label htmlFor="f-phone">Số điện thoại *</label><input id="f-phone" type="tel" value={editing.phone} onChange={set('phone')} /></div>
            </div>
            <div className="grid-2">
              <div className="field"><label htmlFor="f-email">Email</label><input id="f-email" type="email" value={editing.email || ''} onChange={set('email')} /></div>
              <div className="field">
                <label htmlFor="f-type">Phân loại</label>
                <select id="f-type" value={editing.type} onChange={set('type')}>
                  {Object.entries(customerTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="grid-2">
              <div className="field"><label htmlFor="f-company">Công ty</label><input id="f-company" value={editing.company || ''} onChange={set('company')} /></div>
              <div className="field"><label htmlFor="f-tax">Mã số thuế</label><input id="f-tax" value={editing.tax_code || ''} onChange={set('tax_code')} /></div>
            </div>
            <div className="field"><label htmlFor="f-addr">Địa chỉ</label><input id="f-addr" value={editing.address || ''} onChange={set('address')} /></div>
            <div className="field"><label htmlFor="f-note">Ghi chú</label><textarea id="f-note" rows={3} value={editing.note || ''} onChange={set('note')} /></div>
            {formErr && <p className="err" role="alert">{formErr}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>Huỷ</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
