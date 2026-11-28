'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, vnd, displayLogin } from '../../../lib/supabase';
import MoneyInput from '../../../components/staff/MoneyInput';
import LoanImport from '../../../components/staff/LoanImport';

// Lãi lỗ theo xe = Doanh thu − (Nhiên liệu + Cầu đường BOT + Bảo dưỡng + Khấu hao + Lãi ngân hàng)
// Số liệu do database tính (hàm vehicle_profit trong supabase/lai-lo.sql), chia theo từng tháng.

const pad = (n) => String(n).padStart(2, '0');
const nowVN = () => {
  const d = new Date(Date.now() + 7 * 3600e3);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
};
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

const TABS = [
  { id: 'profit', label: 'Lãi lỗ' },
  { id: 'dep', label: 'Khấu hao xe' },
  { id: 'interest', label: 'Lãi ngân hàng' },
];
const PERIODS = [
  { id: 'month', label: 'Tháng' },
  { id: 'quarter', label: 'Quý' },
  { id: 'year', label: 'Năm' },
];

// anchor = { y, m }: tháng đầu của kỳ
function rangeOf(period, { y, m }) {
  if (period === 'month') return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${lastDay(y, m)}`, label: `Tháng ${pad(m)}/${y}` };
  if (period === 'quarter') {
    const q = Math.floor((m - 1) / 3);
    const e = q * 3 + 3;
    return { from: `${y}-${pad(q * 3 + 1)}-01`, to: `${y}-${pad(e)}-${lastDay(y, e)}`, label: `Quý ${q + 1}/${y}` };
  }
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: `Năm ${y}` };
}
function shift(period, { y, m }, dir) {
  const step = period === 'month' ? 1 : period === 'quarter' ? 3 : 12;
  const i = y * 12 + (m - 1) + dir * step;
  return { y: Math.floor(i / 12), m: (i % 12) + 1 };
}

const FIELDS = ['order_count', 'revenue', 'fuel_cost', 'toll_cost', 'maintenance_cost', 'depreciation', 'interest'];
function sum(rows) {
  const t = Object.fromEntries(FIELDS.map((k) => [k, 0]));
  rows.forEach((r) => FIELDS.forEach((k) => (t[k] += Number(r[k] || 0))));
  t.cost = t.fuel_cost + t.toll_cost + t.maintenance_cost + t.depreciation + t.interest;
  t.profit = t.revenue - t.cost;
  return t;
}
const pct = (t) => (t.revenue > 0 ? `${((t.profit / t.revenue) * 100).toFixed(1).replace('.', ',').replace('-', '−')}%` : '—');
const signed = (n) => (n < 0 ? `−${vnd(-n)}` : vnd(n));

export default function Page() {
  const [tab, setTab] = useState('profit');
  const [vehicles, setVehicles] = useState([]);

  useEffect(() => {
    supabase.from('vehicles').select('id, plate').order('plate').then(({ data }) => setVehicles(data || []));
  }, []);

  return (
    <>
      <div className="staff-head">
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Lãi lỗ theo xe</h1>
      </div>
      <div className="seg" role="tablist" aria-label="Lãi lỗ theo xe" style={{ marginBottom: 14 }}>
        {TABS.map((t) => (
          <button type="button" key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {tab === 'profit' ? <ProfitTab vehicles={vehicles} openDep={() => setTab('dep')} /> : <MonthlyGrid key={tab} kind={tab} vehicles={vehicles} />}
    </>
  );
}

// ---------- Lãi lỗ ----------
function ProfitTab({ vehicles, openDep }) {
  const now = nowVN();
  const [period, setPeriod] = useState('month');
  const [anchor, setAnchor] = useState(now);
  const [car, setCar] = useState('');
  const [pending, setPending] = useState(false);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const range = useMemo(() => rangeOf(period, anchor), [period, anchor]);

  useEffect(() => {
    let dead = false;
    setRows(null);
    supabase.rpc('vehicle_profit', { p_from: range.from, p_to: range.to, p_include_pending: pending }).then(({ data, error }) => {
      if (dead) return;
      if (error) {
        setErr('Chưa tính được lãi lỗ. Hãy chạy supabase/lai-lo.sql trên Supabase.');
        setRows([]);
      } else {
        setErr('');
        setRows(data || []);
      }
    });
    return () => {
      dead = true;
    };
  }, [range.from, range.to, pending]);

  const thisMonth = `${now.y}-${pad(now.m)}-01`;
  const lines = useMemo(() => {
    if (!rows) return [];
    if (car) {
      // Một xe: từng tháng trong kỳ (bỏ các tháng chưa tới)
      return rows
        .filter((r) => r.vehicle_id === car && r.month <= thisMonth)
        .map((r) => ({ key: r.month, name: `Tháng ${r.month.slice(5, 7)}/${r.month.slice(0, 4)}`, ...sum([r]) }));
    }
    const by = new Map();
    rows.forEach((r) => {
      if (!by.has(r.vehicle_id)) by.set(r.vehicle_id, { plate: r.plate, list: [] });
      by.get(r.vehicle_id).list.push(r);
    });
    return [...by].map(([id, v]) => ({ key: id, name: v.plate, ...sum(v.list) }));
  }, [rows, car, thisMonth]);
  const total = useMemo(() => sum(lines), [lines]);

  // Các tháng đã qua (hoặc đang chạy) mà xe chưa được nhập khấu hao
  const missing = useMemo(
    () => (rows || []).filter((r) => r.month <= thisMonth && !Number(r.depreciation) && (!car || r.vehicle_id === car)),
    [rows, car, thisMonth]
  );

  const plate = vehicles.find((v) => v.id === car)?.plate;

  return (
    <>
      <div className="period-bar">
        <div className="seg" role="radiogroup" aria-label="Kỳ báo cáo">
          {PERIODS.map((p) => (
            <button type="button" key={p.id} role="radio" aria-checked={period === p.id} className={period === p.id ? 'on' : ''} onClick={() => setPeriod(p.id)}>{p.label}</button>
          ))}
        </div>
        <div className="period-nav">
          <button type="button" className="btn btn-outline sm" onClick={() => setAnchor((a) => shift(period, a, -1))} aria-label="Kỳ trước">‹</button>
          <button type="button" className="btn btn-outline sm" onClick={() => setAnchor((a) => shift(period, a, 1))} aria-label="Kỳ sau">›</button>
          <button type="button" className="btn btn-outline sm" onClick={() => setAnchor(nowVN())}>Kỳ này</button>
        </div>
        <strong className="period-label">{range.label}</strong>
        <select aria-label="Chọn xe" value={car} onChange={(e) => setCar(e.target.value)}>
          <option value="">Tất cả xe</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}
        </select>
        <label className="check-inline" style={{ marginLeft: 'auto' }}>
          <input type="checkbox" checked={pending} onChange={(e) => setPending(e.target.checked)} /> Tính cả phiếu chi chờ duyệt
        </label>
      </div>

      <div className="kpis" style={{ marginBottom: 14, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <div className="kpi"><span className="kpi-icon tone-ok"><span aria-hidden="true">₫</span></span><span className="kpi-text"><span className="kpi-label">Doanh thu</span><span className="kpi-value">{vnd(total.revenue)}</span><span className="kpi-sub">{total.order_count} đơn hàng</span></span></div>
        <div className="kpi"><span className="kpi-icon tone-warn"><span aria-hidden="true">−</span></span><span className="kpi-text"><span className="kpi-label">Tổng chi phí</span><span className="kpi-value">{vnd(total.cost)}</span><span className="kpi-sub">nhiên liệu, BOT, bảo dưỡng, khấu hao, lãi vay</span></span></div>
        <div className="kpi"><span className={`kpi-icon ${total.profit < 0 ? 'tone-err' : 'tone-ok'}`}><span aria-hidden="true">=</span></span><span className="kpi-text"><span className="kpi-label">{total.profit < 0 ? 'Lỗ' : 'Lãi'}</span><span className={`kpi-value ${total.profit < 0 ? 'amt-out' : 'amt-in'}`}>{signed(total.profit)}</span><span className="kpi-sub">{plate ? `xe ${plate}` : `${lines.length} xe`} · {range.label}</span></span></div>
        <div className="kpi"><span className="kpi-icon tone-navy"><span aria-hidden="true">%</span></span><span className="kpi-text"><span className="kpi-label">Tỷ suất lợi nhuận</span><span className="kpi-value">{pct(total)}</span><span className="kpi-sub">lãi ÷ doanh thu</span></span></div>
      </div>

      {err && <p className="err" role="alert">{err}</p>}
      {!err && missing.length > 0 && (
        <p className="muted small" style={{ marginTop: 0 }}>
          Còn {missing.length} tháng chưa nhập khấu hao trong kỳ này, nên lãi đang cao hơn thực tế.{' '}
          <button type="button" className="link-btn" onClick={openDep}>Nhập khấu hao</button>
        </p>
      )}

      <div className="table-wrap">
        <table className="staff-table pl-table">
          <thead>
            <tr>
              <th>{car ? 'Tháng' : 'Biển số xe'}</th>
              <th className="num">Số đơn</th>
              <th className="num">Doanh thu</th>
              <th className="num">Nhiên liệu</th>
              <th className="num">Cầu đường BOT</th>
              <th className="num">Bảo dưỡng</th>
              <th className="num">Khấu hao</th>
              <th className="num">Lãi ngân hàng</th>
              <th className="num">Tổng chi phí</th>
              <th className="num">Lãi / lỗ</th>
              <th className="num">Tỷ suất</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((r) => (
              <tr key={r.key}>
                <td><strong>{r.name}</strong></td>
                <td className="num">{r.order_count}</td>
                <td className="num"><strong className={r.revenue ? 'amt-in' : 'debt-zero'}>{vnd(r.revenue)}</strong></td>
                <td className="num">{vnd(r.fuel_cost)}</td>
                <td className="num">{vnd(r.toll_cost)}</td>
                <td className="num">{vnd(r.maintenance_cost)}</td>
                <td className="num">{r.depreciation ? vnd(r.depreciation) : <span className="muted">Chưa nhập</span>}</td>
                <td className="num">{vnd(r.interest)}</td>
                <td className="num">{vnd(r.cost)}</td>
                <td className="num"><strong className={r.profit < 0 ? 'amt-out' : r.profit > 0 ? 'amt-in' : 'debt-zero'}>{signed(r.profit)}</strong></td>
                <td className="num">{pct(r)}</td>
              </tr>
            ))}
            {rows && !lines.length && !err && <tr><td colSpan={11} className="muted">Không có số liệu trong kỳ này.</td></tr>}
            {!rows && <tr><td colSpan={11} className="muted">Đang tải...</td></tr>}
          </tbody>
          {lines.length > 1 && (
            <tfoot>
              <tr>
                <td><strong>Tổng</strong></td>
                <td className="num"><strong>{total.order_count}</strong></td>
                <td className="num"><strong>{vnd(total.revenue)}</strong></td>
                <td className="num"><strong>{vnd(total.fuel_cost)}</strong></td>
                <td className="num"><strong>{vnd(total.toll_cost)}</strong></td>
                <td className="num"><strong>{vnd(total.maintenance_cost)}</strong></td>
                <td className="num"><strong>{vnd(total.depreciation)}</strong></td>
                <td className="num"><strong>{vnd(total.interest)}</strong></td>
                <td className="num"><strong>{vnd(total.cost)}</strong></td>
                <td className="num"><strong className={total.profit < 0 ? 'amt-out' : 'amt-in'}>{signed(total.profit)}</strong></td>
                <td className="num"><strong>{pct(total)}</strong></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="muted small">
        Doanh thu và cầu đường BOT lấy từ các đơn hàng của xe theo ngày vận chuyển. Nhiên liệu và bảo dưỡng lấy từ phiếu chi gắn với xe theo ngày chi
        {pending ? ', gồm cả phiếu chờ duyệt' : ', chỉ phiếu đã duyệt hoặc đã thanh toán'}. Khấu hao và lãi ngân hàng lấy từ hai tab Khấu hao xe và Lãi ngân hàng.
      </p>
    </>
  );
}

// ---------- Bảng nhập theo năm × 12 tháng: khấu hao, lãi ngân hàng ----------
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const KINDS = {
  dep: { table: 'vehicle_depreciation', noun: 'khấu hao' },
  interest: { table: 'vehicle_loan_interest', noun: 'lãi ngân hàng', importable: true },
};

function MonthlyGrid({ vehicles, kind }) {
  const { table, noun, importable } = KINDS[kind];
  const [importing, setImporting] = useState(false);
  const [year, setYear] = useState(nowVN().y);
  const [saved, setSaved] = useState({}); // { vid: { m: 'digits' } } như trong database
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from(table).select('vehicle_id, month, amount').eq('year', year);
    const g = {};
    (data || []).forEach((r) => ((g[r.vehicle_id] ||= {})[r.month] = String(r.amount)));
    setSaved(g);
    setDraft(JSON.parse(JSON.stringify(g)));
    setMsg(error ? { ok: false, text: `Không tải được bảng ${noun}. Hãy chạy supabase/lai-lo.sql trên Supabase.` } : null);
    setLoading(false);
  }, [year, table, noun]);

  useEffect(() => {
    load();
  }, [load]);

  const cell = (vid, m) => draft[vid]?.[m] ?? '';
  const setCell = (vid, m, v) => setDraft((d) => ({ ...d, [vid]: { ...d[vid], [m]: v } }));
  const rowSum = (vid) => MONTHS.reduce((a, m) => a + Number(cell(vid, m) || 0), 0);

  // Nhập tổng cả năm rồi chia đều 12 tháng (phần lẻ dồn vào tháng 12)
  const [yearly, setYearly] = useState({}); // ô "Tổng cả năm" của từng xe
  function spread(vid) {
    const total = Number(yearly[vid] || 0);
    if (!total) return;
    const each = Math.floor(total / 12);
    setDraft((d) => ({ ...d, [vid]: Object.fromEntries(MONTHS.map((m) => [m, String(m === 12 ? total - each * 11 : each)])) }));
    setYearly((y) => ({ ...y, [vid]: '' }));
  }
  // Chép số của tháng 1 cho cả 12 tháng
  function copyFirst(vid) {
    const v = cell(vid, 1);
    if (v) setDraft((d) => ({ ...d, [vid]: Object.fromEntries(MONTHS.map((m) => [m, v])) }));
  }

  const changes = useMemo(() => {
    const up = [];
    const del = [];
    vehicles.forEach((v) =>
      MONTHS.forEach((m) => {
        const a = saved[v.id]?.[m] ?? '';
        const b = draft[v.id]?.[m] ?? '';
        if (a === b) return;
        if (b === '') del.push({ vehicle_id: v.id, month: m });
        else up.push({ vehicle_id: v.id, year, month: m, amount: Number(b) });
      })
    );
    return { up, del, n: up.length + del.length };
  }, [vehicles, saved, draft, year]);

  async function save() {
    setBusy(true);
    setMsg(null);
    const { data: u } = await supabase.auth.getUser();
    const by = displayLogin(u?.user?.email);
    const stamp = new Date().toISOString();
    let error = null;
    if (changes.up.length) {
      ({ error } = await supabase
        .from(table)
        .upsert(changes.up.map((r) => ({ ...r, updated_at: stamp, updated_by_name: by })), { onConflict: 'vehicle_id,year,month' }));
    }
    for (const r of changes.del) {
      if (error) break;
      ({ error } = await supabase.from(table).delete().eq('vehicle_id', r.vehicle_id).eq('year', year).eq('month', r.month));
    }
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.code === '42501' ? `Chỉ Admin và Kế toán được nhập ${noun}.` : 'Không lưu được. Vui lòng thử lại.' });
    await load();
    setMsg({ ok: true, text: `Đã lưu ${noun} năm ${year}.` });
  }

  function changeYear(dir) {
    if (changes.n && !window.confirm('Có thay đổi chưa lưu. Bỏ các thay đổi này?')) return;
    setYear((y) => y + dir);
  }

  const colTotal = (m) => vehicles.reduce((a, v) => a + Number(cell(v.id, m) || 0), 0);

  return (
    <>
      <div className="period-bar">
        <div className="period-nav">
          <button type="button" className="btn btn-outline sm" onClick={() => changeYear(-1)} aria-label="Năm trước">‹</button>
          <strong className="period-label">Năm {year}</strong>
          <button type="button" className="btn btn-outline sm" onClick={() => changeYear(1)} aria-label="Năm sau">›</button>
        </div>
        <span className="muted small">Nhập số {noun} (đồng) của từng xe cho từng tháng. Để trống = chưa nhập.</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {importable && (
            <button
              type="button"
              className="btn btn-outline"
              disabled={busy || loading}
              onClick={() => (changes.n ? window.alert('Hãy Lưu hoặc Huỷ các thay đổi đang nhập trước khi import.') : setImporting(true))}
            >
              Import lịch trả nợ (Excel)
            </button>
          )}
          <button type="button" className="btn btn-outline" disabled={!changes.n || busy} onClick={() => setDraft(JSON.parse(JSON.stringify(saved)))}>Huỷ thay đổi</button>
          <button type="button" className="btn btn-primary" disabled={!changes.n || busy} onClick={save}>
            {busy ? 'Đang lưu...' : changes.n ? `Lưu (${changes.n} ô)` : 'Lưu'}
          </button>
        </div>
      </div>
      {msg && <p className={msg.ok ? 'lp-ok' : 'err'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}

      <div className="table-wrap">
        <table className="staff-table dep-table">
          <thead>
            <tr>
              <th>Tháng</th>
              {vehicles.map((v) => <th key={v.id} className="num">{v.plate}</th>)}
              {vehicles.length > 1 && <th className="num">Tổng tháng</th>}
            </tr>
          </thead>
          <tbody>
            {MONTHS.map((m) => (
              <tr key={m}>
                <td><strong>Tháng {m}</strong></td>
                {vehicles.map((v) => {
                  const dirty = (saved[v.id]?.[m] ?? '') !== cell(v.id, m);
                  return (
                    <td key={v.id}>
                      <MoneyInput
                        aria-label={`${noun} xe ${v.plate} tháng ${m}/${year}`}
                        className={dirty ? 'dirty' : ''}
                        value={cell(v.id, m)}
                        onChange={(x) => setCell(v.id, m, x)}
                        disabled={loading}
                      />
                    </td>
                  );
                })}
                {vehicles.length > 1 && <td className="num">{colTotal(m) ? vnd(colTotal(m)) : ''}</td>}
              </tr>
            ))}
            {!vehicles.length && <tr><td className="muted">Chưa có xe nào.</td></tr>}
          </tbody>
          {vehicles.length > 0 && (
            <tfoot>
              <tr>
                <td><strong>Cả năm {year}</strong></td>
                {vehicles.map((v) => <td key={v.id} className="num"><strong>{vnd(rowSum(v.id))}</strong></td>)}
                {vehicles.length > 1 && <td className="num"><strong>{vnd(MONTHS.reduce((a, m) => a + colTotal(m), 0))}</strong></td>}
              </tr>
              <tr className="dep-tools">
                <td>Điền nhanh</td>
                {vehicles.map((v) => (
                  <td key={v.id}>
                    <div className="dep-actions">
                      <MoneyInput
                        aria-label={`Tổng ${noun} cả năm ${year} của xe ${v.plate}`}
                        placeholder="Tổng cả năm"
                        value={yearly[v.id] ?? ''}
                        onChange={(x) => setYearly((y) => ({ ...y, [v.id]: x }))}
                        onKeyDown={(e) => e.key === 'Enter' && spread(v.id)}
                        disabled={loading}
                      />
                      <button type="button" className="btn btn-outline sm" onClick={() => spread(v.id)} disabled={loading || !Number(yearly[v.id])}>Chia 12</button>
                      <button type="button" className="btn btn-outline sm" onClick={() => copyFirst(v.id)} disabled={loading || !cell(v.id, 1)} title="Chép số tháng 1 cho cả 12 tháng">Chép T1</button>
                    </div>
                  </td>
                ))}
                {vehicles.length > 1 && <td></td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="muted small">
        "Chia 12": nhập tổng {noun} của cả năm vào ô ở dòng Điền nhanh, hệ thống chia đều cho 12 tháng (phần lẻ dồn vào tháng 12). "Chép T1": dùng số của tháng 1 cho mọi tháng. Nhớ bấm Lưu sau khi nhập.
        {importable && ' "Import lịch trả nợ": chọn file Excel bảng trả nợ của ngân hàng, hệ thống lấy cột tiền lãi theo từng tháng (mọi năm trong file) và ghi thẳng vào bảng.'}
      </p>
      {importing && (
        <LoanImport
          vehicles={vehicles}
          onClose={() => setImporting(false)}
          onDone={async (text) => {
            setImporting(false);
            await load();
            setMsg({ ok: true, text });
          }}
        />
      )}
    </>
  );
}
