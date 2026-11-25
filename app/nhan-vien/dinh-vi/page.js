'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import DateInput from '../../../components/DateInput';
import FleetMap from '../../../components/staff/FleetMap';
import { supabase, vnd } from '../../../lib/supabase';
import { PERIODS, rangeOf, shiftAnchor, todayIso, dmy } from '../../../lib/period';
import { syncRefills, loadRefills, refillDay, refillTime, voucherState } from '../../../lib/fuelRefills';
import { callVietmap, dayRange, plateKey, vnTime, hm, dmHm, duration, num1, fuelRow, hasPos, trackKm, mergeStops, parkedSince, vehicleState } from '../../../lib/vietmap';

const TABS = [
  { id: 'status', label: 'Vị trí hiện tại' },
  { id: 'history', label: 'Hành trình & điểm dừng' },
  { id: 'fuel', label: 'Nhiên liệu' },
];
const REFRESH_MS = 30000;
const REPORT_MS = 300000;
// Vietmap cho tối đa 31 ngày mỗi lần nên không có kỳ Năm
const SHORT_PERIODS = PERIODS.filter((p) => p.id !== 'year');
const MIN_STOPS = [5, 10, 15, 30, 60];

// Tải dữ liệu theo "deps"; đổi deps khi đang tải thì bỏ kết quả cũ
function useLoad(load, deps) {
  const [state, setState] = useState({ data: null, err: '', loading: true });
  useEffect(() => {
    let cancelled = false;
    setState({ data: null, err: '', loading: true });
    load().then(
      (data) => !cancelled && setState({ data, err: '', loading: false }),
      (e) => !cancelled && setState({ data: null, err: e.message, loading: false })
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function Kpi({ label, value, sub }) {
  return (
    <div className="kpi"><span className="kpi-text"><span className="kpi-label">{label}</span><span className="kpi-value">{value}</span>{sub && <span className="kpi-sub">{sub}</span>}</span></div>
  );
}

function VehicleSelect({ cars, value, onChange, all }) {
  return (
    <select aria-label="Chọn xe" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {all && <option value={0}>Tất cả xe</option>}
      {cars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

function PeriodBar({ period, setPeriod, anchor, setAnchor, range, children }) {
  return (
    <div className="period-bar">
      <div className="seg" role="radiogroup" aria-label="Kỳ xem">
        {SHORT_PERIODS.map((p) => (
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
      {children}
    </div>
  );
}

// ---------- Vị trí hiện tại ----------
function StatusTab({ cars, nameOf }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [focus, setFocus] = useState(null);
  const [extra, setExtra] = useState({ km: {}, stops: [] }); // km hôm nay và các lần dừng 7 ngày gần đây, theo báo cáo

  const load = useCallback(async () => {
    try {
      setRows(await callVietmap('status'));
      setErr('');
    } catch (e) {
      setErr(e.message); // giữ vị trí lần trước trên màn hình
    }
  }, []);

  // Lỗi phần này không ảnh hưởng bản đồ: chỉ thiếu km và thời gian dừng
  const loadExtra = useCallback(async () => {
    const ids = cars.map((c) => c.id);
    const today = todayIso();
    const [fuel, stops] = await Promise.allSettled([
      callVietmap('fuel', { ids, ...dayRange(today) }),
      callVietmap('stops', { ids, ...dayRange(shiftAnchor('day', today, -6), today), duration: 300 }),
    ]);
    setExtra((old) => ({
      km: fuel.status === 'fulfilled' ? Object.fromEntries(fuel.value.map(fuelRow).map((r) => [r.id, r.km])) : old.km,
      stops: stops.status === 'fulfilled' ? mergeStops(stops.value) : old.stops,
    }));
  }, [cars]);

  useEffect(() => {
    load();
    loadExtra();
    const visible = (fn) => () => document.visibilityState === 'visible' && fn();
    const timers = [setInterval(visible(load), REFRESH_MS), setInterval(visible(loadExtra), REPORT_MS)];
    return () => timers.forEach(clearInterval);
  }, [load, loadExtra]);

  const list = useMemo(
    () => (rows || []).map((r) => ({ ...r, name: nameOf(r.id, r.plate), state: vehicleState(r), since: parkedSince(r, extra.stops), km: extra.km[r.id] })),
    [rows, nameOf, extra]
  );
  const markers = useMemo(
    () => list.filter(hasPos).map((r) => ({ id: r.id, plate: r.name, x: r.x, y: r.y, heading: r.heading, tone: r.state.tone })),
    [list]
  );

  return (
    <>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="gps-grid">
        <FleetMap vehicles={markers} fitKey="status" focus={focus} />
        <div className="gps-list">
          {list.map((r) => (
            <button type="button" className="gps-item" key={r.id} disabled={!hasPos(r)} onClick={() => setFocus({ x: r.x, y: r.y })}>
              <span className="gps-item-head"><strong>{r.name}</strong><span className={`pill pill-${r.state.tone}`}>{r.state.label}</span></span>
              <span>{r.speed > 0 ? `${r.speed} km/giờ` : r.since ? `Dừng ${duration((vnTime(r.gpsTime) - vnTime(r.since)) / 1000)}` : 'Đứng yên'}{r.km != null && ` · hôm nay ${num1(r.km)} km`}</span>
              <span className="muted small">{r.address || 'Chưa có địa chỉ'}</span>
              <span className="muted small">
                {r.driver && `${r.driver} · `}{r.fuel != null && `Dầu ${num1(r.fuel)} lít · `}Tín hiệu lúc {dmHm(r.gpsTime)}
              </span>
            </button>
          ))}
          {rows && !list.length && <p className="muted">Vietmap chưa có vị trí xe nào.</p>}
          {!rows && !err && <p className="muted">Đang tải...</p>}
        </div>
      </div>
      <p className="muted small">Vị trí tự làm mới mỗi 30 giây; km hôm nay và thời gian dừng theo báo cáo, làm mới mỗi 5 phút. Bấm vào xe để xem trên bản đồ.</p>
    </>
  );
}

// ---------- Hành trình ----------
function HistoryTab({ cars }) {
  const [id, setId] = useState(cars[0].id);
  const [day, setDay] = useState(todayIso());
  const [minutes, setMinutes] = useState(5);
  const [focus, setFocus] = useState(null);

  const { data, err, loading } = useLoad(async () => {
    const range = dayRange(day);
    const [points, stops] = await Promise.all([
      callVietmap('history', { id, ...range }),
      callVietmap('stops', { ids: [id], ...range, duration: MIN_STOPS[0] * 60 }),
    ]);
    return { track: points.filter(hasPos), stops };
  }, [id, day]);

  const track = useMemo(() => data?.track || [], [data]);
  const stops = useMemo(() => (data?.stops || []).filter((s) => hasPos(s) && s.seconds >= minutes * 60).map((s) => ({ ...s, label: `${hm(s.from)} – ${hm(s.to)} · ${duration(s.seconds)}` })), [data, minutes]);
  const stopSeconds = stops.reduce((t, s) => t + s.seconds, 0);
  const idleSeconds = stops.reduce((t, s) => t + s.accSeconds, 0);
  const km = useMemo(() => trackKm(track), [track]);
  const maxSpeed = useMemo(() => track.reduce((m, p) => Math.max(m, p.v), 0), [track]);

  return (
    <>
      <div className="period-bar">
        <VehicleSelect cars={cars} value={id} onChange={setId} />
        <div className="period-nav">
          <button type="button" className="btn btn-outline sm" onClick={() => setDay((a) => shiftAnchor('day', a, -1))} aria-label="Ngày trước">‹</button>
          <DateInput aria-label="Chọn ngày" value={day} onChange={(v) => v && setDay(v)} />
          <button type="button" className="btn btn-outline sm" onClick={() => setDay((a) => shiftAnchor('day', a, 1))} aria-label="Ngày sau">›</button>
          <button type="button" className="btn btn-outline sm" onClick={() => setDay(todayIso())}>Hôm nay</button>
        </div>
        <select aria-label="Thời gian dừng tối thiểu" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
          {MIN_STOPS.map((m) => <option key={m} value={m}>Dừng từ {m} phút</option>)}
        </select>
        {loading && <span className="muted">Đang tải hành trình...</span>}
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      {data && (
        <div className="kpis" style={{ marginBottom: 14 }}>
          <Kpi label="Quãng đường" value={`${num1(km)} km`} sub="cộng từ các điểm GPS" />
          <Kpi label="Tốc độ cao nhất" value={`${maxSpeed} km/giờ`} sub={track.length ? `tín hiệu từ ${hm(track[0].t)} đến ${hm(track[track.length - 1].t)}` : 'không có tín hiệu'} />
          <Kpi label="Số lần dừng" value={stops.length} sub={`tổng ${duration(stopSeconds)}, nổ máy ${duration(idleSeconds)}`} />
        </div>
      )}
      <div className="gps-grid">
        <FleetMap track={track} stops={stops} fitKey={`${id}-${day}`} focus={focus} />
        <div className="gps-list">
          {stops.map((s, i) => (
            <button type="button" className="gps-item" key={`${s.from}-${i}`} onClick={() => setFocus({ x: s.x, y: s.y })}>
              <span className="gps-item-head"><strong>{i + 1}. {hm(s.from)} – {hm(s.to)}</strong><span className="pill pill-warn">{duration(s.seconds)}</span></span>
              <span className="muted small">{s.station && <strong>{s.station} · </strong>}{s.address}</span>
              {s.accSeconds >= 60 && <span className="small">Vẫn nổ máy {duration(s.accSeconds)}</span>}
            </button>
          ))}
          {data && !stops.length && <p className="muted">{track.length ? `Không dừng lần nào từ ${minutes} phút trở lên.` : 'Xe không có hành trình trong ngày này.'}</p>}
        </div>
      </div>
    </>
  );
}

// ---------- Nhiên liệu ----------
// normPer100km: định mức lít / 100 km khai cho xe trên Vietmap (0 = chưa khai)
const sumFuel = (rows, normPer100km) => {
  const t = { km: 0, norm: 0, consumed: 0, fuelIn: 0, fuelOut: 0, idleSeconds: 0, sensor: false };
  rows.forEach((r) => {
    t.km += r.km;
    t.consumed += r.consumed;
    t.fuelIn += r.fuelIn;
    t.fuelOut += r.fuelOut;
    t.idleSeconds += r.idleSeconds;
    if (r.signal > 0 || r.start > 0 || r.end > 0 || r.consumed > 0) t.sensor = true;
  });
  t.norm = (t.km * normPer100km) / 100;
  return t;
};

function FuelCells({ t, count }) {
  const none = <span className="muted">–</span>;
  return (
    <>
      <td className="num">{num1(t.km)} km</td>
      <td className="num">{t.norm > 0 ? `${num1(t.norm)} lít` : none}</td>
      <td className="num">{t.sensor ? <strong>{num1(t.consumed)} lít</strong> : none}</td>
      <td className="num">{t.sensor && t.km > 0 ? num1((t.consumed / t.km) * 100) : none}</td>
      <td className="num">{count == null ? <span className="muted">…</span> : count ? <strong>{count} lần</strong> : none}</td>
      <td className="num">{t.sensor ? `${num1(t.fuelIn)} lít` : none}</td>
      <td className="num">{t.sensor ? `${num1(t.fuelOut)} lít` : none}</td>
      <td className="num">{duration(t.idleSeconds)}</td>
    </>
  );
}

function FuelTab({ cars }) {
  const [id, setId] = useState(0);
  const [period, setPeriod] = useState('month');
  const [anchor, setAnchor] = useState(todayIso());
  const range = useMemo(() => rangeOf(period, anchor), [period, anchor]);

  const { data, err, loading } = useLoad(async () => {
    const [rows, stats] = await Promise.all([
      callVietmap('fuel', { ids: cars.map((c) => c.id), ...dayRange(range.from, range.to) }),
      supabase.rpc('vehicle_stats', { p_from: range.from, p_to: range.to, p_include_pending: false }),
    ]);
    const cost = stats.error ? null : Object.fromEntries((stats.data || []).map((s) => [s.vehicle_id, Number(s.fuel_cost)]));
    return { rows: rows.map(fuelRow), cost };
  }, [range.from, range.to]);

  // Số lần đổ: tìm lần đổ còn thiếu rồi đọc lại từ database (chạy sau, không làm chậm bảng)
  const [refills, setRefills] = useState({ rows: null, err: '' });
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    setRefills({ rows: null, err: '' });
    (async () => {
      let note = '';
      try {
        await syncRefills(cars, range.from, range.to, data.rows);
      } catch (e) {
        note = e.message;
      }
      try {
        const rows = await loadRefills(range.from, range.to);
        if (!cancelled) setRefills({ rows, err: note });
      } catch (e) {
        if (!cancelled) setRefills({ rows: null, err: e.message });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  const ofCar = (c) => refills.rows?.filter((r) => r.vehicle_id === c.cmsId);
  const car = cars.find((c) => c.id === id);
  const refillList = car ? ofCar(car) : refills.rows;

  const groups = useMemo(() => cars.map((c) => ({ ...c, t: sumFuel((data?.rows || []).filter((r) => r.id === c.id), c.normPer100km) })), [cars, data]);
  const days = useMemo(() => (data?.rows || []).filter((r) => r.id === id && String(r.date).slice(0, 10) <= todayIso()).sort((a, b) => String(a.date).localeCompare(String(b.date))), [data, id]);
  const normPer100km = car?.normPer100km || 0;
  const noSensor = data && groups.filter((g) => !g.t.sensor);
  const noNorm = data && groups.filter((g) => !(g.normPer100km > 0));
  const heads = <><th className="num">Quãng đường</th><th className="num">Định mức</th><th className="num">Tiêu hao</th><th className="num">Lít / 100 km</th><th className="num">Số lần đổ</th><th className="num">Đổ vào</th><th className="num">Dầu giảm</th><th className="num">Nổ máy</th></>;

  return (
    <>
      <PeriodBar {...{ period, setPeriod, anchor, setAnchor, range }}>
        <VehicleSelect cars={cars} value={id} onChange={setId} all />
      </PeriodBar>
      {err && <p className="err" role="alert">{err}</p>}
      {noSensor?.length > 0 && (
        <p className="muted small" style={{ marginTop: 0 }}>Vietmap không có số liệu cảm biến dầu trong kỳ này cho: {noSensor.map((g) => g.name).join(', ')}. Các cột tiêu hao, đổ vào, dầu giảm để trống.</p>
      )}
      {noNorm?.length > 0 && (
        <p className="muted small" style={{ marginTop: 0 }}>Chưa có định mức nhiên liệu trên Vietmap cho: {noNorm.map((g) => g.name).join(', ')}.</p>
      )}
      <div className="table-wrap">
        <table className="fleet-table staff-table">
          <thead><tr><th>{id ? 'Ngày' : 'Biển số xe'}</th>{heads}{!id && <th className="num">Phiếu chi</th>}</tr></thead>
          <tbody>
            {data && !id && groups.map((g) => {
              const cost = data.cost?.[g.cmsId];
              return (
                <tr key={g.id}><td style={{ whiteSpace: 'nowrap' }}><strong>{g.name}</strong></td><FuelCells t={g.t} count={ofCar(g)?.length} /><td className="num">{cost == null ? <span className="muted">–</span> : vnd(cost)}</td></tr>
              );
            })}
            {data && !!id && days.map((r, i) => <tr key={`${r.date}-${i}`}><td style={{ whiteSpace: 'nowrap' }}><strong>{dmy(String(r.date))}</strong></td><FuelCells t={sumFuel([r], normPer100km)} count={ofCar(car)?.filter((x) => refillDay(x) === String(r.date).slice(0, 10)).length} /></tr>)}
            {loading && <tr><td colSpan={10} className="muted">Đang tải...</td></tr>}
            {data && !!id && !days.length && <tr><td colSpan={10} className="muted">Không có số liệu trong kỳ này.</td></tr>}
          </tbody>
        </table>
      </div>
      {refills.err && <p className="err" role="alert">{refills.err}</p>}
      <p className="muted small">Định mức: quãng đường nhân định mức lít / 100 km khai cho xe trên Vietmap. Tiêu hao: theo cảm biến dầu. Nổ máy: thời gian đứng yên mà vẫn nổ máy. Phiếu chi: tiền nhiên liệu đã duyệt hoặc đã thanh toán trong CMS.</p>

      <h2 style={{ fontSize: '1.2rem', margin: '22px 0 10px' }}>Các lần đổ dầu trong kỳ</h2>
      <div className="table-wrap">
        <table className="fleet-table staff-table">
          <thead><tr><th>Thời gian</th><th>Biển số xe</th><th className="num">Số lít</th><th>Nơi đổ</th><th>Phiếu chi</th></tr></thead>
          <tbody>
            {refillList?.map((r) => {
              const v = voucherState(r);
              return (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{refillTime(r)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}><strong>{r.vehicles?.plate}</strong></td>
                  <td className="num"><strong>{num1(r.litres)} lít</strong></td>
                  <td>{r.address}</td>
                  <td>{v.tone === 'warn' ? <Link href="/nhan-vien/chi-tien/" className="pill pill-warn">{v.label}</Link> : <span className={`pill pill-${v.tone}`}>{v.label}</span>}</td>
                </tr>
              );
            })}
            {!refillList && !refills.err && <tr><td colSpan={5} className="muted">Đang tìm các lần đổ dầu...</td></tr>}
            {refillList && !refillList.length && <tr><td colSpan={5} className="muted">Không có lần đổ dầu nào trong kỳ này.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function Page() {
  const [tab, setTab] = useState('status');
  const { data, err, loading } = useLoad(async () => {
    const [gps, cms] = await Promise.all([callVietmap('vehicles'), supabase.from('vehicles').select('id, plate').order('plate')]);
    const byKey = Object.fromEntries((cms.data || []).map((v) => [plateKey(v.plate), v]));
    const cars = gps.map((g) => ({ ...g, name: byKey[plateKey(g.plate)]?.plate || g.plate, cmsId: byKey[plateKey(g.plate)]?.id || null }));
    return { cars };
  }, []);
  const cars = data?.cars;
  const nameOf = useCallback((id, fallback = '') => cars?.find((c) => c.id === id)?.name || fallback, [cars]);

  return (
    <>
      <div className="staff-head"><h1 style={{ fontSize: '1.8rem', margin: 0 }}>Định vị xe</h1></div>
      <div className="seg" role="tablist" aria-label="Dữ liệu định vị" style={{ marginBottom: 14 }}>
        {TABS.map((t) => (
          <button type="button" key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {loading && <p className="muted">Đang tải danh sách xe...</p>}
      {err && <p className="err" role="alert">{err}</p>}
      {cars && !cars.length && <p className="muted">Tài khoản Vietmap chưa có xe nào.</p>}
      {cars?.length > 0 && tab === 'status' && <StatusTab cars={cars} nameOf={nameOf} />}
      {cars?.length > 0 && tab === 'history' && <HistoryTab cars={cars} />}
      {cars?.length > 0 && tab === 'fuel' && <FuelTab cars={cars} />}
    </>
  );
}
