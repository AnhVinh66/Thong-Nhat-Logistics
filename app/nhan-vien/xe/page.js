'use client';

import { useRole } from '../../../components/staff/Role';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, vnd } from '../../../lib/supabase';
import Modal from '../../../components/staff/Modal';
import DateInput from '../../../components/DateInput';

// ---------- Kỳ thống kê (ngày / tuần / tháng / năm) ----------
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const dmy = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const PERIODS = [
  { id: 'day', label: 'Ngày' },
  { id: 'week', label: 'Tuần' },
  { id: 'month', label: 'Tháng' },
  { id: 'year', label: 'Năm' },
  { id: 'all', label: 'Tất cả' },
];

// Khoảng ngày [from, to] của kỳ chứa ngày "anchor". Tuần tính từ thứ Hai đến Chủ nhật.
function rangeOf(period, anchor) {
  if (period === 'all') return { from: null, to: null, label: 'Tất cả thời gian' };
  const a = parse(anchor);
  if (period === 'day') return { from: anchor, to: anchor, label: `Ngày ${dmy(anchor)}` };
  if (period === 'week') {
    const dow = (a.getUTCDay() + 6) % 7; // 0 = thứ Hai
    const mon = new Date(a.getTime() - dow * 86400000);
    const sun = new Date(mon.getTime() + 6 * 86400000);
    return { from: iso(mon), to: iso(sun), label: `Tuần từ ${dmy(iso(mon))} đến ${dmy(iso(sun))}` };
  }
  if (period === 'month') {
    const first = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1));
    const last = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 0));
    return { from: iso(first), to: iso(last), label: `Tháng ${pad(a.getUTCMonth() + 1)}/${a.getUTCFullYear()}` };
  }
  const y = a.getUTCFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: `Năm ${y}` };
}

function shiftAnchor(period, anchor, dir) {
  const a = parse(anchor);
  if (period === 'day') return iso(new Date(a.getTime() + dir * 86400000));
  if (period === 'week') return iso(new Date(a.getTime() + dir * 7 * 86400000));
  if (period === 'month') return iso(new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + dir, 1)));
  return iso(new Date(Date.UTC(a.getUTCFullYear() + dir, 0, 1)));
}

const blank = { plate: '', volume_cbm: '', payload_tons: '', length_m: '', width_m: '', height_m: '' };
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const fmt = (v) => (v === null || v === undefined ? '' : String(Number(v)));
const size = (r) =>
  r.length_m != null && r.width_m != null && r.height_m != null
    ? `${Number(r.length_m).toFixed(2)} x ${Number(r.width_m).toFixed(2)} x ${Number(r.height_m).toFixed(2)} (m)`
    : '';

