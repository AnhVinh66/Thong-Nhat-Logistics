'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, vnd } from '../../../lib/supabase';
import { drivers as defaultDrivers } from '../../../lib/site';
import { rangeOf, shiftAnchor, todayIso, pad } from '../../../lib/period';
import { dailyBonus, orderRevenue } from '../../../lib/driver';
import MoneyInput from '../../../components/staff/MoneyInput';
import DateInput from '../../../components/DateInput';
import { useRole } from '../../../components/staff/Role';

// Trạng thái chấm công: nhãn ô, số công, mô tả. Ô chưa chấm: tự tính "đi làm" nếu hôm đó có chạy đơn.
const STATUS = {
  full: { mark: '✓', cong: 1, label: 'Đi làm cả ngày (1 công)' },
  half: { mark: '½', cong: 0.5, label: 'Nửa ngày (0,5 công)' },
  leave: { mark: 'P', cong: 1, label: 'Nghỉ phép có lương (1 công)' },
  off: { mark: '✕', cong: 0, label: 'Nghỉ không lương (0 công)' },
};
const CYCLE = ['', 'full', 'half', 'leave', 'off']; // bấm liên tiếp vào ô để đổi; '' = bỏ chấm, quay về tự tính
const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const fmtCong = (n) => String(Math.round(n * 2) / 2).replace('.', ',');

const COLS = 'id, order_type, driver, ship_date, fee, status, order_stops(fee, status)';

async function fetchOrders(from, to) {
  let all = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await supabase.from('orders').select(COLS)
      .not('driver', 'is', null).gte('ship_date', from).lte('ship_date', to)
      .order('ship_date').range(i, i + 999);
    if (error) return { error };
    all = all.concat(data || []);
    if (!data || data.length < 1000) return { data: all };
  }
}

