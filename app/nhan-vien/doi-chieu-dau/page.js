'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, vnd, displayLogin, expenseCode } from '../../../lib/supabase';
import { useRole } from '../../../components/staff/Role';
import Modal from '../../../components/staff/Modal';
import DateInput from '../../../components/DateInput';
import FleetMap from '../../../components/staff/FleetMap';
import { rangeOf, shiftAnchor, todayIso, dmy } from '../../../lib/period';
import { callVietmap, dayRange, plateKey, fuelRow, num1 } from '../../../lib/vietmap';
import { syncRefills, loadRefills, refillTime } from '../../../lib/fuelRefills';
import { reconcile, byVehicle, detectDrops, pctText, vnHm, vnDm, LITRE_TOL, DROP_LITRES } from '../../../lib/fuelCheck';

const PERIODS = [
  { id: 'week', label: 'Tuần' },
  { id: 'month', label: 'Tháng' },
];
const EXP_COLS = 'id, expense_no, expense_date, vehicle_id, amount, status, fuel_refill_id, vehicles(plate)';
const lit = (n) => (n == null ? '—' : `${num1(n)} l`);
const signedLit = (n) => (n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${num1(Math.abs(n))} l`);

export default function Page() {
  const { role } = useRole();
  const canEdit = role === 'staff' || role === 'accountant';
  const [period, setPeriod] = useState('month');
  const [anchor, setAnchor] = useState(todayIso());
  const range = useMemo(() => rangeOf(period, anchor), [period, anchor]);
  const [carId, setCarId] = useState(0); // id xe Vietmap, 0 = tất cả
  const [onlyOpen, setOnlyOpen] = useState(false);

  const [cars, setCars] = useState(null);
  const [checks, setChecks] = useState({});
  const [data, setData] = useState(null); // { refills, expenses, fuel, noLitres }
  const [drops, setDrops] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [checking, setChecking] = useState(null); // dòng đang ghi "đã kiểm tra"
  const [mapAt, setMapAt] = useState(null);

  // Xe: danh sách của Vietmap ghép với bảng xe của CMS theo biển số
  useEffect(() => {
    Promise.all([callVietmap('vehicles'), supabase.from('vehicles').select('id, plate').order('plate')])
      .then(([gps, cms]) => {
        const byKey = Object.fromEntries((cms.data || []).map((v) => [plateKey(v.plate), v]));
        setCars(gps.map((g) => ({ ...g, name: byKey[plateKey(g.plate)]?.plate || g.plate, cmsId: byKey[plateKey(g.plate)]?.id || null })));
      })
      .catch((e) => setErr(e.message));
  }, []);

  const loadSide = useCallback(async () => {
    const c = await supabase.from('fuel_checks').select('*');
    if (c.error) setNote('Chưa có bảng đánh dấu kiểm tra. Hãy chạy supabase/doi-chieu-dau.sql trên Supabase.');
    setChecks(Object.fromEntries((c.data || []).map((x) => [x.key, x])));
  }, []);
  useEffect(() => {
    loadSide();
  }, [loadSide]);

  // Số liệu của kỳ: báo cáo nhiên liệu Vietmap, lần đổ (tìm thêm lần đổ mới trước), phiếu chi nhiên liệu
  useEffect(() => {
    if (!cars) return;
    let dead = false;
    setData(null);
    setDrops(null);
    setErr('');
    (async () => {
      try {
        const fuel = (await callVietmap('fuel', { ids: cars.map((c) => c.id), ...dayRange(range.from, range.to) })).map(fuelRow);
        await syncRefills(cars, range.from, range.to, fuel).catch(() => {});
        const refills = await loadRefills(range.from, range.to);
        const ids = refills.map((r) => r.id);
        let noLitres = false;
        const get = async (cols) => {
          const inRange = supabase.from('expenses').select(cols).eq('type', 'fuel').gte('expense_date', range.from).lte('expense_date', range.to);
          const linked = ids.length ? supabase.from('expenses').select(cols).in('fuel_refill_id', ids) : Promise.resolve({ data: [] });
          return Promise.all([inRange, linked]);
        };
        let [a, b] = await get(`${EXP_COLS}, litres, unit_price`);
        if (a.error) {
          noLitres = true; // chưa chạy SQL thêm cột số lít
          [a, b] = await get(EXP_COLS);
        }
        const all = new Map([...(a.data || []), ...(b.data || [])].map((e) => [e.id, e]));
        if (!dead) setData({ refills, expenses: [...all.values()], fuel, noLitres });

        // Lớp 3: chỉ tải hành trình của những ngày Vietmap báo có dầu giảm
        const days = fuel.filter((r) => r.fuelOut >= DROP_LITRES).slice(0, 20);
        const found = [];
        for (const r of days) {
          const day = String(r.date).slice(0, 10);
          const pts = await callVietmap('history', { id: r.id, ...dayRange(day) });
          detectDrops(pts).forEach((d) => found.push({ ...d, carId: r.id, day }));
        }
        if (!dead) setDrops(found);
      } catch (e) {
        if (!dead) setErr(e.message);
      }
    })();
    return () => {
      dead = true;
    };
  }, [cars, range.from, range.to]);

  const rows = useMemo(() => (data ? reconcile(data.refills, data.expenses, checks) : []), [data, checks]);
  const dropRows = useMemo(
    () => (drops || []).map((d) => ({ ...d, key: `d:${d.carId}:${d.from}`, plate: cars?.find((c) => c.id === d.carId)?.name, check: checks[`d:${d.carId}:${d.from}`] || null })).map((d) => ({ ...d, open: !d.check })),
    [drops, checks, cars]
  );
  const summary = useMemo(() => (cars && data ? byVehicle(cars, rows, data.fuel, dropRows) : []), [cars, data, rows, dropRows]);

  const car = cars?.find((c) => c.id === carId);
  const shownRows = rows.filter((r) => (!car || r.vehicleId === car.cmsId) && (!onlyOpen || r.open));
  const shownDrops = dropRows.filter((d) => (!car || d.carId === car.id) && (!onlyOpen || d.open));
  const shownCars = summary.filter((s) => !car || s.id === car.id);

  const t = shownCars.reduce(
    (a, s) => ({ paid: a.paid + s.paid, sensor: a.sensor + s.sensor, invoice: a.invoice + s.invoice, diff: a.diff + s.matchedDiff, money: a.money + (s.diffMoney || 0), issues: a.issues + s.issues }),
    { paid: 0, sensor: 0, invoice: 0, diff: 0, money: 0, issues: 0 }
  );

  async function saveCheck(key, text) {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('fuel_checks').upsert({ key, note: text || null, checked_by_name: displayLogin(u?.user?.email), checked_at: new Date().toISOString() });
    if (error) return error.code === '42501' ? 'Chỉ Admin và Kế toán được đánh dấu.' : 'Không lưu được. Vui lòng thử lại.';
    await loadSide();
    return null;
  }
  async function undoCheck(key) {
    if (!window.confirm('Bỏ đánh dấu "Đã kiểm tra" cho dòng này?')) return;
    await supabase.from('fuel_checks').delete().eq('key', key);
    loadSide();
  }

  const CheckCell = ({ r }) =>
    r.check ? (
      <div className="small">
        <span className="pill pill-muted">Đã kiểm tra</span>
        <div className="muted">{r.check.checked_by_name}{r.check.note ? `: ${r.check.note}` : ''}</div>
        {canEdit && <button type="button" className="link-btn" onClick={() => undoCheck(r.key)}>Bỏ đánh dấu</button>}
      </div>
    ) : r.open && canEdit ? (
      <button type="button" className="btn btn-outline sm" onClick={() => setChecking(r)}>Đã kiểm tra</button>
    ) : null;

  return (
    <>
      <div className="staff-head">
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Đối chiếu dầu</h1>
      </div>

      <div className="period-bar">
        <div className="seg" role="radiogroup" aria-label="Kỳ xem">
          {PERIODS.map((p) => (
            <button type="button" key={p.id} role="radio" aria-checked={period === p.id} className={period === p.id ? 'on' : ''} onClick={() => setPeriod(p.id)}>{p.label}</button>
          ))}
        </div>
        <div className="period-nav">
          <button type="button" className="btn btn-outline sm" onClick={() => setAnchor((a) => shiftAnchor(period, a, -1))} aria-label="Kỳ trước">‹</button>
          <DateInput aria-label="Chọn một ngày trong kỳ" value={anchor} onChange={(v) => v && setAnchor(v)} />
          <button type="button" className="btn btn-outline sm" onClick={() => setAnchor((a) => shiftAnchor(period, a, 1))} aria-label="Kỳ sau">›</button>
          <button type="button" className="btn btn-outline sm" onClick={() => setAnchor(todayIso())}>Hôm nay</button>
        </div>
        <strong className="period-label">{range.label}</strong>
        <select aria-label="Chọn xe" value={carId} onChange={(e) => setCarId(Number(e.target.value))}>
          <option value={0}>Tất cả xe</option>
          {(cars || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="check-inline" style={{ marginLeft: 'auto' }}>
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Chỉ hiện dòng cần kiểm tra
        </label>
      </div>

      <div className="kpis" style={{ marginBottom: 14, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <div className="kpi"><span className="kpi-icon tone-warn"><span aria-hidden="true">⛽</span></span><span className="kpi-text"><span className="kpi-label">Tiền dầu theo phiếu chi</span><span className="kpi-value">{vnd(t.paid)}</span><span className="kpi-sub">{range.label}</span></span></div>
        <div className="kpi"><span className="kpi-icon tone-navy"><span aria-hidden="true">l</span></span><span className="kpi-text"><span className="kpi-label">Lít hoá đơn / lít cảm biến</span><span className="kpi-value">{num1(t.invoice)} / {num1(t.sensor)}</span><span className="kpi-sub">tổng các lần đổ trong kỳ</span></span></div>
        <div className="kpi"><span className={`kpi-icon ${t.diff > 0 ? 'tone-err' : 'tone-ok'}`}><span aria-hidden="true">±</span></span><span className="kpi-text"><span className="kpi-label">Chênh lệch (đã có phiếu)</span><span className={`kpi-value ${t.diff > 0 ? 'amt-out' : ''}`}>{signedLit(t.diff)}</span><span className="kpi-sub">khoảng {vnd(Math.abs(t.money))}</span></span></div>
        <div className="kpi"><span className={`kpi-icon ${t.issues ? 'tone-err' : 'tone-ok'}`}><span aria-hidden="true">!</span></span><span className="kpi-text"><span className="kpi-label">Cần kiểm tra</span><span className="kpi-value">{t.issues}</span><span className="kpi-sub">lệch lít, dầu tụt</span></span></div>
      </div>

      {err && <p className="err" role="alert">{err}</p>}
      {note && <p className="err" role="alert">{note}</p>}
      {data?.noLitres && <p className="err" role="alert">Phiếu chi chưa có cột Số lít / Đơn giá. Hãy chạy supabase/doi-chieu-dau.sql trên Supabase.</p>}

      {/* ---------- Lớp 1 ---------- */}
      <h2 className="fc-title">1. Từng lần đổ dầu</h2>
      <p className="muted small fc-sub">Mỗi lần cảm biến thấy đổ dầu được ghép với phiếu chi của lần đó. Lít trên hoá đơn lệch quá {LITRE_TOL * 100}% so với cảm biến thì cần kiểm tra.</p>
      <div className="table-wrap">
        <table className="staff-table fc-table">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Xe</th>
              <th className="num">Cảm biến</th>
              <th>Phiếu chi</th>
              <th className="num">Hoá đơn</th>
              <th className="num">Chênh lệch</th>
              <th className="num">Đơn giá</th>
              <th>Kết quả</th>
              <th aria-label="Thao tác"></th>
            </tr>
          </thead>
          <tbody>
            {shownRows.map((r) => (
              <tr key={r.key} className={r.open ? `fc-${r.status.tone}` : ''}>
                <td>
                  {r.refill ? refillTime(r.refill) : `${dmy(r.day)} (ngày chi)`}
                  {r.refill?.address && <div className="muted small fc-addr">{r.refill.address}</div>}
                </td>
                <td><strong>{r.plate}</strong></td>
                <td className="num">{lit(r.sensor)}</td>
                <td>
                  {r.expense ? (
                    <>
                      <strong>{expenseCode(r.expense.expense_no)}</strong> · {vnd(r.expense.amount)}
                      <div className="muted small">{r.expense.status === 'pending' ? 'Chờ duyệt' : r.expense.status === 'approved' ? 'Đã duyệt' : 'Đã thanh toán'}</div>
                    </>
                  ) : r.refill && !r.refill.skipped_at ? (
                    <Link href="/nhan-vien/chi-tien/" className="link-btn">Nhập tiền ở Chi tiền</Link>
                  ) : <span className="muted">—</span>}
                </td>
                <td className="num">{r.invoice == null ? '—' : <>{lit(r.invoice)}</>}</td>
                <td className="num">{r.diff == null ? '—' : <><strong className={r.diffPct > LITRE_TOL ? 'amt-out' : ''}>{signedLit(r.diff)}</strong><div className="muted small">{pctText(r.diffPct)}</div></>}</td>
                <td className="num">{r.unit ? vnd(r.unit) : '—'}</td>
                <td><span className={`pill pill-${r.status.tone}`}>{r.status.label}</span></td>
                <td><CheckCell r={r} /></td>
              </tr>
            ))}
            {data && !shownRows.length && <tr><td colSpan={9} className="muted">{onlyOpen ? 'Không có lần đổ nào cần kiểm tra.' : 'Chưa có lần đổ dầu nào trong kỳ này.'}</td></tr>}
            {!data && !err && <tr><td colSpan={9} className="muted">Đang tải...</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ---------- Lớp 2 ---------- */}
      <h2 className="fc-title">2. Tổng hợp theo xe</h2>
      <p className="muted small fc-sub">Chênh lệch chỉ tính các lần đổ đã có phiếu chi. Lít / 100 km theo báo cáo nhiên liệu của Vietmap, so với định mức của xe.</p>
      <div className="table-wrap">
        <table className="staff-table fc-table">
          <thead>
            <tr>
              <th>Xe</th>
              <th className="num">Lần đổ</th>
              <th className="num">Phiếu chi</th>
              <th className="num">Lít hoá đơn</th>
              <th className="num">Lít cảm biến</th>
              <th className="num">Chênh lệch</th>
              <th className="num">Tiền chênh</th>
              <th className="num">Tiền dầu</th>
              <th className="num">Quãng đường</th>
              <th className="num">Lít / 100 km</th>
              <th className="num">Cần kiểm tra</th>
            </tr>
          </thead>
          <tbody>
            {shownCars.map((s) => {
              const over = s.per100 != null && s.normPer100km > 0 && s.per100 > s.normPer100km * (1 + LITRE_TOL);
              return (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong></td>
                  <td className="num">{s.refills}</td>
                  <td className="num">{s.vouchers}</td>
                  <td className="num">{lit(s.invoice)}</td>
                  <td className="num">{lit(s.sensor)}</td>
                  <td className="num">
                    <strong className={s.matchedPct > LITRE_TOL ? 'amt-out' : ''}>{signedLit(s.matchedDiff)}</strong>
                    {s.matchedPct != null && <div className="muted small">{pctText(s.matchedPct)}</div>}
                  </td>
                  <td className="num">{s.diffMoney == null ? '—' : <span className={s.diffMoney > 0 ? 'amt-out' : ''}>{s.diffMoney < 0 ? `−${vnd(-s.diffMoney)}` : vnd(s.diffMoney)}</span>}</td>
                  <td className="num">{vnd(s.paid)}</td>
                  <td className="num">{num1(s.km)} km</td>
                  <td className="num">
                    {s.per100 == null ? '—' : <strong className={over ? 'amt-out' : ''}>{num1(s.per100)}</strong>}
                    <div className="muted small">định mức {s.normPer100km > 0 ? num1(s.normPer100km) : '—'}</div>
                  </td>
                  <td className="num">{s.issues ? <span className="pill pill-err">{s.issues}</span> : <span className="pill pill-ok">0</span>}</td>
                </tr>
              );
            })}
            {!data && !err && <tr><td colSpan={11} className="muted">Đang tải...</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ---------- Lớp 3 ---------- */}
      <h2 className="fc-title">3. Dầu tụt bất thường</h2>
      <p className="muted small fc-sub">Xe đứng yên mà mức dầu giảm từ {DROP_LITRES} lít trở lên trong vòng 30 phút. Có thể do rút dầu, rò rỉ hoặc cảm biến lỗi.</p>
      <div className="table-wrap">
        <table className="staff-table fc-table">
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Khoảng giờ</th>
              <th>Xe</th>
              <th className="num">Mức dầu</th>
              <th className="num">Giảm</th>
              <th>Vị trí</th>
              <th aria-label="Thao tác"></th>
            </tr>
          </thead>
          <tbody>
            {shownDrops.map((d) => (
              <tr key={d.key} className={d.open ? 'fc-err' : ''}>
                <td>{vnDm(d.from)}</td>
                <td>{vnHm(d.from)} – {vnHm(d.to)}</td>
                <td><strong>{d.plate}</strong></td>
                <td className="num">{num1(d.before)} → {num1(d.after)} l</td>
                <td className="num"><strong className="amt-out">−{num1(d.litres)} l</strong></td>
                <td><button type="button" className="link-btn" onClick={() => setMapAt(d)}>Xem trên bản đồ</button></td>
                <td><CheckCell r={d} /></td>
              </tr>
            ))}
            {drops && !shownDrops.length && <tr><td colSpan={7} className="muted">Không thấy lần dầu tụt bất thường nào trong kỳ này.</td></tr>}
            {!drops && !err && <tr><td colSpan={7} className="muted">Đang kiểm tra hành trình...</td></tr>}
          </tbody>
        </table>
      </div>


      {checking && <CheckModal row={checking} onClose={() => setChecking(null)} save={saveCheck} />}
      {mapAt && (
        <Modal title={`Dầu tụt: xe ${mapAt.plate}, ${vnDm(mapAt.from)} ${vnHm(mapAt.from)}`} onClose={() => setMapAt(null)} width={820}>
          <div className="fc-map"><FleetMap stops={[{ x: mapAt.x, y: mapAt.y, label: `Giảm ${num1(mapAt.litres)} lít (${vnHm(mapAt.from)} – ${vnHm(mapAt.to)})` }]} fitKey={mapAt.key} /></div>
        </Modal>
      )}
    </>
  );
}

function CheckModal({ row, onClose, save }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <Modal title="Đánh dấu đã kiểm tra" onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return setErr('Vui lòng ghi lý do / kết quả kiểm tra.');
          setBusy(true);
          const msg = await save(row.key, text.trim());
          setBusy(false);
          if (msg) return setErr(msg);
          onClose();
        }}
      >
        <p style={{ margin: 0 }}>
          Xe <strong>{row.plate}</strong> · {row.status ? row.status.label : `Dầu tụt ${num1(row.litres)} lít`}
        </p>
        <div className="field">
          <label htmlFor="fc-note">Kết quả kiểm tra *</label>
          <textarea id="fc-note" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="VD: Đã hỏi lái xe, đổ thêm can dự phòng 5 lít" />
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>Huỷ</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</button>
        </div>
      </form>
    </Modal>
  );
}
