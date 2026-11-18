'use client';

import { useMemo, useState } from 'react';
import { vnd, orderCode } from '../../lib/supabase';
import { BONUS_RULES, dailyBonus, orderRevenue } from '../../lib/driver';

const pad = (n) => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const DOW = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const dayLabel = (iso) => `${DOW[new Date(`${iso}T00:00:00`).getDay()]}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Còn thiếu bao nhiêu doanh thu (đơn hoàn thành) để lên mức thưởng tiếp theo
function nextTier(done) {
  const tiers = [...BONUS_RULES].reverse(); // thấp -> cao
  const t = tiers.find((x) => done < x.min);
  return t ? { need: t.min - done, bonus: t.bonus } : null;
}

// Doanh số và thưởng theo ngày của CHÍNH lái xe (dữ liệu chỉ gồm chuyến của lái xe này)
export default function DriverBonus({ orders }) {
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7)); // yyyy-mm

  const days = useMemo(() => {
    const m = {};
    orders.forEach((o) => {
      if (!o.ship_date) return;
      const r = orderRevenue(o);
      const d = (m[o.ship_date] = m[o.ship_date] || { date: o.ship_date, n: 0, total: 0, done: 0, orders: [] });
      d.n += 1;
      d.total += r.total;
      d.done += r.done;
      d.orders.push({ code: orderCode(o.order_no), done: r.total > 0 && r.done >= r.total, part: r.done > 0 && r.done < r.total });
    });
    return Object.values(m).map((d) => ({ ...d, bonus: dailyBonus(d.done) })).sort((a, b) => b.date.localeCompare(a.date));
  }, [orders]);

  const todayStat = days.find((d) => d.date === today) || { n: 0, total: 0, done: 0, bonus: 0, orders: [] };
  const monthDays = days.filter((d) => d.date.startsWith(month));
  const sum = monthDays.reduce((a, d) => ({ n: a.n + d.n, total: a.total + d.total, done: a.done + d.done, bonus: a.bonus + d.bonus }), { n: 0, total: 0, done: 0, bonus: 0 });
  const next = nextTier(todayStat.done);

  const shift = (dir) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };

  return (
    <div className="drv-bonus">
      <section className="drv-bonus-today">
        <p className="drv-bonus-cap">Hôm nay · {dayLabel(today)}</p>
        <p className="drv-bonus-big">{vnd(todayStat.bonus)}</p>
        <p className="drv-bonus-sub">thưởng doanh số hôm nay</p>
        <div className="drv-bonus-grid">
          <div><span>Số chuyến</span><strong>{todayStat.n}</strong></div>
          <div><span>Doanh thu đơn hoàn thành</span><strong>{vnd(todayStat.done)}</strong></div>
        </div>
        {next ? (
          <p className="drv-bonus-next">Cần thêm <strong>{vnd(next.need)}</strong> doanh thu đơn hoàn thành để đạt mức thưởng <strong>{vnd(next.bonus)}</strong>.</p>
        ) : (
          <p className="drv-bonus-next">Bạn đã đạt mức thưởng cao nhất hôm nay.</p>
        )}
      </section>

      <div className="drv-bonus-rules">
        <strong>Mức thưởng theo ngày</strong>
        {[...BONUS_RULES].reverse().map((r) => (
          <span key={r.min}>{r.label}: <b>{vnd(r.bonus)}</b></span>
        ))}
        <small>Chỉ tính đơn đã Hoàn thành (đã có biên bản hoặc bill).</small>
      </div>

      <div className="drv-month">
        <button type="button" onClick={() => shift(-1)} aria-label="Tháng trước">‹</button>
        <strong>Tháng {month.slice(5, 7)}/{month.slice(0, 4)}</strong>
        <button type="button" onClick={() => shift(1)} aria-label="Tháng sau">›</button>
      </div>
      <div className="drv-bonus-grid month">
        <div><span>Tổng thưởng</span><strong className="gold">{vnd(sum.bonus)}</strong></div>
        <div><span>Số chuyến</span><strong>{sum.n}</strong></div>
        <div><span>Doanh thu</span><strong>{vnd(sum.total)}</strong></div>
        <div><span>Đơn hoàn thành</span><strong>{vnd(sum.done)}</strong></div>
      </div>

      {monthDays.length ? (
        <ul className="drv-days-list">
          {monthDays.map((d) => (
            <li key={d.date} className={d.bonus ? 'has' : ''}>
              <div className="drv-day-head">
                <strong>{dayLabel(d.date)}</strong>
                <span className="drv-day-bonus">{d.bonus ? `+ ${vnd(d.bonus)}` : 'Chưa đạt thưởng'}</span>
              </div>
              <p>{d.n} chuyến · doanh thu {vnd(d.total)} · hoàn thành {vnd(d.done)}</p>
              <p className="drv-day-codes">
                {d.orders.map((o, i) => <span key={i} className={o.done ? 'done' : o.part ? 'part' : ''}>{o.code}</span>)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="drv-empty">Tháng này chưa có chuyến nào.</p>
      )}
    </div>
  );
}
