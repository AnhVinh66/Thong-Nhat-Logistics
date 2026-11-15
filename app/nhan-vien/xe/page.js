'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import Modal from '../../../components/staff/Modal';

const blank = { plate: '', volume_cbm: '', payload_tons: '', length_m: '', width_m: '', height_m: '' };
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const fmt = (v) => (v === null || v === undefined ? '' : String(Number(v)));
const size = (r) =>
  r.length_m != null && r.width_m != null && r.height_m != null
    ? `${Number(r.length_m).toFixed(2)} x ${Number(r.width_m).toFixed(2)} x ${Number(r.height_m).toFixed(2)} (m)`
    : '';

export default function Page() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('vehicles').select('*').order('plate');
    if (error) setErr('Không tải được danh sách xe. Kiểm tra đã chạy supabase/vehicles.sql chưa.');
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
    return rows.filter((r) => !s || r.plate.toLowerCase().includes(s));
  }, [rows, q]);

  function openEdit(r) {
    setFormErr('');
    setEditing(
      r
        ? {
            id: r.id,
            plate: r.plate,
            volume_cbm: fmt(r.volume_cbm),
            payload_tons: fmt(r.payload_tons),
            length_m: fmt(r.length_m),
            width_m: fmt(r.width_m),
            height_m: fmt(r.height_m),
          }
        : { ...blank }
    );
  }

  async function save(e) {
    e.preventDefault();
    setFormErr('');
    if (!editing.plate.trim()) return setFormErr('Vui lòng nhập biển số xe.');
    const vals = ['volume_cbm', 'payload_tons', 'length_m', 'width_m', 'height_m'].map((k) => num(editing[k]));
    if (vals.some((v) => v !== null && (Number.isNaN(v) || v < 0))) return setFormErr('Các giá trị số phải là số không âm.');
    setBusy(true);
    const payload = {
      plate: editing.plate.trim().toUpperCase(),
      volume_cbm: vals[0],
      payload_tons: vals[1],
      length_m: vals[2],
      width_m: vals[3],
      height_m: vals[4],
    };
    const { error } = editing.id
      ? await supabase.from('vehicles').update(payload).eq('id', editing.id)
      : await supabase.from('vehicles').insert(payload);
    setBusy(false);
    if (error) return setFormErr(error.code === '23505' ? 'Biển số này đã có trong danh sách.' : 'Không lưu được. Vui lòng thử lại.');
    setEditing(null);
    load();
  }

  async function remove(r) {
    if (!window.confirm(`Xoá xe ${r.plate}? Thao tác này không thể hoàn tác.`)) return;
    const { error } = await supabase.from('vehicles').delete().eq('id', r.id);
    if (error) return window.alert('Không xoá được. Vui lòng thử lại.');
    load();
  }

  const set = (k) => (e) => setEditing((s) => ({ ...s, [k]: e.target.value }));
  const numInput = (id, label, k, step = '0.01') => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" min="0" step={step} inputMode="decimal" value={editing[k]} onChange={set(k)} />
    </div>
  );

  return (
    <>
      <div className="staff-head">
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Danh sách xe</h1>
        <button className="btn btn-primary" onClick={() => openEdit(null)}>+ Thêm xe</button>
      </div>

      <div className="toolbar">
        <input aria-label="Tìm theo biển số" placeholder="Tìm theo biển số xe..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {err && <p className="err" role="alert">{err}</p>}
      <div className="table-wrap">
        <table className="fleet-table staff-table">
          <thead>
            <tr>
              <th>Biển số xe</th>
              <th>Khối lượng hàng</th>
              <th>Tải trọng xe</th>
              <th>Kích thước thùng</th>
              <th aria-label="Thao tác"></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.plate}</strong></td>
                <td>{r.volume_cbm != null && `${Number(r.volume_cbm)} CBM`}</td>
                <td>{r.payload_tons != null && `${Number(r.payload_tons)} tấn`}</td>
                <td>{size(r)}</td>
                <td className="actions">
                  <button className="btn btn-outline sm" onClick={() => openEdit(r)}>Sửa</button>
                  <button className="btn btn-danger sm" onClick={() => remove(r)}>Xoá</button>
                </td>
              </tr>
            ))}
            {!loading && !shown.length && <tr><td colSpan={5} className="muted">Chưa có xe nào.</td></tr>}
            {loading && <tr><td colSpan={5} className="muted">Đang tải...</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted small">{shown.length} / {rows.length} xe</p>

      {editing && (
        <Modal title={editing.id ? 'Sửa xe' : 'Thêm xe'} onClose={() => setEditing(null)}>
          <form className="form" onSubmit={save} noValidate>
            <div className="field">
              <label htmlFor="v-plate">Biển số xe *</label>
              <input id="v-plate" value={editing.plate} onChange={set('plate')} placeholder="VD: 29E-373.03" />
            </div>
            <div className="grid-2">
              {numInput('v-cbm', 'Khối lượng hàng (CBM)', 'volume_cbm')}
              {numInput('v-ton', 'Tải trọng xe (tấn)', 'payload_tons')}
            </div>
            <p style={{ margin: 0, fontWeight: 600 }}>Kích thước thùng (m)</p>
            <div className="grid-3" style={{ gap: 12 }}>
              {numInput('v-l', 'Dài', 'length_m')}
              {numInput('v-w', 'Rộng', 'width_m')}
              {numInput('v-h', 'Cao', 'height_m')}
            </div>
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
