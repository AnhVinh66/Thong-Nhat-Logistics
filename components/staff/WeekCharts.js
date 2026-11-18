'use client';

import { useMemo, useState } from 'react';
import { vnd } from '../../lib/supabase';

// ---------- ngày / tuần (thứ Hai là đầu tuần) ----------
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const mondayOf = (s) => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const dm = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

// Rút gọn tiền cho trục và nhãn: 12,5tr / 850k
const short = (v) => {
  const n = Number(v || 0);
  if (n >= 1e9) return `${(n / 1e9).toFixed(n % 1e9 ? 1 : 0).replace('.', ',')} tỷ`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n % 1e6 >= 1e5 ? 1 : 0).replace('.', ',')}tr`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
};
// Trục "đẹp": 0 .. max chia 4 bậc tròn
function niceMax(v) {
  if (v <= 0) return 4;
  const raw = v / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw);
  return step * 4;
}

// Biểu đồ cột một chuỗi số liệu (không trục kép). points: [{ key, label, value, sub, highlight }]
function BarChart({ id, points, color, format, unitLabel, height = 220 }) {
  const [hover, setHover] = useState(null);
  const W = 640;
  const H = height;
  const m = { t: 22, r: 8, b: 30, l: 46 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const band = iw / Math.max(1, points.length);
  const bw = Math.min(24, band * 0.6);
  const y = (v) => m.t + ih - (v / max) * ih;
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);
  // Nhãn trực tiếp chọn lọc: điểm cao nhất và điểm đang được làm nổi bật (tuần / ngày hiện tại)
  const maxIdx = points.reduce((b, p, i) => (p.value > (points[b]?.value ?? -1) ? i : b), 0);
  const labelled = new Set([maxIdx, points.findIndex((p) => p.highlight)].filter((i) => i >= 0 && points[i]?.value > 0));
  const bar = (x, top, w) => {
    const h = m.t + ih - top;
    if (h <= 0) return '';
    const r = Math.min(4, w / 2, h);
    return `M${x},${m.t + ih}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${m.t + ih}Z`;
  };
  const hp = hover != null ? points[hover] : null;

  return (
    <div className="wc-chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-desc`}>
        <desc id={`${id}-desc`}>{`${unitLabel}: ${points.map((p) => `${p.label} ${format(p.value)}`).join('; ')}`}</desc>
        {ticks.map((t) => (
          <g key={t}>
            <line className="wc-grid" x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />
            <text className="wc-axis" x={m.l - 6} y={y(t) + 4} textAnchor="end">{short(t)}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = m.l + band * i + band / 2;
          return (
            <g key={p.key}>
              {/* vùng rê chuột rộng hơn cột */}
              <rect x={m.l + band * i} y={m.t} width={band} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${p.label}: ${format(p.value)}${p.sub ? `, ${p.sub}` : ''}`} />
              <path d={bar(cx - bw / 2, y(p.value), bw)} style={{ fill: color, opacity: hover == null || hover === i ? 1 : 0.45 }} pointerEvents="none" />
              {labelled.has(i) && <text className="wc-val" x={cx} y={y(p.value) - 6} textAnchor="middle">{short(p.value)}</text>}
              <text className={`wc-axis ${p.highlight ? 'wc-now' : ''}`} x={cx} y={H - 10} textAnchor="middle">{p.label}</text>
            </g>
          );
        })}
      </svg>
      {hp && (
        <div className="wc-tip" style={{ left: `${((m.l + band * hover + band / 2) / W) * 100}%` }} role="status">
          <strong>{hp.title || hp.label}</strong>
          <span><i style={{ background: color }} />{unitLabel}: <b>{format(hp.value)}</b></span>
          {hp.sub && <span className="muted">{hp.sub}</span>}
        </div>
      )}
    </div>
  );
}

// Dashboard đơn hàng & doanh thu theo tuần (dữ liệu: các đơn đã tải ở trang Tổng quan)
export default function WeekCharts({ orders, today, weeks = 12 }) {
  const [showTable, setShowTable] = useState(false);
  const data = useMemo(() => {
    const thisMon = mondayOf(today);
    const firstMon = addDays(thisMon, -7 * (weeks - 1));
    const wk = Array.from({ length: weeks }, (_, i) => {
      const from = addDays(firstMon, 7 * i);
      return { key: from, from, to: addDays(from, 6), n: 0, fee: 0 };
    });
    const days = Array.from({ length: 7 }, (_, i) => ({ key: addDays(thisMon, i), date: addDays(thisMon, i), n: 0, fee: 0 }));
    orders.forEach((o) => {
      if (!o.ship_date) return;
      const w = wk.find((x) => o.ship_date >= x.from && o.ship_date <= x.to);
      if (w) { w.n += 1; w.fee += Number(o.fee || 0); }
      const d = days.find((x) => x.date === o.ship_date);
      if (d) { d.n += 1; d.fee += Number(o.fee || 0); }
    });
    const cur = wk[wk.length - 1];
    const prev = wk[wk.length - 2];
    return { wk, days, cur, prev, thisMon };
  }, [orders, today, weeks]);

  const { wk, days, cur, prev } = data;
  const pct = prev && prev.fee > 0 ? Math.round(((cur.fee - prev.fee) / prev.fee) * 100) : null;
  const weekLabel = (w) => `Tuần ${dm(w.from)} – ${dm(w.to)}`;

  return (
    <section className="panel panel-wide wc">
      <div className="panel-head">
        <h2>Đơn hàng &amp; doanh thu theo tuần</h2>
        <button type="button" className="panel-link wc-toggle" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}>
          {showTable ? 'Xem biểu đồ' : 'Xem bảng số liệu'}
        </button>
      </div>

      <div className="wc-heroes">
        <div className="wc-hero">
          <span className="wc-hero-label">Doanh thu tuần này</span>
          <strong className="wc-hero-value">{vnd(cur.fee)}</strong>
          <span className={`wc-delta ${pct == null ? '' : pct >= 0 ? 'up' : 'down'}`}>
            {pct == null ? 'Tuần trước chưa có doanh thu' : `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% so với tuần trước (${vnd(prev.fee)})`}
          </span>
        </div>
        <div className="wc-hero">
          <span className="wc-hero-label">Đơn hàng tuần này</span>
          <strong className="wc-hero-value">{cur.n} đơn</strong>
          <span className="wc-delta">Tuần trước: {prev ? prev.n : 0} đơn</span>
        </div>
        <div className="wc-hero">
          <span className="wc-hero-label">Trung bình {weeks} tuần</span>
          <strong className="wc-hero-value">{vnd(Math.round(wk.reduce((a, w) => a + w.fee, 0) / weeks))}</strong>
          <span className="wc-delta">{(wk.reduce((a, w) => a + w.n, 0) / weeks).toFixed(1).replace('.', ',')} đơn / tuần</span>
        </div>
      </div>

      {showTable ? (
        <div className="table-wrap">
          <table className="fleet-table staff-table">
            <thead><tr><th>Tuần</th><th className="num">Số đơn</th><th className="num">Doanh thu</th></tr></thead>
            <tbody>
              {[...wk].reverse().map((w) => (
                <tr key={w.key}><td>{weekLabel(w)}{w === cur ? ' (tuần này)' : ''}</td><td className="num">{w.n}</td><td className="num">{vnd(w.fee)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="wc-grid3">
          <figure className="wc-fig">
            <figcaption>Doanh thu {weeks} tuần gần nhất</figcaption>
            <BarChart
              id="wc-rev"
              color="var(--chart-1)"
              unitLabel="Doanh thu"
              format={vnd}
              points={wk.map((w) => ({ key: w.key, label: dm(w.from), title: weekLabel(w), value: w.fee, sub: `${w.n} đơn hàng`, highlight: w === cur }))}
            />
          </figure>
          <figure className="wc-fig">
            <figcaption>Số đơn hàng {weeks} tuần gần nhất</figcaption>
            <BarChart
              id="wc-cnt"
              color="var(--chart-2)"
              unitLabel="Số đơn"
              format={(v) => `${v} đơn`}
              points={wk.map((w) => ({ key: w.key, label: dm(w.from), title: weekLabel(w), value: w.n, sub: vnd(w.fee), highlight: w === cur }))}
            />
          </figure>
          <figure className="wc-fig">
            <figcaption>Tuần này theo ngày ({dm(days[0].date)} – {dm(days[6].date)})</figcaption>
            <BarChart
              id="wc-day"
              color="var(--chart-1)"
              unitLabel="Doanh thu"
              format={vnd}
              points={days.map((d, i) => ({ key: d.key, label: DOW[i], title: `${DOW[i]}, ${dm(d.date)}`, value: d.fee, sub: `${d.n} đơn hàng`, highlight: d.date === today }))}
            />
          </figure>
        </div>
      )}
      <p className="muted small" style={{ margin: '10px 0 0' }}>Doanh thu = tổng cước các đơn theo ngày vận chuyển. Rê chuột lên cột để xem số liệu.</p>
    </section>
  );
}
