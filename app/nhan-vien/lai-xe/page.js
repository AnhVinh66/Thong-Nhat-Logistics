'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, vnd, orderCode } from '../../../lib/supabase';
import { drivers as defaultDrivers } from '../../../lib/site';
import { PERIODS, rangeOf, shiftAnchor, todayIso, dmy } from '../../../lib/period';
import { BONUS_RULES, dailyBonus, orderRevenue } from '../../../lib/driver';
import DateInput from '../../../components/DateInput';

const COLS = 'id, order_no, order_type, driver, ship_date, fee, status, order_stops(fee, status)';

// Lấy đủ mọi đơn trong kỳ (mỗi lần tối đa 1000 dòng)
async function fetchOrders(from, to) {
  let all = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await supabase.from('orders').select(COLS)
      .not('driver', 'is', null).gte('ship_date', from).lte('ship_date', to)
      .order('ship_date').order('order_no').range(i, i + 999);
    if (error) return { error };
    all = all.concat(data || []);
    if (!data || data.length < 1000) return { data: all };
  }
}

const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const dowOf = (s) => DOW[new Date(`${s}T00:00:00`).getDay()];

export default function Page() {
  const [period, setPeriod] = useState('month');
  const [anchor, setAnchor] = useState(todayIso);
  const [orders, setOrders] = useState([]);
  const [names, setNames] = useState(defaultDrivers);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState({});

  const range = useMemo(() => rangeOf(period, anchor), [period, anchor]);

  const load = useCallback(async () => {
    setLoading(true);
    const [o, d] = await Promise.all([
      fetchOrders(range.from, range.to),
      supabase.from('staff_roles').select('driver_name').eq('role', 'driver'),
    ]);
    if (o.error) setErr('Không tải được dữ liệu đơn hàng.');
    else {
      setErr('');
      setOrders(o.data);
    }
    if (!d.error && d.data) setNames([...new Set([...d.data.map((x) => x.driver_name).filter(Boolean), ...defaultDrivers])]);
    setLoading(false);
  }, [range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  // Gộp theo lái xe -> theo ngày
  const stats = useMemo(() => {
    const by = {};
    const ensure = (n) => (by[n] = by[n] || { name: n, n: 0, total: 0, done: 0, days: {} });
    names.forEach(ensure);
    orders.forEach((o) => {
      const d = ensure(o.driver.trim());
      const rev = orderRevenue(o);
      d.n += 1;
      d.total += rev.total;
      d.done += rev.done;
      const day = (d.days[o.ship_date] = d.days[o.ship_date] || { date: o.ship_date, n: 0, total: 0, done: 0, orders: [] });
      day.n += 1;
      day.total += rev.total;
      day.done += rev.done;
      day.orders.push(o);
    });
    return Object.values(by).map((d) => {
      const days = Object.values(d.days).sort((a, b) => b.date.localeCompare(a.date)).map((x) => ({ ...x, bonus: dailyBonus(x.done) }));
      const bonus = days.reduce((a, x) => a + x.bonus, 0);
      return { ...d, days, bonus, bonusDays: days.filter((x) => x.bonus > 0).length };
    }).sort((a, b) => b.bonus - a.bonus || b.total - a.total || a.name.localeCompare(b.name, 'vi'));
  }, [orders, names]);

  const sum = stats.reduce((a, d) => ({ n: a.n + d.n, total: a.total + d.total, done: a.done + d.done, bonus: a.bonus + d.bonus }), { n: 0, total: 0, done: 0, bonus: 0 });

  return (
    <>
      <div className="staff-head">
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Lái xe</h1>
      </div>

      <div className="period-bar">
        <div className="seg" role="radiogroup" aria-label="Kỳ thống kê">
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
      </div>

      <div className="kpis" style={{ marginBottom: 14, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <div className="kpi"><span className="kpi-text"><span className="kpi-label">Tổng số đơn hàng</span><span className="kpi-value">{sum.n}</span><span className="kpi-sub">{range.label}</span></span></div>
        <div className="kpi"><span className="kpi-text"><span className="kpi-label">Tổng doanh thu</span><span className="kpi-value">{vnd(sum.total)}</span><span className="kpi-sub">mọi đơn đã giao cho lái xe</span></span></div>
        <div className="kpi"><span className="kpi-text"><span className="kpi-label">Doanh thu đơn hoàn thành</span><span className="kpi-value" style={{ color: 'var(--ok)' }}>{vnd(sum.done)}</span><span className="kpi-sub">dùng để tính thưởng</span></span></div>
        <div className="kpi"><span className="kpi-text"><span className="kpi-label">Tổng thưởng doanh số</span><span className="kpi-value" style={{ color: 'var(--gold)' }}>{vnd(sum.bonus)}</span><span className="kpi-sub">cộng thưởng từng ngày</span></span></div>
      </div>

      <div className="bonus-rules">
        <strong>Thưởng doanh số theo ngày</strong> (tổng doanh thu các đơn đã Hoàn thành trong ngày chạy):
        {[...BONUS_RULES].reverse().map((r) => <span key={r.min} className="bonus-chip">{r.label} → <b>{vnd(r.bonus)}</b></span>)}
      </div>

      {err && <p className="err" role="alert">{err}</p>}
      <div className="table-wrap">
        <table className="fleet-table staff-table drv-table">
          <thead>
            <tr>
              <th>Lái xe</th><th className="num">Số đơn</th><th className="num">Doanh thu</th><th className="num">Doanh thu đơn hoàn thành</th>
              <th className="num">Số ngày đạt thưởng</th><th className="num">Thưởng doanh số</th><th aria-label="Chi tiết"></th>
            </tr>
          </thead>
          <tbody>
            {stats.map((d) => (
              <Fragment key={d.name}>
                <tr>
                  <td><strong>{d.name}</strong></td>
                  <td className="num">{d.n}</td>
                  <td className="num">{vnd(d.total)}</td>
                  <td className="num" style={{ color: d.done ? 'var(--ok)' : undefined }}>{vnd(d.done)}</td>
                  <td className="num">{d.bonusDays} / {d.days.length} ngày chạy</td>
                  <td className="num"><strong style={{ color: d.bonus ? 'var(--gold)' : 'var(--muted)' }}>{vnd(d.bonus)}</strong></td>
                  <td className="actions">
                    {d.days.length > 0 && (
                      <button className="btn btn-outline sm" aria-expanded={!!open[d.name]} onClick={() => setOpen((s) => ({ ...s, [d.name]: !s[d.name] }))}>
                        Theo ngày {open[d.name] ? '▴' : '▾'}
                      </button>
                    )}
                  </td>
                </tr>
                {open[d.name] && (
                  <tr className="drv-detail-row">
                    <td colSpan={7}>
                      <table className="drv-days">
                        <thead>
                          <tr><th>Ngày chạy</th><th>Đơn hàng</th><th className="num">Doanh thu</th><th className="num">Doanh thu hoàn thành</th><th className="num">Thưởng</th></tr>
                        </thead>
                        <tbody>
                          {d.days.map((x) => (
                            <tr key={x.date}>
                              <td>{dowOf(x.date)} {dmy(x.date)}</td>
                              <td>
                                {x.orders.map((o) => (
                                  <span key={o.id} className={`drv-ord ${orderRevenue(o).done >= orderRevenue(o).total && orderRevenue(o).total > 0 ? 'done' : orderRevenue(o).done > 0 ? 'part' : ''}`} title={o.order_type === 'multi' ? 'Đơn nhiều điểm: chỉ tính các điểm trả đã Hoàn thành' : undefined}>
                                    {orderCode(o.order_no)}
                                  </span>
                                ))}
                              </td>
                              <td className="num">{vnd(x.total)}</td>
                              <td className="num">{vnd(x.done)}</td>
                              <td className="num"><strong style={{ color: x.bonus ? 'var(--gold)' : 'var(--muted)' }}>{x.bonus ? vnd(x.bonus) : '—'}</strong></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="muted small" style={{ margin: '6px 0 0' }}>Mã đơn màu xanh: đã Hoàn thành; vàng: đơn nhiều điểm mới xong một phần; xám: chưa hoàn thành (chưa tính thưởng).</p>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {loading && <tr><td colSpan={7} className="muted">Đang tải...</td></tr>}
            {!loading && !stats.length && <tr><td colSpan={7} className="muted">Chưa có lái xe nào.</td></tr>}
          </tbody>
          {stats.length > 0 && (
            <tfoot>
              <tr>
                <td><strong>Tổng ({stats.length} lái xe)</strong></td>
                <td className="num"><strong>{sum.n}</strong></td>
                <td className="num"><strong>{vnd(sum.total)}</strong></td>
                <td className="num"><strong>{vnd(sum.done)}</strong></td>
                <td></td>
                <td className="num"><strong>{vnd(sum.bonus)}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}
