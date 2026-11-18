'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, vnd, orderCode, stopCode } from '../../../lib/supabase';
import { drivers as defaultDrivers } from '../../../lib/site';
import { useRole } from '../../../components/staff/Role';
import Modal from '../../../components/staff/Modal';
import DateInput from '../../../components/DateInput';

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (iso) => new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const addDays = (iso, n) => { const d = parse(iso); d.setDate(d.getDate() + n); return isoOf(d); };
const mondayOf = (iso) => { const d = parse(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoOf(d); };
const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const DOW = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const cols = 'id, order_no, order_type, pickup, delivery, plate, truck, driver, ship_date, trip_seq, trip_period, status, fee, customers(name), order_stops(id, address, stop_no, position, status, customers(name))';

// Thứ tự trong một ô (xe + ngày): theo số chuyến đã xếp, chuyến chưa có số xếp sau theo mã đơn
const PERIODS = [
  { key: 'am', label: 'Sáng' },
  { key: 'pm', label: 'Chiều' },
  { key: '', label: 'Chưa chọn buổi' },
];
const periodLabel = (k) => (k === 'am' ? 'Sáng' : k === 'pm' ? 'Chiều' : '');
const rank = (o) => (o.trip_period === 'am' ? 0 : o.trip_period === 'pm' ? 1 : 2);
// Thứ tự trong một ô: Sáng -> Chiều -> chưa chọn buổi; trong mỗi buổi theo số chuyến đã xếp
const bySeq = (a, b) => rank(a) - rank(b) || (a.trip_seq ?? 1e9) - (b.trip_seq ?? 1e9) || a.order_no - b.order_no;

function routeOf(o) {
  if (o.order_type === 'multi') {
    const n = (o.order_stops || []).length;
    return `${o.pickup} → ${n} điểm trả`;
  }
  return `${o.pickup} → ${o.delivery}`;
}
const whoOf = (o) => (o.order_type === 'multi'
  ? [...new Set((o.order_stops || []).map((s) => s.customers?.name).filter(Boolean))].join(', ')
  : o.customers?.name) || '';

export default function Page() {
  const { editPlan } = useRole();
  const [today] = useState(() => isoOf(new Date()));
  const [monday, setMonday] = useState(() => mondayOf(isoOf(new Date())));
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState(defaultDrivers);
  const [week, setWeek] = useState([]); // đơn đã xếp xe, ngày trong tuần
  const [pending, setPending] = useState([]); // đơn chưa xếp xe hoặc chưa có ngày
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState(null);
  const [dlg, setDlg] = useState(null); // { order?, plate, date, pos, driver }
  const [busy, setBusy] = useState(false);
  const [dlgErr, setDlgErr] = useState('');

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);

  const load = useCallback(async () => {
    setLoading(true);
    const to = addDays(monday, 6);
    const [v, w, p, d] = await Promise.all([
      supabase.from('vehicles').select('plate, payload_tons, volume_cbm').order('plate'),
      supabase.from('orders').select(cols).not('plate', 'is', null).gte('ship_date', monday).lte('ship_date', to),
      supabase.from('orders').select(cols).or('plate.is.null,ship_date.is.null').order('created_at', { ascending: false }).limit(300),
      supabase.from('staff_roles').select('driver_name').eq('role', 'driver'),
    ]);
    if (v.error || w.error || p.error) {
      setErr(w.error?.message?.includes('trip_seq') || p.error?.message?.includes('trip_seq')
        ? 'Chưa bật Kế hoạch chạy xe. Hãy chạy file supabase/plan.sql trên Supabase.'
        : 'Không tải được dữ liệu kế hoạch chạy xe.');
    } else {
      setErr('');
      setVehicles(v.data || []);
      setWeek(w.data || []);
      setPending(p.data || []);
    }
    if (!d.error && d.data) {
      const names = d.data.map((x) => x.driver_name).filter(Boolean);
      setDrivers([...new Set([...names, ...defaultDrivers])].sort((a, b) => a.localeCompare(b, 'vi')));
    }
    setLoading(false);
  }, [monday]);

  useEffect(() => { load(); }, [load]);

  // Ô (xe + ngày) -> danh sách chuyến theo thứ tự
  const cells = useMemo(() => {
    const m = {};
    week.forEach((o) => { (m[`${o.plate}|${o.ship_date}`] = m[`${o.plate}|${o.ship_date}`] || []).push(o); });
    Object.values(m).forEach((l) => l.sort(bySeq));
    return m;
  }, [week]);

  // Hàng xe: danh sách xe + xe đã gán nhưng không còn trong danh sách
  const rowsV = useMemo(() => {
    const known = new Set(vehicles.map((v) => v.plate));
    const extra = [...new Set(week.map((o) => o.plate).filter((p) => !known.has(p)))].map((plate) => ({ plate, payload_tons: null, volume_cbm: null }));
    return [...vehicles, ...extra];
  }, [vehicles, week]);

  async function run(fn, okText) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) {
      setNotice({ ok: false, text: error.message || 'Không lưu được thay đổi.' });
      return false;
    }
    if (okText) setNotice({ ok: true, text: okText });
    await load();
    return true;
  }

  const move = (list, i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length || (list[j].trip_period || '') !== (list[i].trip_period || '')) return; // chỉ đổi thứ tự trong cùng buổi
    const ids = list.map((o) => o.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => supabase.rpc('plan_reorder', { p_orders: ids }));
  };

  // Mở hộp xếp xe: sửa chuyến đã có, hoặc thêm đơn vào ô (xe + ngày), hoặc xếp xe cho đơn chưa xếp
  function openDlg({ order = null, plate = '', date = '' }) {
    setDlgErr('');
    const pl = order?.plate || plate;
    const dt = order?.ship_date || date;
    const cellList = pl && dt ? (cells[`${pl}|${dt}`] || []) : [];
    const per = order ? order.trip_period || '' : (cellList.some((o) => o.trip_period === 'am') ? 'pm' : 'am');
    const band = cellList.filter((o) => (o.trip_period || '') === per);
    const idx = order ? band.findIndex((o) => o.id === order.id) : -1;
    const sameDriver = cellList[0]?.driver || '';
    setDlg({
      order,
      orderId: order?.id || '',
      plate: order?.plate || plate,
      date: order?.ship_date || date,
      driver: order?.driver || sameDriver,
      period: per,
      pos: idx >= 0 ? idx + 1 : null,
    });
  }

  // Số chuyến đã có trong ô đích (không tính chính đơn đang sửa) -> các vị trí chọn được
  const target = dlg && dlg.plate && dlg.date ? (cells[`${dlg.plate}|${dlg.date}`] || []).filter((o) => o.id !== dlg.orderId && (o.trip_period || '') === (dlg.period || '')) : [];

  async function saveDlg(e) {
    e.preventDefault();
    setDlgErr('');
    if (!dlg.orderId) return setDlgErr('Vui lòng chọn đơn hàng.');
    if (!dlg.plate) return setDlgErr('Vui lòng chọn xe.');
    if (!dlg.date) return setDlgErr('Vui lòng chọn ngày chạy.');
    const pos = dlg.pos && dlg.pos <= target.length ? dlg.pos : null; // null = cuối ngày
    const ok = await run(() => supabase.rpc('plan_assign', { p_order: dlg.orderId, p_plate: dlg.plate, p_driver: dlg.driver || null, p_date: dlg.date, p_pos: pos, p_period: dlg.period || null }), 'Đã lưu kế hoạch chạy xe.');
    if (ok) setDlg(null);
  }

  async function unassign() {
    if (!window.confirm('Bỏ xếp lịch chuyến này? Đơn hàng sẽ quay về danh sách "Chưa xếp xe".')) return;
    const ok = await run(() => supabase.rpc('plan_assign', { p_order: dlg.orderId, p_plate: '', p_driver: null, p_date: null, p_pos: null }), 'Đã bỏ xếp lịch chuyến.');
    if (ok) setDlg(null);
  }

  const weekCount = week.length;
  const isThisWeek = monday === mondayOf(today);

  if (err) {
    return (
      <>
        <h1 style={{ fontSize: '1.8rem' }}>Kế hoạch chạy xe</h1>
        <p className="err" role="alert">{err}</p>
      </>
    );
  }

  return (
    <>
      <div className="staff-head">
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Kế hoạch chạy xe</h1>
        <div className="plan-nav">
          <button className="btn btn-outline" onClick={() => setMonday(addDays(monday, -7))} aria-label="Tuần trước">‹ Tuần trước</button>
          <strong className="plan-range">{dmy(monday)} – {dmy(addDays(monday, 6))}</strong>
          <button className="btn btn-outline" onClick={() => setMonday(addDays(monday, 7))} aria-label="Tuần sau">Tuần sau ›</button>
          {!isThisWeek && <button className="btn btn-primary" onClick={() => setMonday(mondayOf(today))}>Tuần này</button>}
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        {weekCount} chuyến trong tuần · {pending.length} đơn chưa xếp xe.
        {editPlan ? ' Bấm vào một chuyến để đổi xe, ngày, tài xế; dùng ▲ ▼ để đổi thứ tự trong cùng buổi (Sáng / Chiều).' : ' Bạn chỉ có quyền xem kế hoạch.'}
      </p>
      {notice && <p className={notice.ok ? 'ok-msg' : 'err'} role="status" style={{ marginBottom: 10 }}>{notice.text}</p>}

      <div className="plan-wrap">
        <table className="plan-table">
          <thead>
            <tr>
              <th className="plan-veh">Xe</th>
              {days.map((d, i) => (
                <th key={d} className={d === today ? 'today' : undefined}>
                  {DOW[i]}<span>{dm(d)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowsV.map((v) => {
              const total = days.reduce((a, d) => a + (cells[`${v.plate}|${d}`]?.length || 0), 0);
              return (
                <tr key={v.plate}>
                  <th className="plan-veh" scope="row">
                    <strong>{v.plate}</strong>
                    <span>{v.payload_tons != null ? `${Number(v.payload_tons)} tấn` : 'Không còn trong DS xe'}{v.volume_cbm != null ? ` · ${Number(v.volume_cbm)} CBM` : ''}</span>
                    <span className="plan-count">{total} chuyến</span>
                  </th>
                  {days.map((d) => {
                    const list = cells[`${v.plate}|${d}`] || [];
                    return (
                      <td key={d} className={d === today ? 'today' : undefined}>
                        {list.map((o, i) => (
                          <Fragment key={o.id}>
                            {(i === 0 || (list[i - 1].trip_period || '') !== (o.trip_period || '')) && (list.some((x) => x.trip_period) || o.trip_period) && (
                              <div className={`trip-band band-${o.trip_period || 'none'}`}>{periodLabel(o.trip_period) || 'Chưa chọn buổi'}</div>
                            )}
                          <div className={`trip ${o.status === 'done' ? 'trip-done' : ''}`}>
                            <div className="trip-head">
                              <span className="trip-no" title={`Chuyến thứ ${i + 1} trong ngày`}>{i + 1}</span>
                              <strong>{orderCode(o.order_no)}</strong>
                              {editPlan && (
                                <span className="trip-move">
                                  <button type="button" disabled={busy || i === 0} onClick={() => move(list, i, -1)} aria-label="Chạy sớm hơn" title="Chạy sớm hơn">▲</button>
                                  <button type="button" disabled={busy || i === list.length - 1} onClick={() => move(list, i, 1)} aria-label="Chạy muộn hơn" title="Chạy muộn hơn">▼</button>
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              className="trip-body"
                              disabled={!editPlan}
                              onClick={() => openDlg({ order: o })}
                              title={editPlan ? 'Bấm để sửa chuyến' : undefined}
                            >
                              {o.order_type === 'multi' ? (() => {
                                const sts = [...(o.order_stops || [])].sort((a, b) => (a.stop_no ?? a.position) - (b.stop_no ?? b.position));
                                const doneN = sts.filter((s) => s.status === 'done').length;
                                return (
                                  <>
                                    <span className="trip-route">{o.pickup} → {sts.length} điểm trả</span>
                                    {o.driver && <span className="trip-drv">{o.driver}</span>}
                                    <ul className="trip-stops">
                                      {sts.map((s) => (
                                        <li key={s.id || s.stop_no} className={s.status === 'done' ? 'done' : 'open'}>
                                          <span className="ts-top">
                                            <span className="ts-code">{stopCode(o.order_no, s.stop_no)}</span>
                                            <span className="ts-state">{s.status === 'done' ? '✓ Xong' : 'Chưa xong'}</span>
                                          </span>
                                          <span className="ts-name">{s.customers?.name}{s.address ? ` – ${s.address}` : ''}</span>
                                        </li>
                                      ))}
                                    </ul>
                                    <span className={`trip-status ${o.status === 'done' ? 'done' : 'open'}`}>
                                      {o.status === 'done' ? '✓ Hoàn thành' : `Chưa hoàn thành · ${doneN}/${sts.length} điểm`}
                                    </span>
                                  </>
                                );
                              })() : (
                                <>
                                  <span className="trip-cus">{whoOf(o)}</span>
                                  <span className="trip-route">{routeOf(o)}</span>
                                  {o.driver && <span className="trip-drv">{o.driver}</span>}
                                  <span className={`trip-status ${o.status === 'done' ? 'done' : 'open'}`}>{o.status === 'done' ? '✓ Hoàn thành' : 'Chưa hoàn thành'}</span>
                                </>
                              )}
                            </button>
                          </div>
                          </Fragment>
                        ))}
                        {!list.length && !editPlan && <span className="muted small">—</span>}
                        {editPlan && (
                          <button type="button" className="trip-add" onClick={() => openDlg({ plate: v.plate, date: d })}>+ Thêm chuyến</button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {loading && <tr><td colSpan={8} className="muted">Đang tải...</td></tr>}
            {!loading && !rowsV.length && <tr><td colSpan={8} className="muted">Chưa có xe nào. Hãy thêm xe ở mục Danh sách xe.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 className="cd-title" style={{ marginTop: 26 }}>Đơn chưa xếp xe ({pending.length})</h2>
      <div className="table-wrap">
        <table className="fleet-table staff-table">
          <thead>
            <tr><th>Mã đơn</th><th>Khách hàng</th><th>Tuyến</th><th>Ngày dự kiến</th><th className="num">Cước</th>{editPlan && <th aria-label="Thao tác"></th>}</tr>
          </thead>
          <tbody>
            {pending.map((o) => (
              <tr key={o.id}>
                <td><Link href={`/nhan-vien/don-hang/?q=${orderCode(o.order_no)}`} className="code">{orderCode(o.order_no)}</Link></td>
                <td>{whoOf(o)}</td>
                <td>{routeOf(o)}{o.plate && <div className="muted small">Đã chọn xe {o.plate} nhưng chưa có ngày</div>}</td>
                <td>{o.ship_date ? dmy(o.ship_date) : <span className="muted">Chưa có ngày</span>}</td>
                <td className="num">{vnd(o.fee)}</td>
                {editPlan && <td className="actions"><button className="btn btn-primary sm" onClick={() => openDlg({ order: { ...o, id: o.id }, plate: o.plate || '', date: o.ship_date || '' })}>Xếp xe</button></td>}
              </tr>
            ))}
            {!loading && !pending.length && <tr><td colSpan={6} className="muted">Mọi đơn hàng đã được xếp xe.</td></tr>}
          </tbody>
        </table>
      </div>

      {dlg && (
        <Modal title={dlg.order && dlg.order.plate && dlg.order.ship_date ? `Sửa chuyến ${orderCode(dlg.order.order_no)}` : 'Xếp xe cho đơn hàng'} onClose={() => setDlg(null)}>
          <form className="form" onSubmit={saveDlg} noValidate>
            <div className="field">
              <label htmlFor="p-order">Đơn hàng *</label>
              {dlg.order ? (
                <div><strong>{orderCode(dlg.order.order_no)}</strong> – {whoOf(dlg.order)}<div className="muted small">{routeOf(dlg.order)}</div></div>
              ) : (
                <select id="p-order" value={dlg.orderId} onChange={(e) => setDlg((s) => ({ ...s, orderId: e.target.value }))}>
                  <option value="">— Chọn đơn chưa xếp xe —</option>
                  {pending.map((o) => <option key={o.id} value={o.id}>{orderCode(o.order_no)} – {whoOf(o)} – {routeOf(o)}</option>)}
                </select>
              )}
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="p-plate">Xe *</label>
                <select id="p-plate" value={dlg.plate} onChange={(e) => setDlg((s) => ({ ...s, plate: e.target.value, pos: null }))}>
                  <option value="">— Chọn xe —</option>
                  {rowsV.map((v) => <option key={v.plate} value={v.plate}>{v.plate}{v.payload_tons != null ? ` – ${Number(v.payload_tons)} tấn` : ''}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="p-date">Ngày chạy *</label>
                <DateInput id="p-date" value={dlg.date} onChange={(v) => setDlg((s) => ({ ...s, date: v, pos: null }))} />
              </div>
            </div>
            <div className="field">
              <label>Buổi chạy</label>
              <div className="seg" role="radiogroup" aria-label="Buổi chạy">
                {PERIODS.map((p) => (
                  <button
                    key={p.key || 'none'}
                    type="button"
                    role="radio"
                    aria-checked={(dlg.period || '') === p.key}
                    className={`seg-btn ${(dlg.period || '') === p.key ? 'on' : ''}`}
                    onClick={() => setDlg((s) => ({ ...s, period: p.key, pos: null }))}
                  >{p.label}</button>
                ))}
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="p-driver">Tài xế</label>
                <select id="p-driver" value={dlg.driver || ''} onChange={(e) => setDlg((s) => ({ ...s, driver: e.target.value }))}>
                  <option value="">— Chưa chọn —</option>
                  {dlg.driver && !drivers.includes(dlg.driver) && <option value={dlg.driver}>{dlg.driver}</option>}
                  {drivers.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="p-pos">Thứ tự chạy trong {dlg.period === 'am' ? 'buổi sáng' : dlg.period === 'pm' ? 'buổi chiều' : 'ngày'}</label>
                <select id="p-pos" value={dlg.pos && dlg.pos <= target.length ? dlg.pos : target.length + 1} onChange={(e) => setDlg((s) => ({ ...s, pos: Number(e.target.value) }))}>
                  {Array.from({ length: target.length + 1 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      Chuyến {i + 1}{i === target.length ? (dlg.period ? ' (cuối buổi)' : ' (cuối ngày)') : ` (trước ${orderCode(target[i].order_no)})`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {dlgErr && <p className="err" role="alert">{dlgErr}</p>}
            <div className="modal-actions">
              {dlg.order?.plate && dlg.order?.ship_date && <button type="button" className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={unassign} disabled={busy}>Bỏ xếp lịch</button>}
              <button type="button" className="btn btn-outline" onClick={() => setDlg(null)}>Huỷ</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
