'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, customerTypes } from '../../../lib/supabase';
import Modal from '../../../components/staff/Modal';

const blank = { name: '', phone: '', email: '', address: '', company: '', tax_code: '', type: 'le', note: '' };

export default function Page() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [editing, setEditing] = useState(null); // null | {id?, ...fields}
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
    if (error) setErr('Không tải được danh sách khách hàng.');
    else {
      setErr('');
      setRows(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!type || r.type === type) &&
        (!s || [r.name, r.phone, r.email, r.company, r.tax_code, r.address].some((v) => (v || '').toLowerCase().includes(s)))
    );
  }, [rows, q, type]);

  async function save(e) {
    e.preventDefault();
    setFormErr('');
    if (!editing.name.trim() || !editing.phone.trim()) {
      setFormErr('Vui lòng nhập tên và số điện thoại.');
      return;
    }
    setBusy(true);
    const { id, created_at, ...fields } = editing;
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

  return (
    <>
      <div className="staff-head">
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Khách hàng</h1>
        <button className="btn btn-primary" onClick={() => { setFormErr(''); setEditing({ ...blank }); }}>+ Thêm khách hàng</button>
      </div>

      <div className="toolbar">
        <input aria-label="Tìm kiếm" placeholder="Tìm theo tên, SĐT, công ty, MST..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Lọc theo loại khách" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Tất cả loại khách</option>
          {Object.entries(customerTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {err && <p className="err" role="alert">{err}</p>}
      <div className="table-wrap">
        <table className="fleet-table staff-table">
          <thead>
            <tr><th>Tên</th><th>Loại</th><th>SĐT</th><th>Email</th><th>Công ty / MST</th><th>Địa chỉ</th><th aria-label="Thao tác"></th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.name}</strong>{r.note && <div className="muted small">{r.note}</div>}</td>
                <td>{customerTypes[r.type]}</td>
                <td><a href={`tel:${r.phone}`}>{r.phone}</a></td>
                <td>{r.email}</td>
                <td>{r.company}{r.tax_code && <div className="muted small">MST: {r.tax_code}</div>}</td>
                <td>{r.address}</td>
                <td className="actions">
                  <button className="btn btn-outline sm" onClick={() => { setFormErr(''); setEditing({ ...blank, ...r }); }}>Sửa</button>
                  <button className="btn btn-danger sm" onClick={() => remove(r)}>Xoá</button>
                </td>
              </tr>
            ))}
            {!loading && !shown.length && <tr><td colSpan={7} className="muted">Chưa có khách hàng nào.</td></tr>}
            {loading && <tr><td colSpan={7} className="muted">Đang tải...</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted small">{shown.length} / {rows.length} khách hàng</p>

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
