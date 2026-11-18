'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, vnd, orderCode, stopCode, fmtDate } from '../../../lib/supabase';
import MoneyInput from '../../../components/staff/MoneyInput';
import FeePopup from '../../../components/staff/FeePopup';
import { drivers as defaultDrivers } from '../../../lib/site';
import Modal from '../../../components/staff/Modal';
import DateInput from '../../../components/DateInput';
import { useRole } from '../../../components/staff/Role';
import DeliveryDocs, { removeDocFiles } from '../../../components/staff/DeliveryDocs';

const blankStop = { customer_id: '', address: '', cargo: '', weight: '', fee: '', toll_fee: '', parking_fee: '' };
const blank = {
  order_type: 'single',
  customer_id: '', pickup: '', delivery: '', cargo: '', weight: '', plate: '', driver: '', ship_date: '', fee: '', toll_fee: '', parking_fee: '',
  stops: [{ ...blankStop }, { ...blankStop }],
  oldStopIds: [],
};

// Đã thu bao nhiêu / còn lại (chỉ hiện khi đơn đã có phiếu Thu)
function PaidInfo({ fee, paid }) {
  const p = Number(paid || 0);
  if (!p) return null;
  const left = Number(fee || 0) - p;
  return (
    <span className="paid-info">
      <span className="paid-ok">Đã thu {vnd(p)}</span>
      {left > 0 ? <span className="paid-left">Còn {vnd(left)}</span> : <span className="paid-ok">Đã thu đủ</span>}
    </span>
  );
}

// Phí cầu đường / bến bãi hiển thị dưới cước (chỉ khi có phát sinh)
function Extras({ toll, park }) {
  const t = Number(toll || 0);
  const k = Number(park || 0);
  if (!t && !k) return null;
  return (
    <span className="extras">
      {t > 0 && <span>Cầu đường {vnd(t)}</span>}
      {k > 0 && <span>Bến bãi {vnd(k)}</span>}
    </span>
  );
}

const sortedStops = (r) => [...(r.order_stops || [])].sort((a, b) => a.position - b.position);