export default function Page() {
  const { canEditOps } = useRole();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState('month');
  const [anchor, setAnchor] = useState(todayIso());
  const [includePending, setIncludePending] = useState(false);
  const [stats, setStats] = useState({});
  const [statsErr, setStatsErr] = useState('');
  const [undated, setUndated] = useState(0);
  const range = useMemo(() => rangeOf(period, anchor), [period, anchor]);

  // Số liệu theo xe trong kỳ đã chọn (database tự cộng từ Đơn hàng và Chi tiền)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [r, u] = await Promise.all([
        supabase.rpc('vehicle_stats', { p_from: range.from, p_to: range.to, p_include_pending: includePending }),
        supabase.from('orders').select('id', { count: 'exact', head: true }).is('ship_date', null).not('plate', 'is', null),
      ]);
      if (cancelled) return;
      if (r.error) {
        setStatsErr('Chưa có số liệu thống kê. Hãy chạy supabase/vehicle-stats.sql trên Supabase.');
        setStats({});
      } else {
        setStatsErr('');
        setStats(Object.fromEntries((r.data || []).map((x) => [x.vehicle_id, x])));
      }
      setUndated(u.count || 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, includePending]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('vehicles').select('*').order('plate');
    if (error) setErr('Không tải được danh sách xe. Kiểm tra đã chạy supabase/vehicles.sql chưa.');
    else {
      setErr('');
      setRows(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => !s || r.plate.toLowerCase().includes(s));
  }, [rows, q]);

  const totals = useMemo(() => {
    const t = { n: 0, rev: 0, fuel: 0, maint: 0 };
    shown.forEach((r) => {
      const s = stats[r.id];
      if (!s) return;
      t.n += Number(s.order_count);
      t.rev += Number(s.revenue);
      t.fuel += Number(s.fuel_cost);
      t.maint += Number(s.maintenance_cost);
    });
    return t;
  }, [shown, stats]);

  function openEdit(r) {
    setFormErr('');
    setEditing(
      r
        ? {
            id: r.id,
            plate: r.plate,
            volume_cbm: fmt(r.volume_cbm),
            payload_tons: fmt(r.payload_tons),
            length_m: fmt(r.length_m),
            width_m: fmt(r.width_m),
            height_m: fmt(r.height_m),
          }
        : { ...blank }
    );
  }

  async function save(e) {
    e.preventDefault();
    setFormErr('');
    if (!editing.plate.trim()) return setFormErr('Vui lòng nhập biển số xe.');
    const vals = ['volume_cbm', 'payload_tons', 'length_m', 'width_m', 'height_m'].map((k) => num(editing[k]));
    if (vals.some((v) => v !== null && (Number.isNaN(v) || v < 0))) return setFormErr('Các giá trị số phải là số không âm.');
    setBusy(true);
    const payload = {
      plate: editing.plate.trim().toUpperCase(),
      volume_cbm: vals[0],
      payload_tons: vals[1],
      length_m: vals[2],
      width_m: vals[3],
      height_m: vals[4],
    };
    const { error } = editing.id
      ? await supabase.from('vehicles').update(payload).eq('id', editing.id)
      : await supabase.from('vehicles').insert(payload);
    setBusy(false);
    if (error) return setFormErr(error.code === '23505' ? 'Biển số này đã có trong danh sách.' : 'Không lưu được. Vui lòng thử lại.');
    setEditing(null);
    load();
  }

  async function remove(r) {
    if (!window.confirm(`Xoá xe ${r.plate}? Thao tác này không thể hoàn tác.`)) return;
    const { error } = await supabase.from('vehicles').delete().eq('id', r.id);
    if (error) return window.alert(error.code === '23503' ? 'Không xoá được: xe này đã có phiếu chi (bảo dưỡng / nhiên liệu). Hãy xoá các phiếu chi liên quan trước.' : 'Không xoá được. Vui lòng thử lại.');
    load();
  }

  const set = (k) => (e) => setEditing((s) => ({ ...s, [k]: e.target.value }));
  const numInput = (id, label, k, step = '0.01') => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" min="0" step={step} inputMode="decimal" value={editing[k]} onChange={set(k)} />
    </div>
  );

  return (
    <>
      <div className="staff-head">
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Danh sách xe</h1>
        {canEditOps && <button className="btn btn-primary" onClick={() => openEdit(null)}>+ Thêm xe</button>}
      </div>

      <div className="toolbar">
        <input aria-label="Tìm theo biển số" placeholder="Tìm theo biển số xe..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="period-bar">
        <div className="seg" role="radiogroup" aria-label="Kỳ thống kê">
          {PERIODS.map((p) => (
            <button type="button" key={p.id} role="radio" aria-checked={period === p.id} className={period === p.id ? 'on' : ''} onClick={() => setPeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        {period !== 'all' && (
          <div className="period-nav">
            <button type="button" className="btn btn-outline sm" onClick={() => setAnchor((a) => shiftAnchor(period, a, -1))} aria-label="Kỳ trước">‹</button>
            <DateInput aria-label="Chọn một ngày trong kỳ" value={anchor} onChange={(v) => v && setAnchor(v)} />
            <button type="button" className="btn btn-outline sm" onClick={() => setAnchor((a) => shiftAnchor(period, a, 1))} aria-label="Kỳ sau">›</button>
            <button type="button" className="btn btn-outline sm" onClick={() => setAnchor(todayIso())}>Hôm nay</button>
          </div>
        )}
        <strong className="period-label">{range.label}</strong>
        <label className="check-inline" style={{ marginLeft: 'auto' }}>
          <input type="checkbox" checked={includePending} onChange={(e) => setIncludePending(e.target.checked)} /> Tính cả phiếu chi chờ duyệt
        </label>
      </div>

      <div className="kpis" style={{ marginBottom: 14, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div className="kpi"><span className="kpi-icon tone-navy"><span aria-hidden="true">#</span></span><span className="kpi-text"><span className="kpi-label">Tổng số đơn hàng</span><span className="kpi-value">{totals.n}</span><span className="kpi-sub">của {shown.length} xe</span></span></div>
        <div className="kpi"><span className="kpi-icon tone-ok"><span aria-hidden="true">₫</span></span><span className="kpi-text"><span className="kpi-label">Tổng doanh thu</span><span className="kpi-value">{vnd(totals.rev)}</span><span className="kpi-sub">cước các đơn hàng</span></span></div>
        <div className="kpi"><span className="kpi-icon tone-warn"><span aria-hidden="true">⛽</span></span><span className="kpi-text"><span className="kpi-label">Chi phí nhiên liệu / bảo dưỡng</span><span className="kpi-value">{vnd(totals.fuel + totals.maint)}</span><span className="kpi-sub">NL {vnd(totals.fuel)} · BD {vnd(totals.maint)}</span></span></div>
      </div>

      {err && <p className="err" role="alert">{err}</p>}
      {statsErr && <p className="err" role="alert">{statsErr}</p>}
      {period !== 'all' && undated > 0 && (
        <p className="muted small" style={{ marginTop: 0 }}>
          Có {undated} đơn hàng đã gán xe nhưng chưa có ngày vận chuyển, nên chỉ nằm trong mục "Tất cả" (không tính theo ngày, tuần, tháng, năm).
        </p>
      )}
      <div className="table-wrap">
        <table className="fleet-table staff-table">
          <thead>
            <tr>
              <th>Biển số xe</th>
              <th>Khối lượng hàng</th>
              <th>Tải trọng xe</th>
              <th>Kích thước thùng</th>
              <th className="num">Tổng số đơn hàng</th>
              <th className="num">Tổng doanh thu</th>
              <th className="num">Chi phí nhiên liệu / bảo dưỡng</th>
              <th aria-label="Thao tác"></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.plate}</strong></td>
                <td>{r.volume_cbm != null && `${Number(r.volume_cbm)} CBM`}</td>
                <td>{r.payload_tons != null && `${Number(r.payload_tons)} tấn`}</td>
                <td>{size(r)}</td>
                {(() => {
                  const s = stats[r.id];
                  const cost = s ? Number(s.fuel_cost) + Number(s.maintenance_cost) : 0;
                  return (
                    <>
                      <td className="num">{s ? <strong className={Number(s.order_count) ? '' : 'debt-zero'}>{Number(s.order_count)}</strong> : <span className="muted">…</span>}</td>
                      <td className="num">{s ? <strong className={Number(s.revenue) ? 'amt-in' : 'debt-zero'}>{vnd(s.revenue)}</strong> : <span className="muted">…</span>}</td>
                      <td className="num">
                        {s ? (
                          <>
                            <strong className={cost ? 'amt-out' : 'debt-zero'}>{vnd(cost)}</strong>
                            <div className="muted small">Nhiên liệu {vnd(s.fuel_cost)} · Bảo dưỡng {vnd(s.maintenance_cost)}</div>
                          </>
                        ) : <span className="muted">…</span>}
                      </td>
                    </>
                  );
                })()}
                <td className="actions">
                  {canEditOps && <button className="btn btn-outline sm" onClick={() => openEdit(r)}>Sửa</button>}
                  {canEditOps && <button className="btn btn-danger sm" onClick={() => remove(r)}>Xoá</button>}
                </td>
              </tr>
            ))}
            {!loading && !shown.length && <tr><td colSpan={8} className="muted">Chưa có xe nào.</td></tr>}
            {loading && <tr><td colSpan={8} className="muted">Đang tải...</td></tr>}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4}><strong>Tổng ({shown.length} xe) · {range.label}</strong></td>
                <td className="num"><strong>{totals.n}</strong></td>
                <td className="num"><strong>{vnd(totals.rev)}</strong></td>
                <td className="num"><strong>{vnd(totals.fuel + totals.maint)}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="muted small">{shown.length} / {rows.length} xe</p>

      {editing && (
        <Modal title={editing.id ? 'Sửa xe' : 'Thêm xe'} onClose={() => setEditing(null)}>
          <form className="form" onSubmit={save} noValidate>
            <div className="field">
              <label htmlFor="v-plate">Biển số xe *</label>
              <input id="v-plate" value={editing.plate} onChange={set('plate')} placeholder="VD: 29E-373.03" />
            </div>
            <div className="grid-2">
              {numInput('v-cbm', 'Khối lượng hàng (CBM)', 'volume_cbm')}
              {numInput('v-ton', 'Tải trọng xe (tấn)', 'payload_tons')}
            </div>
            <p style={{ margin: 0, fontWeight: 600 }}>Kích thước thùng (m)</p>
            <div className="grid-3" style={{ gap: 12 }}>
              {numInput('v-l', 'Dài', 'length_m')}
              {numInput('v-w', 'Rộng', 'width_m')}
              {numInput('v-h', 'Cao', 'height_m')}
            </div>
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
