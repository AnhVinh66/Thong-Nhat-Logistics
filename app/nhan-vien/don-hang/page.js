'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, vnd, orderCode } from '../../../lib/supabase';
import { drivers } from '../../../lib/site';
import Modal from '../../../components/staff/Modal';

const blankStop = { customer_id: '', address: '', cargo: '', weight: '', fee: '' };
const blank = {
  order_type: 'single',
  customer_id: '', pickup: '', delivery: '', cargo: '', weight: '', plate: '', driver: '', ship_date: '', fee: '',
  stops: [{ ...blankStop }, { ...blankStop }],
  oldStopIds: [],
};

const sortedStops = (r) => [...(r.order_stops || [])].sort((a, b) => a.position - b.position);

export default function Page() {
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [pickups, setPickups] = useState([]);
  const [pickMsg, setPickMsg] = useState(null); // { ok: bool, text }
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [o, c, v, p] = await Promise.all([
      supabase
        .from('orders')
        .select('*, customers(name, phone), order_stops(*, customers(name, phone))')
        .order('created_at', { ascending: false }),
      supabase.from('customers').select('id, name, phone').order('name'),
      supabase.from('vehicles').select('plate, payload_tons, volume_cbm').order('plate'),
      supabase.from('pickup_points').select('address').order('address'),
    ]);
    if (!v.error) setVehicles(v.data);
    if (!p.error) setPickups(p.data.map((x) => x.address));
    if (o.error || c.error) {
      setErr(
        o.error?.message?.includes('order_stops') || o.error?.code === 'PGRST200'
          ? 'Chưa có bảng điểm trả hàng. Hãy chạy file supabase/multi-stop.sql trong Supabase SQL Editor.'
          : 'Không tải được dữ liệu đơn hàng.'
      );
    } else {
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
    if (!s) return rows;
    return rows.filter((r) => {
      const fields = [orderCode(r.order_no), r.customers?.name, r.pickup, r.delivery, r.cargo, r.plate, r.driver];
      sortedStops(r).forEach((st) => fields.push(st.customers?.name, st.address, st.cargo));
      return fields.some((v) => (v || '').toLowerCase().includes(s));
    });
  }, [rows, q]);

  const totalFee = useMemo(() => shown.reduce((a, r) => a + Number(r.fee), 0), [shown]);

  const setField = (k) => (e) => setEditing((s) => ({ ...s, [k]: e.target.value }));
  const setStop = (i, k) => (e) =>
    setEditing((s) => ({ ...s, stops: s.stops.map((st, j) => (j === i ? { ...st, [k]: e.target.value } : st)) }));
  const addStop = () => setEditing((s) => ({ ...s, stops: [...s.stops, { ...blankStop }] }));
  const removeStop = (i) => setEditing((s) => ({ ...s, stops: s.stops.filter((_, j) => j !== i) }));

  async function savePickup() {
    const address = (editing?.pickup || '').trim();
    if (!address) return setPickMsg({ ok: false, text: 'Nhập điểm lấy hàng trước khi lưu.' });
    if (pickups.some((x) => x.toLowerCase() === address.toLowerCase())) {
      return setPickMsg({ ok: true, text: 'Điểm lấy hàng này đã có trong danh sách.' });
    }
    const { error } = await supabase.from('pickup_points').insert({ address });
    if (error) {
      return setPickMsg({
        ok: false,
        text: error.code === '23505'
          ? 'Điểm lấy hàng này đã có trong danh sách.'
          : 'Không lưu được. Hãy chạy supabase/pickup-points.sql trên Supabase rồi thử lại.',
      });
    }
    setPickups((s) => [...s, address].sort((a, b) => a.localeCompare(b, 'vi')));
    setPickMsg({ ok: true, text: 'Đã lưu điểm lấy hàng.' });
  }

  function openEdit(r) {
    setFormErr('');
    setPickMsg(null);
    if (!r) return setEditing({ ...blank, stops: [{ ...blankStop }, { ...blankStop }] });
    const stops = sortedStops(r).map((st) => ({
      customer_id: st.customer_id,
      address: st.address,
      cargo: st.cargo || '',
      weight: st.weight || '',
      fee: String(st.fee),
    }));
    setEditing({
      id: r.id,
      order_no: r.order_no,
      order_type: r.order_type || 'single',
      customer_id: r.customer_id || '',
      pickup: r.pickup || '',
      delivery: r.delivery || '',
      cargo: r.cargo || '',
      weight: r.weight || '',
      plate: r.plate || '',
      driver: r.driver || '',
      ship_date: r.ship_date || '',
      fee: String(r.fee),
      stops: stops.length ? stops : [{ ...blankStop }],
      oldStopIds: sortedStops(r).map((st) => st.id),
      truck: r.truck,
    });
  }

  async function save(e) {
    e.preventDefault();
    setFormErr('');
    const multi = editing.order_type === 'multi';
    if (!editing.pickup.trim()) return setFormErr('Vui lòng nhập điểm lấy hàng.');

    let stops = [];
    let fee = 0;
    if (multi) {
      if (!editing.stops.length) return setFormErr('Cần có ít nhất một điểm trả hàng.');
      for (let i = 0; i < editing.stops.length; i++) {
        const st = editing.stops[i];
        if (!st.customer_id || !st.address.trim()) return setFormErr(`Điểm trả #${i + 1}: vui lòng chọn khách hàng và nhập địa chỉ.`);
        const f = Number(st.fee || 0);
        if (f < 0 || Number.isNaN(f)) return setFormErr(`Điểm trả #${i + 1}: cước phí phải là số không âm.`);
      }
      stops = editing.stops.map((st, i) => ({
        position: i,
        customer_id: st.customer_id,
        address: st.address.trim(),
        cargo: st.cargo.trim() || null,
        weight: st.weight.trim() || null,
        fee: Number(st.fee || 0),
      }));
      fee = stops.reduce((a, st) => a + st.fee, 0);
    } else {
      if (!editing.customer_id) return setFormErr('Vui lòng chọn khách hàng.');
      if (!editing.delivery.trim()) return setFormErr('Vui lòng nhập điểm đến.');
      fee = Number(editing.fee || 0);
      if (fee < 0 || Number.isNaN(fee)) return setFormErr('Cước phí phải là số không âm.');
    }

    setBusy(true);
    const veh = vehicles.find((x) => x.plate === editing.plate);
    const payload = {
      order_type: editing.order_type,
      customer_id: multi ? null : editing.customer_id,
      pickup: editing.pickup.trim(),
      delivery: multi ? null : editing.delivery.trim(),
      cargo: multi ? null : editing.cargo?.trim() || null,
      weight: multi ? null : editing.weight?.trim() || null,
      truck: veh ? `Xe ${Number(veh.payload_tons)} tấn` : editing.truck || null,
      plate: editing.plate || null,
      driver: editing.driver?.trim() || null,
      ship_date: editing.ship_date || null,
      fee,
    };

    let failed = false;
    if (!editing.id) {
      const ins = await supabase.from('orders').insert(payload).select('id').single();
      if (ins.error) failed = true;
      else if (multi) {
        const s = await supabase.from('order_stops').insert(stops.map((st) => ({ ...st, order_id: ins.data.id })));
        if (s.error) {
          await supabase.from('orders').delete().eq('id', ins.data.id); // hoàn tác để không để lại đơn dở dang
          failed = true;
        }
      }
    } else if (!multi) {
      const up = await supabase.from('orders').update(payload).eq('id', editing.id);
      failed = !!up.error;
    } else {
      // Thêm điểm mới trước, cập nhật đơn, rồi mới xoá điểm cũ (lỗi giữa chừng không mất dữ liệu cũ)
      const s = await supabase.from('order_stops').insert(stops.map((st) => ({ ...st, order_id: editing.id }))).select('id');
      if (s.error) failed = true;
      else {
        const up = await supabase.from('orders').update(payload).eq('id', editing.id);
        if (up.error) {
          await supabase.from('order_stops').delete().in('id', s.data.map((x) => x.id));
          failed = true;
        } else if (editing.oldStopIds.length) {
          await supabase.from('order_stops').delete().in('id', editing.oldStopIds);
        }
      }
    }

    setBusy(false);
    if (failed) {
      return setFormErr(
        'Không lưu được. Nếu bạn vừa cập nhật tính năng nhiều điểm, hãy chạy supabase/multi-stop.sql trên Supabase rồi thử lại.'
      );
    }
    setEditing(null);
    load();
  }

  async function remove(r) {
    if (!window.confirm(`Xoá đơn hàng ${orderCode(r.order_no)}? Thao tác này không thể hoàn tác.`)) return;
    const { error } = await supabase.from('orders').delete().eq('id', r.id);
    if (error) return window.alert('Không xoá được. Vui lòng thử lại.');
    load();
  }

  const multi = editing?.order_type === 'multi';
  const liveTotal = editing && multi ? editing.stops.reduce((a, st) => a + Number(st.fee || 0), 0) : 0;
  const pickupField = (label) => (
    <div className="field">
      <label htmlFor="o-from">{label}</label>
      <div className="input-plus">
        <input
          id="o-from"
          list="pickup-list"
          value={editing.pickup}
          onChange={(e) => { setPickMsg(null); setField('pickup')(e); }}
          placeholder={pickups.length ? 'Chọn điểm đã lưu hoặc nhập mới' : 'Nhập địa chỉ lấy hàng'}
          autoComplete="off"
        />
        <button type="button" className="btn btn-outline plus-btn" onClick={savePickup} aria-label="Lưu điểm lấy hàng này" title="Lưu điểm lấy hàng này">+</button>
      </div>
      <datalist id="pickup-list">{pickups.map((x) => <option key={x} value={x} />)}</datalist>
      {pickMsg && <p className={pickMsg.ok ? 'ok-msg' : 'err'} role="status">{pickMsg.text}</p>}
    </div>
  );

  const customerOptions = (
    <>
      <option value="">Chọn khách hàng</option>
      {customers.map((c) => <option key={c.id} value={c.id}>{c.name} – {c.phone}</option>)}
    </>
  );

  return (
    <>
      <div className="staff-head">
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Đơn hàng</h1>
        <button
          className="btn btn-primary"
          onClick={() => openEdit(null)}
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
            {shown.map((r) => {
              const isMulti = r.order_type === 'multi';
              const stops = sortedStops(r);
              return (
                <Fragment key={r.id}>
                  <tr className={isMulti ? 'has-stops' : undefined}>
                    <td><strong>{orderCode(r.order_no)}</strong></td>
                    <td>
                      {isMulti ? (
                        <><span className="tag">Nhiều điểm</span><div className="muted small">{stops.length} điểm trả</div></>
                      ) : (
                        <>{r.customers?.name}<div className="muted small">{r.customers?.phone}</div></>
                      )}
                    </td>
                    <td>{r.pickup}<div className="muted small">{isMulti ? `→ ${stops.length} điểm trả hàng` : `→ ${r.delivery}`}</div></td>
                    <td>{!isMulti && r.cargo}{!isMulti && r.weight && <div className="muted small">{r.weight}</div>}</td>
                    <td>{r.truck}{(r.plate || r.driver) && <div className="muted small">{[r.plate, r.driver].filter(Boolean).join(' · ')}</div>}</td>
                    <td>{r.ship_date ? r.ship_date.split('-').reverse().join('/') : ''}</td>
                    <td className="num">{vnd(r.fee)}</td>
                    <td className="actions">
                      <button className="btn btn-outline sm" onClick={() => openEdit(r)}>Sửa</button>
                      <button className="btn btn-danger sm" onClick={() => remove(r)}>Xoá</button>
                    </td>
                  </tr>
                  {isMulti && (
                    <tr className="stops-row">
                      <td></td>
                      <td colSpan={7}>
                        <ol className="stop-list">
                          {stops.map((st) => (
                            <li key={st.id}>
                              <strong>{st.customers?.name}</strong>
                              <span className="muted"> ({st.customers?.phone})</span> – {st.address}
                              {(st.cargo || st.weight) && <span className="muted"> · {[st.cargo, st.weight].filter(Boolean).join(', ')}</span>}
                              <span className="stop-fee">{vnd(st.fee)}</span>
                            </li>
                          ))}
                        </ol>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!loading && !shown.length && <tr><td colSpan={8} className="muted">Chưa có đơn hàng nào.</td></tr>}
            {loading && <tr><td colSpan={8} className="muted">Đang tải...</td></tr>}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={6}><strong>Tổng ({shown.length} đơn)</strong></td>
                <td className="num"><strong>{vnd(totalFee)}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {editing && (
        <Modal title={editing.id ? `Sửa đơn hàng ${orderCode(editing.order_no)}` : 'Thêm đơn hàng'} onClose={() => setEditing(null)}>
          <form className="form" onSubmit={save} noValidate>
            <div>
              <p style={{ margin: '0 0 6px', fontWeight: 600 }}>Kiểu đơn hàng</p>
              {editing.id ? (
                <p style={{ margin: 0 }}><span className="tag">{multi ? 'Trả hàng nhiều điểm' : 'Trả hàng 1 điểm'}</span></p>
              ) : (
                <div className="seg" role="radiogroup" aria-label="Kiểu đơn hàng">
                  {[['single', 'Trả hàng 1 điểm'], ['multi', 'Trả hàng nhiều điểm']].map(([v, label]) => (
                    <button
                      type="button"
                      key={v}
                      role="radio"
                      aria-checked={editing.order_type === v}
                      className={editing.order_type === v ? 'on' : ''}
                      onClick={() => setEditing((s) => ({ ...s, order_type: v }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!multi && (
              <div className="field">
                <label htmlFor="o-cus">Khách hàng *</label>
                <select id="o-cus" value={editing.customer_id} onChange={setField('customer_id')}>{customerOptions}</select>
              </div>
            )}

            {multi ? (
              pickupField('Điểm lấy hàng (chung cho cả đơn) *')
            ) : (
              <div className="grid-2">
                {pickupField('Điểm lấy hàng *')}
                <div className="field"><label htmlFor="o-to">Điểm đến *</label><input id="o-to" value={editing.delivery} onChange={setField('delivery')} /></div>
              </div>
            )}

            {!multi && (
              <div className="grid-2">
                <div className="field"><label htmlFor="o-cargo">Loại hàng</label><input id="o-cargo" value={editing.cargo || ''} onChange={setField('cargo')} /></div>
                <div className="field"><label htmlFor="o-weight">Khối lượng</label><input id="o-weight" value={editing.weight || ''} onChange={setField('weight')} placeholder="VD: 3 tấn, 10 khối" /></div>
              </div>
            )}

            <div className="grid-2">
              <div className="field">
                <label htmlFor="o-plate">Xe (biển số – tải trọng)</label>
                <select id="o-plate" value={editing.plate || ''} onChange={setField('plate')}>
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
                <select id="o-driver" value={editing.driver || ''} onChange={setField('driver')}>
                  <option value="">Chưa chọn</option>
                  {editing.driver && !drivers.includes(editing.driver) && <option value={editing.driver}>{editing.driver}</option>}
                  {drivers.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            {multi ? (
              <div className="field"><label htmlFor="o-date">Ngày vận chuyển</label><input id="o-date" type="date" value={editing.ship_date || ''} onChange={setField('ship_date')} /></div>
            ) : (
              <div className="grid-2">
                <div className="field"><label htmlFor="o-date">Ngày vận chuyển</label><input id="o-date" type="date" value={editing.ship_date || ''} onChange={setField('ship_date')} /></div>
                <div className="field"><label htmlFor="o-fee">Cước phí (đồng)</label><input id="o-fee" type="number" min="0" inputMode="numeric" value={editing.fee} onChange={setField('fee')} /></div>
              </div>
            )}

            {multi && (
              <>
                <div className="stops-head">
                  <h3 style={{ margin: 0 }}>Các điểm trả hàng ({editing.stops.length})</h3>
                </div>
                {editing.stops.map((st, i) => (
                  <fieldset className="stop-card" key={i}>
                    <legend>Điểm trả #{i + 1}</legend>
                    <div className="field">
                      <label htmlFor={`s-cus-${i}`}>Khách hàng *</label>
                      <select id={`s-cus-${i}`} value={st.customer_id} onChange={setStop(i, 'customer_id')}>{customerOptions}</select>
                    </div>
                    <div className="field">
                      <label htmlFor={`s-addr-${i}`}>Địa chỉ trả hàng *</label>
                      <input id={`s-addr-${i}`} value={st.address} onChange={setStop(i, 'address')} />
                    </div>
                    <div className="grid-3" style={{ gap: 12 }}>
                      <div className="field"><label htmlFor={`s-cargo-${i}`}>Loại hàng</label><input id={`s-cargo-${i}`} value={st.cargo} onChange={setStop(i, 'cargo')} /></div>
                      <div className="field"><label htmlFor={`s-w-${i}`}>Khối lượng</label><input id={`s-w-${i}`} value={st.weight} onChange={setStop(i, 'weight')} placeholder="VD: 2 tấn" /></div>
                      <div className="field"><label htmlFor={`s-fee-${i}`}>Cước phí (đồng)</label><input id={`s-fee-${i}`} type="number" min="0" inputMode="numeric" value={st.fee} onChange={setStop(i, 'fee')} /></div>
                    </div>
                    {editing.stops.length > 1 && (
                      <button type="button" className="btn btn-danger sm" style={{ justifySelf: 'start' }} onClick={() => removeStop(i)}>
                        Xoá điểm này
                      </button>
                    )}
                  </fieldset>
                ))}
                <button type="button" className="btn btn-outline" onClick={addStop}>+ Thêm điểm</button>
                <p style={{ margin: 0 }}>Tổng cước cả đơn: <strong>{vnd(liveTotal)}</strong></p>
              </>
            )}

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