export default function Page() {
  const { addOrder, editOrder, deleteOrder, completeOrder } = useRole();
  const [fStatus, setFStatus] = useState(''); // '' | incomplete | done
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [pickups, setPickups] = useState([]);
  const [drivers, setDrivers] = useState(defaultDrivers);
  const [pickMsg, setPickMsg] = useState(null); // { ok: bool, text }
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [photoCounts, setPhotoCounts] = useState({}); // "orderId|stopId" -> số ảnh
  const [docsFor, setDocsFor] = useState(null); // { orderId, stopId, title }
  const [paid, setPaid] = useState({ byOrder: {}, byCustomer: {} }); // tiền đã thu theo đơn / theo (đơn|khách)

  const loadCounts = useCallback(async () => {
    const { data, error } = await supabase.from('delivery_photos').select('order_id, stop_id');
    if (error) return;
    const m = {};
    data.forEach((p) => {
      const k = `${p.order_id}|${p.stop_id || ''}`;
      m[k] = (m[k] || 0) + 1;
    });
    setPhotoCounts(m);
  }, []);

  // Đơn đã có đủ chứng từ (biên bản giao nhận hoặc bill) để được Hoàn thành?
  const hasDocs = (r) => {
    if (r.order_type === 'multi') {
      const st = r.order_stops || [];
      return st.length > 0 && st.every((s) => photoCounts[`${r.id}|${s.id}`] > 0);
    }
    return photoCounts[`${r.id}|`] > 0;
  };

  async function setStatus(r, done) {
    setNotice(null);
    if (done && !hasDocs(r)) {
      setNotice({ ok: false, text: `${orderCode(r.order_no)} chưa thể Hoàn thành: cần có biên bản giao nhận hoặc bill thanh toán${r.order_type === 'multi' ? ' ở mỗi điểm trả' : ''}. Bấm nút Chứng từ để thêm ảnh.` });
      return;
    }
    const { error } = await supabase.rpc('set_order_status', { p_order: r.id, p_done: done });
    if (error) {
      setNotice({ ok: false, text: error.message?.includes('set_order_status') ? 'Chưa bật tính năng Trạng thái. Hãy chạy supabase/order-status.sql trên Supabase.' : error.message || 'Không đổi được trạng thái.' });
      return;
    }
    setNotice({ ok: true, text: `${orderCode(r.order_no)}: ${done ? 'Hoàn thành' : 'Chưa hoàn thành'}.` });
    load();
  }

  const loadPaid = useCallback(async () => {
    const { data, error } = await supabase.from('collection_items').select('order_id, amount, collections(customer_id)');
    if (error) return;
    const byOrder = {};
    const byCustomer = {};
    data.forEach((i) => {
      byOrder[i.order_id] = (byOrder[i.order_id] || 0) + Number(i.amount);
      const k = `${i.order_id}|${i.collections?.customer_id}`;
      byCustomer[k] = (byCustomer[k] || 0) + Number(i.amount);
    });
    setPaid({ byOrder, byCustomer });
  }, []);

  const load = useCallback(async () => {
    loadCounts();
    loadPaid();
    // Tài xế = các tài khoản có vai trò Lái xe (cộng thêm danh sách mặc định trong lib/site.js)
    supabase.from('staff_roles').select('driver_name').eq('role', 'driver').then(({ data, error }) => {
      if (error || !data) return;
      const names = data.map((d) => d.driver_name).filter(Boolean);
      setDrivers([...new Set([...names, ...defaultDrivers])].sort((a, b) => a.localeCompare(b, 'vi')));
    });
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
  }, [loadCounts, loadPaid]);

  useEffect(() => {
    load();
  }, [load]);

  // Mở từ trang Tổng quan: ?q=DH0012 (lọc sẵn đơn) hoặc ?new=1 (mở form tạo đơn)
  const [wantNew, setWantNew] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('q')) setQ(p.get('q'));
    if (p.get('new') === '1') setWantNew(true);
  }, []);
  useEffect(() => {
    if (!wantNew || !customers.length) return;
    setWantNew(false);
    openEdit(null);
    window.history.replaceState(null, '', window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantNew, customers.length]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = fStatus ? rows.filter((r) => (r.status || 'incomplete') === fStatus) : rows;
    if (!s) return list;
    return list.filter((r) => {
      const fields = [orderCode(r.order_no), r.customers?.name, r.pickup, r.delivery, r.cargo, r.plate, r.driver];
      sortedStops(r).forEach((st) => fields.push(stopCode(r.order_no, st.stop_no), st.customers?.name, st.address, st.cargo));
      return fields.some((v) => (v || '').toLowerCase().includes(s));
    });
  }, [rows, q, fStatus]);

  const totalFee = useMemo(() => shown.reduce((a, r) => a + Number(r.fee), 0), [shown]);

  const setField = (k) => (e) => setEditing((s) => ({ ...s, [k]: e.target.value }));
  const setStop = (i, k) => (e) =>
    setEditing((s) => ({ ...s, stops: s.stops.map((st, j) => (j === i ? { ...st, [k]: e.target.value } : st)) }));
  const setStopVal = (i, k) => (v) => setEditing((s) => ({ ...s, stops: s.stops.map((st, j) => (j === i ? { ...st, [k]: v } : st)) }));
  const addStop = () => setEditing((s) => ({ ...s, stops: [...s.stops, { ...blankStop }] }));
  const removeStop = (i) => {
    const st = editing.stops[i];
    const n = st.id ? photoCounts[`${editing.id}|${st.id}`] || 0 : 0;
    if (n && !window.confirm(`Điểm trả #${i + 1} đã có ${n} ảnh chứng từ. Khi lưu đơn, các ảnh này sẽ bị xoá. Tiếp tục?`)) return;
    setEditing((s) => ({ ...s, stops: s.stops.filter((_, j) => j !== i) }));
  };

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
      id: st.id,
      stop_no: st.stop_no,
      customer_id: st.customer_id,
      address: st.address,
      cargo: st.cargo || '',
      weight: st.weight || '',
      fee: String(st.fee),
      toll_fee: Number(st.toll_fee) > 0 ? String(st.toll_fee) : '',
      parking_fee: Number(st.parking_fee) > 0 ? String(st.parking_fee) : '',
      hadFees: Number(st.toll_fee || 0) + Number(st.parking_fee || 0) > 0,
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
      toll_fee: Number(r.toll_fee) > 0 ? String(r.toll_fee) : '',
      parking_fee: Number(r.parking_fee) > 0 ? String(r.parking_fee) : '',
      hadFees: Number(r.toll_fee || 0) + Number(r.parking_fee || 0) > 0,
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
    let tollSum = 0;
    let parkSum = 0;
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
        // Chỉ gửi cột phí khi có phát sinh (hoặc điểm này từng có phí) để không phụ thuộc việc đã chạy order-fees.sql chưa
        ...(Number(st.toll_fee || 0) > 0 || Number(st.parking_fee || 0) > 0 || st.hadFees
          ? { toll_fee: Number(st.toll_fee || 0), parking_fee: Number(st.parking_fee || 0) }
          : {}),
      }));
      fee = stops.reduce((a, st) => a + st.fee, 0);
      tollSum = stops.reduce((a, st) => a + (st.toll_fee || 0), 0);
      parkSum = stops.reduce((a, st) => a + (st.parking_fee || 0), 0);
    } else {
      if (!editing.customer_id) return setFormErr('Vui lòng chọn khách hàng.');
      if (!editing.delivery.trim()) return setFormErr('Vui lòng nhập điểm đến.');
      fee = Number(editing.fee || 0);
      if (fee < 0 || Number.isNaN(fee)) return setFormErr('Cước phí phải là số không âm.');
      tollSum = Number(editing.toll_fee || 0);
      parkSum = Number(editing.parking_fee || 0);
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
      ...(tollSum > 0 || parkSum > 0 || editing.hadFees ? { toll_fee: tollSum, parking_fee: parkSum } : {}),
    };

    let failed = false;
    let doneMsg = null;
    if (!editing.id) {
      const ins = await supabase.from('orders').insert(payload).select('id, order_no').single();
      if (ins.error) failed = true;
      else if (multi) {
        // Database tự cấp số hiệu 1, 2, 3... cho từng điểm trả theo đúng thứ tự gửi lên
        const s = await supabase.from('order_stops').insert(stops.map((st) => ({ ...st, order_id: ins.data.id }))).select('stop_no');
        if (s.error) {
          await supabase.from('orders').delete().eq('id', ins.data.id); // hoàn tác để không để lại đơn dở dang
          failed = true;
        } else {
          const codes = (s.data || []).map((x) => x.stop_no).sort((a, b) => a - b).map((n) => stopCode(ins.data.order_no, n));
          doneMsg = `Đã tạo ${orderCode(ins.data.order_no)} gồm ${codes.join(', ')}.`;
        }
      } else {
        doneMsg = `Đã tạo ${orderCode(ins.data.order_no)}.`;
      }
    } else if (!multi) {
      const up = await supabase.from('orders').update(payload).eq('id', editing.id);
      failed = !!up.error;
      if (!failed) doneMsg = `Đã lưu ${orderCode(editing.order_no)}.`;
    } else {
      // Giữ nguyên mã các điểm trả đã có (để không mất ảnh chứng từ gắn với điểm đó):
      // cập nhật điểm cũ, thêm điểm mới, cập nhật đơn, cuối cùng mới xoá các điểm đã bỏ.
      const withIds = stops.map((st, i) => ({ ...st, id: editing.stops[i].id }));
      for (const { id, ...fields } of withIds.filter((x) => x.id)) {
        const u = await supabase.from('order_stops').update(fields).eq('id', id);
        if (u.error) {
          failed = true;
          break;
        }
      }
      const fresh = withIds.filter((x) => !x.id).map(({ id, ...f }) => ({ ...f, order_id: editing.id }));
      let newCodes = [];
      if (!failed && fresh.length) {
        const s = await supabase.from('order_stops').insert(fresh).select('stop_no');
        if (s.error) failed = true;
        else newCodes = (s.data || []).map((x) => x.stop_no).sort((a, b) => a - b).map((n) => stopCode(editing.order_no, n));
      }
      if (!failed) {
        const up = await supabase.from('orders').update(payload).eq('id', editing.id);
        failed = !!up.error;
      }
      if (!failed) doneMsg = `Đã lưu ${orderCode(editing.order_no)}.${newCodes.length ? ` Điểm trả mới: ${newCodes.join(', ')}.` : ''}`;
      if (!failed) {
        const kept = withIds.map((x) => x.id).filter(Boolean);
        const removed = editing.oldStopIds.filter((id) => !kept.includes(id));
        if (removed.length) {
          await removeDocFiles({ stopIds: removed });
          await supabase.from('order_stops').delete().in('id', removed);
        }
      }
    }

    setBusy(false);
    if (failed) {
      return setFormErr(
        'Không lưu được. Nếu bạn vừa cập nhật tính năng mới, hãy chạy các file SQL mới nhất (multi-stop.sql, stop-codes.sql, order-fees.sql) trên Supabase rồi thử lại.'
      );
    }
    setEditing(null);
    if (doneMsg) setNotice({ ok: true, text: doneMsg });
    load();
  }

  async function remove(r) {
    if (!window.confirm(`Xoá đơn hàng ${orderCode(r.order_no)} và toàn bộ ảnh chứng từ của đơn? Thao tác này không thể hoàn tác.`)) return;
    await removeDocFiles({ orderId: r.id });
    const { error } = await supabase.from('orders').delete().eq('id', r.id);
    if (error) {
      return window.alert(
        error.code === '23503'
          ? 'Không xoá được: đơn hàng này đã có phiếu Thu. Hãy xoá phiếu Thu liên quan ở mục Thu tiền trước.'
          : 'Không xoá được. Vui lòng thử lại.'
      );
    }
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
        {addOrder && <button
          className="btn btn-primary"
          onClick={() => openEdit(null)}
          disabled={!customers.length}
          title={!customers.length ? 'Hãy thêm khách hàng trước' : undefined}
        >
          + Thêm đơn hàng
        </button>}
      </div>
      {!loading && !customers.length && <p className="muted">Cần có ít nhất một khách hàng trước khi tạo đơn hàng.</p>}

      <div className="toolbar">
        <input aria-label="Tìm kiếm" placeholder="Tìm theo mã đơn, khách, tuyến, biển số, tài xế..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Trạng thái đơn hàng" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">Mọi trạng thái</option>
          <option value="incomplete">Chưa hoàn thành</option>
          <option value="done">Hoàn thành</option>
        </select>
      </div>

      {err && <p className="err" role="alert">{err}</p>}
      {notice && <p className="ok-msg" role="status" style={{ marginBottom: 10 }}>{notice.text}</p>}
      <div className="table-wrap">
        <table className="fleet-table staff-table">
          <thead>
            <tr>
              <th>Mã</th><th>Khách hàng</th><th>Tuyến</th><th>Hàng</th><th>Xe / Tài xế</th><th>Ngày</th><th>Trạng thái</th>
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
                    <td className="o-status">
                      <span className={`st-pill ${r.status === 'done' ? 'st-paid' : 'st-pending'}`}>{r.status === 'done' ? 'Hoàn thành' : 'Chưa hoàn thành'}</span>
                      {completeOrder && r.status !== 'done' && (
                        <button
                          className={`btn sm o-done ${hasDocs(r) ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => setStatus(r, true)}
                          title={hasDocs(r) ? 'Đánh dấu đơn đã hoàn thành' : 'Cần có biên bản giao nhận hoặc bill trước'}
                        >✓ Hoàn thành</button>
                      )}
                      {completeOrder && r.status === 'done' && (
                        <button className="btn btn-outline sm o-done" onClick={() => setStatus(r, false)}>↩ Mở lại</button>
                      )}
                      {r.status === 'done' && r.completed_at && <span className="muted small">{fmtDate(r.completed_at)}</span>}
                    </td>
                    <td className="num">
                      {vnd(r.fee)}
                      <Extras toll={r.toll_fee} park={r.parking_fee} />
                      <PaidInfo fee={r.fee} paid={paid.byOrder[r.id]} />
                    </td>
                    <td className="actions">
                      {!isMulti && (
                        <button
                          className={`btn sm ${photoCounts[`${r.id}|`] ? 'btn-docs-has' : 'btn-docs'}`}
                          onClick={() => setDocsFor({ orderId: r.id, stopId: null, title: `Chứng từ giao hàng – ${orderCode(r.order_no)}` })}
                        >
                          Chứng từ ({photoCounts[`${r.id}|`] || 0})
                        </button>
                      )}
                      {editOrder && <button className="btn btn-outline sm" onClick={() => openEdit(r)}>Sửa</button>}
                      {deleteOrder && <button className="btn btn-danger sm" onClick={() => remove(r)}>Xoá</button>}
                    </td>
                  </tr>
                  {isMulti && (
                    <tr className="stops-row">
                      <td></td>
                      <td colSpan={8}>
                        <ol className="stop-list coded">
                          {stops.map((st) => (
                            <li key={st.id}>
                              <button
                                className={`btn sm stop-docs ${photoCounts[`${r.id}|${st.id}`] ? 'btn-docs-has' : 'btn-docs'}`}
                                onClick={() => setDocsFor({
                                  orderId: r.id,
                                  stopId: st.id,
                                  title: `Chứng từ – ${stopCode(r.order_no, st.stop_no)} (${st.customers?.name || ''})`,
                                })}
                              >
                                Chứng từ ({photoCounts[`${r.id}|${st.id}`] || 0})
                              </button>
                              <span className="stop-code">{stopCode(r.order_no, st.stop_no)}</span>
                              <strong>{st.customers?.name}</strong>
                              <span className="muted"> ({st.customers?.phone})</span> – {st.address}
                              {(st.cargo || st.weight) && <span className="muted"> · {[st.cargo, st.weight].filter(Boolean).join(', ')}</span>}
                              <span className="stop-fee">{vnd(st.fee)}<Extras toll={st.toll_fee} park={st.parking_fee} />{stops.filter((x) => x.customer_id === st.customer_id).length === 1 && <PaidInfo fee={st.fee} paid={paid.byCustomer[`${r.id}|${st.customer_id}`]} />}</span>
                            </li>
                          ))}
                        </ol>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!loading && !shown.length && <tr><td colSpan={9} className="muted">Chưa có đơn hàng nào.</td></tr>}
            {loading && <tr><td colSpan={9} className="muted">Đang tải...</td></tr>}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={7}><strong>Tổng ({shown.length} đơn)</strong></td>
                <td className="num"><strong>{vnd(totalFee)}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {docsFor && (
        <DeliveryDocs
          orderId={docsFor.orderId}
          stopId={docsFor.stopId}
          title={docsFor.title}
          onClose={() => setDocsFor(null)}
          onChanged={loadCounts}
        />
      )}

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
              <div className="field"><label htmlFor="o-date">Ngày vận chuyển</label><DateInput id="o-date" value={editing.ship_date || ''} onChange={(v) => setEditing((s) => ({ ...s, ship_date: v }))} /></div>
            ) : (
              <div className="grid-2">
                <div className="field"><label htmlFor="o-date">Ngày vận chuyển</label><DateInput id="o-date" value={editing.ship_date || ''} onChange={(v) => setEditing((s) => ({ ...s, ship_date: v }))} /></div>
                <div className="field"><label htmlFor="o-fee">Cước phí (đồng)</label><MoneyInput id="o-fee" value={editing.fee} onChange={(v) => setEditing((s) => ({ ...s, fee: v }))} placeholder="VD: 3,500,000" /></div>
              </div>
            )}

            {!multi && (
              <div className="fee-row">
                <span className="label-like">Phí phát sinh tại điểm trả</span>
                <FeePopup idPrefix="o-toll" label="Phí cầu đường" value={editing.toll_fee} onChange={(v) => setEditing((s) => ({ ...s, toll_fee: v }))} />
                <FeePopup idPrefix="o-park" label="Phí bến bãi" value={editing.parking_fee} onChange={(v) => setEditing((s) => ({ ...s, parking_fee: v }))} />
              </div>
            )}

            {multi && (
              <>
                <div className="stops-head">
                  <h3 style={{ margin: 0 }}>Các điểm trả hàng ({editing.stops.length})</h3>
                </div>
                {editing.stops.map((st, i) => (
                  <fieldset className="stop-card" key={i}>
                    <legend>
                      Điểm trả #{i + 1}
                      {editing.id && st.stop_no ? <span className="stop-code">{stopCode(editing.order_no, st.stop_no)}</span> : <span className="muted small"> · mã đơn con cấp khi lưu</span>}
                    </legend>
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
                      <div className="field"><label htmlFor={`s-fee-${i}`}>Cước phí (đồng)</label><MoneyInput id={`s-fee-${i}`} value={st.fee} onChange={setStopVal(i, 'fee')} placeholder="VD: 3,500,000" /></div>
                    </div>
                    <div className="fee-row">
                      <span className="label-like">Phí phát sinh tại điểm này</span>
                      <FeePopup idPrefix={`s-toll-${i}`} label="Phí cầu đường" value={st.toll_fee} onChange={setStopVal(i, 'toll_fee')} />
                      <FeePopup idPrefix={`s-park-${i}`} label="Phí bến bãi" value={st.parking_fee} onChange={setStopVal(i, 'parking_fee')} />
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
