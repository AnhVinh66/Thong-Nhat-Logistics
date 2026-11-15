'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, vnd, orderCode } from '../../../lib/supabase';
import { drivers } from '../../../lib/site';
import Modal from '../../../components/staff/Modal';

const blank = {
  customer_id: '', pickup: '', delivery: '', cargo: '', weight: '', plate: '', driver: '', ship_date: '', fee: '',
};

export default function Page() {
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [o, c, v] = await Promise.all([
      supabase.from('orders').select('*, customers(name, phone)').order('created_at', { ascending: false }),
      supabase.from('customers').select('id, name, phone').order('name'),
      supabase.from('vehicles').select('plate, payload_tons, volume_cbm').order('plate'),
    ]);
    if (!v.error) setVehicles(v.data);
    if (o.error || c.error) setErr('Không tải được dữ liệu đơn hàng.');
    else {
      setErr('');
      setRows(o.data);
      setCustomers(c.data);
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
        (!s ||
          [orderCode(r.order_no), r.customers?.name, r.pickup, r.delivery, r.cargo, r.plate, r.driver].some((v) =>
            (v || '').toLowerCase().includes(s)
          ))
    );
  }, [rows, q]);

  const totals = useMemo(
    () => ({
      fee: shown.reduce((a, r) => a + Number(r.fee), 0),
    }),
    [shown]
  );

  async function save(e) {
    e.preventDefault();
    setFormErr('');
    if (!editing.customer_id) return setFormErr('Vui lòng chọn khách hàng.');
    if (!editing.pickup.trim() || !editing.delivery.trim()) return setFormErr('Vui lòng nhập điểm đi và điểm đến.');
    const fee = Number(editing.fee || 0);
    if (fee < 0 || Number.isNaN(fee)) return setFormErr('Cước phí phải là số không âm.');
    setBusy(true);
    const veh = vehicles.find((x) => x.plate === editing.plate);
    const payload = {
      customer_id: editing.customer_id,
      pickup: editing.pickup.trim(),
      delivery: editing.delivery.trim(),
      cargo: editing.cargo?.trim() || null,
      weight: editing.weight?.trim() || null,
      truck: veh ? `Xe ${Number(veh.payload_tons)} tấn` : editing.truck || null,
      plate: editing.plate || null,
      driver: editing.driver?.trim() || null,
      ship_date: editing.ship_date || null,
      fee,
    };
    const { error } = editing.id
      ? await supabase.from('orders').update(payload).eq('id', editing.id)
      : await supabase.from('orders').insert(payload);
    setBusy(false);
    if (error) return setFormErr('Không lưu được. Vui lòng thử lại.');
    setEditing(null);
    load();
  }

  async function remove(r) {
    if (!window.confirm(`Xoá đơn hàng ${orderCode(r.order_no)}? Thao tác này không thể hoàn tác.`)) return;
    const { error } = await supabase.from('orders').delete().eq('id', r.id);
    if (error) return window.alert('Không xoá được. Vui lòng thử lại.');
    load();
  }

  const set = (k) => (e) => setEditing((s) => ({ ...s, [k]: e.target.value }));

  return (
    <>
      <div className="staff-head">
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Đơn hàng</h1>
        <button
          className="btn btn-primary"
          onClick={() => { setFormErr(''); setEditing({ ...blank }); }}
          disabled={!customers.length}
          title={!customers.length ? 'Hãy thêm khách hàng trước' : undefined}
        >
          + Thêm đơn hàng
        </button>
      </div>
      {!loading && !customers.length && <p className="muted">Cần có ít nhất một khách hàng trước khi tạo đơn hàng.</p>}

      <div className="toolbar">
        <input aria-label="Tìm kiếm" placeholder="Tìm theo mã đơn, khách, tuyến, biển số, tài xế..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {err && <p className="err" role="alert">{err}</p>}
      <div className="table-wrap">
        <table className="fleet-table staff-table">
          <thead>
            <tr>
              <th>Mã</th><th>Khách hàng</th><th>Tuyến</th><th>Hàng</th><th>Xe / Tài xế</th><th>Ngày</th>
              <th className="num">Cước</th><th aria-label="Thao tác"></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td><strong>{orderCode(r.order_no)}</strong></td>
                <td>{r.customers?.name}<div className="muted small">{r.customers?.phone}</div></td>
                <td>{r.pickup}<div className="muted small">→ {r.delivery}</div></td>
                <td>{r.cargo}{r.weight && <div className="muted small">{r.weight}</div>}</td>
                <td>{r.truck}{(r.plate || r.driver) && <div className="muted small">{[r.plate, r.driver].filter(Boolean).join(' · ')}</div>}</td>
                <td>{r.ship_date ? r.ship_date.split('-').reverse().join('/') : ''}</td>
                <td className="num">{vnd(r.fee)}</td>
                <td className="actions">
                  <button className="btn btn-outline sm" onClick={() => { setFormErr(''); setEditing({ ...blank, ...r, fee: String(r.fee), ship_date: r.ship_date || '' }); }}>Sửa</button>
                  <button className="btn btn-danger sm" onClick={() => remove(r)}>Xoá</button>
                </td>
              </tr>
            ))}
            {!loading && !shown.length && <tr><td colSpan={8} className="muted">Chưa có đơn hàng nào.</td></tr>}
            {loading && <tr><td colSpan={8} className="muted">Đang tải...</td></tr>}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={6}><strong>Tổng ({shown.length} đơn)</strong></td>
                <td className="num"><strong>{vnd(totals.fee)}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {editing && (
        <Modal title={editing.id ? `Sửa đơn hàng ${orderCode(editing.order_no)}` : 'Thêm đơn hàng'} onClose={() => setEditing(null)}>
          <form className="form" onSubmit={save} noValidate>
            <div className="field">
              <label htmlFor="o-cus">Khách hàng *</label>
              <select id="o-cus" value={editing.customer_id} onChange={set('customer_id')}>
                <option value="">Chọn khách hàng</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name} – {c.phone}</option>)}
              </select>
            </div>
            <div className="grid-2">
              <div className="field"><label htmlFor="o-from">Điểm đi *</label><input id="o-from" value={editing.pickup} onChange={set('pickup')} /></div>
              <div className="field"><label htmlFor="o-to">Điểm đến *</label><input id="o-to" value={editing.delivery} onChange={set('delivery')} /></div>
            </div>
            <div className="grid-2">
              <div className="field"><label htmlFor="o-cargo">Loại hàng</label><input id="o-cargo" value={editing.cargo || ''} onChange={set('cargo')} /></div>
              <div className="field"><label htmlFor="o-weight">Khối lượng</label><input id="o-weight" value={editing.weight || ''} onChange={set('weight')} placeholder="VD: 3 tấn, 10 khối" /></div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="o-plate">Xe (biển số – tải trọng)</label>
                <select id="o-plate" value={editing.plate || ''} onChange={set('plate')}>
                  <option value="">Chưa chọn</option>
                  {editing.plate && !vehicles.some((x) => x.plate === editing.plate) && <option value={editing.plate}>{editing.plate}</option>}
                  {vehicles.map((x) => (
                    <option key={x.plate} value={x.plate}>
                      {x.plate}{x.payload_tons != null ? ` – ${Number(x.payload_tons)} tấn` : ''}{x.volume_cbm != null ? ` (${Number(x.volume_cbm)} CBM)` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="o-driver">Tài xế</label>
                <select id="o-driver" value={editing.driver || ''} onChange={set('driver')}>
                  <option value="">Chưa chọn</option>
                  {editing.driver && !drivers.includes(editing.driver) && <option value={editing.driver}>{editing.driver}</option>}
                  {drivers.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div className="grid-2">
              <div className="field"><label htmlFor="o-date">Ngày vận chuyển</label><input id="o-date" type="date" value={editing.ship_date || ''} onChange={set('ship_date')} /></div>
              <div className="field"><label htmlFor="o-fee">Cước phí (đồng)</label><input id="o-fee" type="number" min="0" inputMode="numeric" value={editing.fee} onChange={set('fee')} /></div>
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