export default function Page() {
  const { role } = useRole();
  const canEdit = role === 'staff' || role === 'accountant';
  const [anchor, setAnchor] = useState(todayIso);
  const [orders, setOrders] = useState([]);
  const [names, setNames] = useState(defaultDrivers);
  const [att, setAtt] = useState({}); // "tên|ngày" -> trạng thái
  const [pay, setPay] = useState({}); // tên -> { salary, std } (chuỗi, để gõ dở vẫn được)
  const [adj, setAdj] = useState({}); // tên -> { allowance, advance, deduction }
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const range = useMemo(() => rangeOf('month', anchor), [anchor]);
  const month = range.from.slice(0, 7);
  const dim = Number(range.to.slice(8, 10));
  const dates = useMemo(() => Array.from({ length: dim }, (_, i) => `${month}-${pad(i + 1)}`), [month, dim]);

  const load = useCallback(async () => {
    setLoading(true);
    const [o, d, a, p, j] = await Promise.all([
      fetchOrders(range.from, range.to),
      supabase.from('staff_roles').select('driver_name').eq('role', 'driver'),
      supabase.from('attendance').select('driver_name, work_date, status').gte('work_date', range.from).lte('work_date', range.to),
      supabase.from('driver_pay').select('driver_name, monthly_salary, std_days'),
      supabase.from('payroll_month').select('driver_name, allowance, advance, deduction').eq('month', month),
    ]);
    const bad = [o, a, p, j].find((x) => x.error);
    setErr(bad ? 'Không tải được dữ liệu. Nếu chưa chạy supabase/cham-cong.sql trong Supabase thì hãy chạy file đó trước.' : '');
    setOrders(o.data || []);
    if (!d.error && d.data) setNames([...new Set([...d.data.map((x) => x.driver_name).filter(Boolean), ...defaultDrivers])]);
    setAtt(Object.fromEntries((a.data || []).map((x) => [`${x.driver_name}|${x.work_date}`, x.status])));
    setPay(Object.fromEntries((p.data || []).map((x) => [x.driver_name, { salary: String(x.monthly_salary ?? 0), std: String(x.std_days ?? 26) }])));
    setAdj(Object.fromEntries((j.data || []).map((x) => [x.driver_name, { allowance: String(x.allowance ?? 0), advance: String(x.advance ?? 0), deduction: String(x.deduction ?? 0) }])));
    setLoading(false);
  }, [range.from, range.to, month]);

  useEffect(() => { load(); }, [load]);

  // Doanh thu hoàn thành theo lái xe -> ngày (để tự điền ngày đi làm và tính thưởng doanh số)
  const work = useMemo(() => {
    const m = {};
    orders.forEach((o) => {
      const n = o.driver.trim();
      const day = ((m[n] = m[n] || {})[o.ship_date] = m[n][o.ship_date] || { n: 0, done: 0 });
      day.n += 1;
      day.done += orderRevenue(o).done;
    });
    return m;
  }, [orders]);

  const allNames = useMemo(() => {
    const s = new Set(names);
    Object.keys(work).forEach((n) => s.add(n));
    return [...s].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [names, work]);

  const rows = useMemo(() => allNames.map((name) => {
    let cong = 0, auto = 0, off = 0, leave = 0;
    const cells = dates.map((date) => {
      const rec = att[`${name}|${date}`] || '';
      const eff = rec || (work[name]?.[date] ? 'full' : '');
      if (eff) cong += STATUS[eff].cong;
      if (!rec && eff) auto += 1;
      if (eff === 'off') off += 1;
      if (eff === 'leave') leave += 1;
      return { date, rec, eff, n: work[name]?.[date]?.n || 0 };
    });
    const salary = Number(pay[name]?.salary || 0);
    const std = Number(pay[name]?.std || 26) || 26;
    const base = Math.round((salary / std) * cong);
    const bonus = Object.values(work[name] || {}).reduce((a, x) => a + dailyBonus(x.done), 0);
    const a = adj[name] || {};
    const allowance = Number(a.allowance || 0), advance = Number(a.advance || 0), deduction = Number(a.deduction || 0);
    return { name, cells, cong, auto, off, leave, salary, std, base, bonus, allowance, advance, deduction, net: base + bonus + allowance - advance - deduction };
  }), [allNames, dates, att, work, pay, adj]);

  const sum = rows.reduce((s, r) => ({ base: s.base + r.base, bonus: s.bonus + r.bonus, allowance: s.allowance + r.allowance, cut: s.cut + r.advance + r.deduction, net: s.net + r.net }), { base: 0, bonus: 0, allowance: 0, cut: 0, net: 0 });

  // ----- Ghi dữ liệu -----
  const fail = () => setErr('Không lưu được. Chỉ Admin và Kế toán được sửa; hoặc chưa chạy supabase/cham-cong.sql.');

  const cycle = async (name, date, cur) => {
    if (!canEdit) return;
    const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
    const key = `${name}|${date}`;
    setErr('');
    setAtt((s) => { const c = { ...s }; if (next) c[key] = next; else delete c[key]; return c; });
    const { error } = next
      ? await supabase.from('attendance').upsert({ driver_name: name, work_date: date, status: next, updated_at: new Date().toISOString() })
      : await supabase.from('attendance').delete().eq('driver_name', name).eq('work_date', date);
    if (error) { fail(); load(); }
  };

  const savePay = async (name) => {
    const p = pay[name] || {};
    const { error } = await supabase.from('driver_pay').upsert({
      driver_name: name, monthly_salary: Number(p.salary || 0), std_days: Number(p.std || 26) || 26, updated_at: new Date().toISOString(),
    });
    if (error) fail(); else setErr('');
  };
  const saveAdj = async (name) => {
    const a = adj[name] || {};
    const { error } = await supabase.from('payroll_month').upsert({
      month, driver_name: name, allowance: Number(a.allowance || 0), advance: Number(a.advance || 0), deduction: Number(a.deduction || 0), updated_at: new Date().toISOString(),
    });
    if (error) fail(); else setErr('');
  };
  const setPayField = (name, k, v) => setPay((s) => ({ ...s, [name]: { salary: '0', std: '26', ...s[name], [k]: v } }));
  const setAdjField = (name, k, v) => setAdj((s) => ({ ...s, [name]: { allowance: '0', advance: '0', deduction: '0', ...s[name], [k]: v } }));

  const today = todayIso();

  return (
    <>
      <div className="staff-head">
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Chấm công & lương lái xe</h1>
      </div>

      <div className="period-bar">
        <div className="period-nav">
          <button type="button" className="btn btn-outline sm" onClick={() => setAnchor((a) => shiftAnchor('month', a, -1))} aria-label="Tháng trước">‹</button>
          <DateInput aria-label="Chọn một ngày trong tháng" value={anchor} onChange={(v) => v && setAnchor(v)} />
          <button type="button" className="btn btn-outline sm" onClick={() => setAnchor((a) => shiftAnchor('month', a, 1))} aria-label="Tháng sau">›</button>
          <button type="button" className="btn btn-outline sm" onClick={() => setAnchor(todayIso())}>Tháng này</button>
        </div>
        <strong className="period-label">{range.label}</strong>
      </div>

      <div className="kpis" style={{ marginBottom: 14, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <div className="kpi"><span className="kpi-text"><span className="kpi-label">Lương theo ngày công</span><span className="kpi-value">{vnd(sum.base)}</span><span className="kpi-sub">{rows.length} lái xe</span></span></div>
        <div className="kpi"><span className="kpi-text"><span className="kpi-label">Thưởng doanh số</span><span className="kpi-value" style={{ color: 'var(--gold)' }}>{vnd(sum.bonus)}</span><span className="kpi-sub">cộng thưởng từng ngày</span></span></div>
        <div className="kpi"><span className="kpi-text"><span className="kpi-label">Phụ cấp − tạm ứng − khấu trừ</span><span className="kpi-value">{vnd(sum.allowance - sum.cut)}</span><span className="kpi-sub">cộng {vnd(sum.allowance)} · trừ {vnd(sum.cut)}</span></span></div>
        <div className="kpi"><span className="kpi-text"><span className="kpi-label">Tổng thực lãnh</span><span className="kpi-value" style={{ color: 'var(--ok)' }}>{vnd(sum.net)}</span><span className="kpi-sub">cần chi cho lái xe tháng này</span></span></div>
      </div>

      {err && <p className="err" role="alert">{err}</p>}

      <h2 className="att-h2">1. Bảng chấm công</h2>
      <div className="bonus-rules">
        {canEdit ? 'Bấm vào ô để đổi trạng thái:' : 'Trạng thái:'}
        {Object.values(STATUS).map((s) => <span key={s.mark} className="bonus-chip"><b>{s.mark}</b> {s.label}</span>)}
        <span className="bonus-chip"><b className="att-auto">✓</b> ngày có chạy đơn mà chưa chấm: tự tính đi làm</span>
      </div>
      <div className="table-wrap">
        <table className="staff-table att-table">
          <thead>
            <tr>
              <th className="att-name">Lái xe</th>
              {dates.map((d) => {
                const dow = new Date(`${d}T00:00:00`).getDay();
                return <th key={d} className={`att-day${dow === 0 ? ' sun' : ''}${d === today ? ' today' : ''}`}>{Number(d.slice(8))}<small>{DOW[dow]}</small></th>;
              })}
              <th className="num">Công</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="att-name"><strong>{r.name}</strong></td>
                {r.cells.map((c) => (
                  <td key={c.date} className={`att-cell${c.eff ? ` ${c.eff}` : ''}${c.eff && !c.rec ? ' auto' : ''}`}>
                    <button type="button" disabled={!canEdit} onClick={() => cycle(r.name, c.date, c.rec)}
                      title={`${c.date.slice(8)}/${c.date.slice(5, 7)}${c.n ? ` · ${c.n} đơn` : ''}${c.eff ? ` · ${STATUS[c.eff].label}${c.rec ? '' : ' (tự tính)'}` : ''}`}>
                      {c.eff ? STATUS[c.eff].mark : ''}
                    </button>
                  </td>
                ))}
                <td className="num"><strong>{fmtCong(r.cong)}</strong></td>
              </tr>
            ))}
            {loading && <tr><td colSpan={dim + 2} className="muted">Đang tải...</td></tr>}
            {!loading && !rows.length && <tr><td colSpan={dim + 2} className="muted">Chưa có lái xe nào.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 className="att-h2">2. Tính lương tháng</h2>
      <p className="muted small" style={{ margin: '0 0 8px' }}>
        Lương theo công = lương tháng ÷ ngày công chuẩn × số công. Thực lãnh = lương theo công + thưởng doanh số + phụ cấp − tạm ứng − khấu trừ. Ô vàng nhập tay, tự lưu khi rời ô.
      </p>
      <div className="table-wrap">
        <table className="staff-table fleet-table att-pay">
          <thead>
            <tr>
              <th>Lái xe</th><th className="num">Lương tháng</th><th className="num">Công chuẩn</th><th className="num">Số công</th>
              <th className="num">Lương theo công</th><th className="num">Thưởng doanh số</th><th className="num">Phụ cấp / thưởng khác</th>
              <th className="num">Tạm ứng</th><th className="num">Khấu trừ</th><th className="num">Thực lãnh</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td><strong>{r.name}</strong></td>
                <td className="num"><MoneyInput className="att-in" disabled={!canEdit} value={pay[r.name]?.salary === '0' ? '' : (pay[r.name]?.salary ?? '')} onChange={(e) => setPayField(r.name, 'salary', e.target.value.replace(/\D/g, ''))} onBlur={() => savePay(r.name)} placeholder="0" /></td>
                <td className="num"><input className="att-in att-std" disabled={!canEdit} inputMode="decimal" value={pay[r.name]?.std ?? '26'} onChange={(e) => setPayField(r.name, 'std', e.target.value.replace(/[^\d.]/g, ''))} onBlur={() => savePay(r.name)} /></td>
                <td className="num"><strong>{fmtCong(r.cong)}</strong>{(r.auto > 0 || r.off > 0 || r.leave > 0) && <small className="att-sub">{[r.auto && `${r.auto} tự tính`, r.leave && `${r.leave} phép`, r.off && `${r.off} nghỉ`].filter(Boolean).join(' · ')}</small>}</td>
                <td className="num">{vnd(r.base)}</td>
                <td className="num"><span style={{ color: r.bonus ? 'var(--gold)' : 'var(--muted)' }}>{vnd(r.bonus)}</span></td>
                <td className="num"><MoneyInput className="att-in" disabled={!canEdit} value={adj[r.name]?.allowance === '0' ? '' : (adj[r.name]?.allowance ?? '')} onChange={(e) => setAdjField(r.name, 'allowance', e.target.value.replace(/\D/g, ''))} onBlur={() => saveAdj(r.name)} placeholder="0" /></td>
                <td className="num"><MoneyInput className="att-in" disabled={!canEdit} value={adj[r.name]?.advance === '0' ? '' : (adj[r.name]?.advance ?? '')} onChange={(e) => setAdjField(r.name, 'advance', e.target.value.replace(/\D/g, ''))} onBlur={() => saveAdj(r.name)} placeholder="0" /></td>
                <td className="num"><MoneyInput className="att-in" disabled={!canEdit} value={adj[r.name]?.deduction === '0' ? '' : (adj[r.name]?.deduction ?? '')} onChange={(e) => setAdjField(r.name, 'deduction', e.target.value.replace(/\D/g, ''))} onBlur={() => saveAdj(r.name)} placeholder="0" /></td>
                <td className="num"><strong style={{ color: 'var(--ok)' }}>{vnd(r.net)}</strong></td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4}><strong>Tổng ({rows.length} lái xe)</strong></td>
                <td className="num"><strong>{vnd(sum.base)}</strong></td>
                <td className="num"><strong>{vnd(sum.bonus)}</strong></td>
                <td className="num"><strong>{vnd(sum.allowance)}</strong></td>
                <td className="num" colSpan={2}><strong>− {vnd(sum.cut)}</strong></td>
                <td className="num"><strong>{vnd(sum.net)}</strong></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}
