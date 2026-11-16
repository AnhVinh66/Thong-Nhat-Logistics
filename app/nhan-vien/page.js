'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, vnd, orderCode, stopCode } from '../../lib/supabase';
import Icon from '../../components/Icon';

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return isoOf(new Date(y, m - 1, d + n));
};
const weekday = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(y, m - 1, d).getDay()];
};
const dm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const orderLink = (o) => `/nhan-vien/don-hang/?q=${orderCode(o.order_no)}`;

// Các điểm giao của một đơn (đơn 1 điểm cũng là 1 điểm)
function pointsOf(o) {
  if (o.order_type === 'multi') {
    return [...(o.order_stops || [])]
      .sort((a, b) => a.position - b.position)
      .map((s, i) => ({ key: `${o.id}|${s.id}`, name: s.customers?.name, address: s.address, no: i + 1, code: stopCode(o.order_no, s.stop_no) }));
  }
  return [{ key: `${o.id}|`, name: o.customers?.name, address: o.delivery, no: 1, code: orderCode(o.order_no) }];
}

function Kpi({ icon, label, value, sub, tone = 'navy', href }) {
  const body = (
    <>
      <span className={`kpi-icon tone-${tone}`}><Icon name={icon} size={22} /></span>
      <span className="kpi-text">
        <span className="kpi-label">{label}</span>
        <span className="kpi-value">{value ?? '—'}</span>
        {sub && <span className="kpi-sub">{sub}</span>}
      </span>
    </>
  );
  return href ? <Link href={href} className="kpi">{body}</Link> : <div className="kpi">{body}</div>;
}

function DocsPill({ ok, total }) {
  if (!total) return null;
  const tone = ok === total ? 'ok' : ok ? 'warn' : 'muted';
  return <span className={`pill pill-${tone}`}>{ok}/{total} điểm đủ chứng từ</span>;
}

export default function Page() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [today, setToday] = useState(() => isoOf(new Date()));

  const load = useCallback(async () => {
    setToday(isoOf(new Date()));
    const [o, v, p, c] = await Promise.all([
      supabase
        .from('orders')
        .select('id, order_no, order_type, pickup, delivery, plate, truck, driver, ship_date, fee, created_at, customers(name), order_stops(id, position, stop_no, address, customers(name))')
        .order('ship_date', { ascending: true }),
      supabase.from('vehicles').select('plate, payload_tons, volume_cbm').order('plate'),
      supabase.from('delivery_photos').select('order_id, stop_id, kind'),
      supabase.from('customers').select('id', { count: 'exact', head: true }),
    ]);
    if (o.error) {
      setErr('Không tải được dữ liệu. Kiểm tra kết nối hoặc các file SQL đã chạy trên Supabase.');
      return;
    }
    setErr('');
    setData({ orders: o.data || [], vehicles: v.data || [], photos: p.data || [], customers: c.count || 0 });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const s = useMemo(() => {
    if (!data) return null;
    const { orders, vehicles, photos } = data;

    // Ảnh chứng từ theo điểm giao
    const docs = {};
    photos.forEach((p) => {
      const k = `${p.order_id}|${p.stop_id || ''}`;
      docs[k] = docs[k] || { bien_ban: 0, bill: 0 };
      docs[k][p.kind] = (docs[k][p.kind] || 0) + 1;
    });
    const pointDone = (k) => (docs[k]?.bien_ban || 0) > 0 && (docs[k]?.bill || 0) > 0;
    const docsOf = (o) => {
      const pts = pointsOf(o);
      return { ok: pts.filter((p) => pointDone(p.key)).length, total: pts.length };
    };

    const todayOrders = orders.filter((o) => o.ship_date === today);
    const todayPoints = todayOrders.reduce((a, o) => a + pointsOf(o).length, 0);

    // Đội xe hôm nay
    const busy = {};
    todayOrders.forEach((o) => {
      if (o.plate) (busy[o.plate] = busy[o.plate] || []).push(o);
    });
    const fleet = vehicles.map((v) => ({ ...v, trips: busy[v.plate] || [] }));
    const busyCount = fleet.filter((v) => v.trips.length).length;

    // Cần xử lý
    const unassigned = orders.filter((o) => (!o.ship_date || o.ship_date >= today) && (!o.plate || !o.driver));
    const missingDocs = [];
    orders
      .filter((o) => o.ship_date && o.ship_date <= today)
      .forEach((o) => pointsOf(o).forEach((p) => !pointDone(p.key) && missingDocs.push({ o, p })));
    missingDocs.sort((a, b) => b.o.ship_date.localeCompare(a.o.ship_date) || a.o.order_no - b.o.order_no || a.p.no - b.p.no);

    // Lịch 7 ngày tới
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(today, i);
      const list = orders.filter((o) => o.ship_date === d);
      return { d, trips: list.length, points: list.reduce((a, o) => a + pointsOf(o).length, 0) };
    });
    const weekMax = Math.max(1, ...week.map((w) => w.trips));

    // Cước tháng này (theo ngày vận chuyển, đơn chưa có ngày tính theo ngày tạo)
    const month = today.slice(0, 7);
    const monthOrders = orders.filter((o) => (o.ship_date || o.created_at?.slice(0, 10) || '').startsWith(month));
    const monthFee = monthOrders.reduce((a, o) => a + Number(o.fee || 0), 0);

    return { todayOrders, todayPoints, fleet, busyCount, unassigned, missingDocs, week, weekMax, monthFee, monthOrders, docsOf };
  }, [data, today]);

  const [y, m, d] = today.split('-');

  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>Bảng điều phối</p>
          <h1 className="dash-title">Tổng quan vận tải</h1>
          <p className="muted" style={{ margin: 0 }}>{weekday(today)}, ngày {d}/{m}/{y}</p>
        </div>
        <div className="dash-actions">
          <button className="btn btn-outline" onClick={load}>Làm mới</button>
          <Link href="/nhan-vien/don-hang/?new=1" className="btn btn-primary">+ Tạo đơn hàng</Link>
        </div>
      </div>

      {err && <p className="err" role="alert">{err}</p>}

      <div className="kpis kpis-dash">
        <Kpi icon="route" label="Chuyến hôm nay" value={s?.todayOrders.length} sub={s && `${s.todayPoints} điểm giao`} />
        <Kpi icon="truck" label="Xe đang chạy" value={s && `${s.busyCount}/${s.fleet.length}`} sub={s && `${s.fleet.length - s.busyCount} xe rảnh`} tone="blue" href="/nhan-vien/xe/" />
        <Kpi icon="alert" label="Chưa gán xe / tài xế" value={s?.unassigned.length} sub="Chuyến từ hôm nay trở đi" tone={s?.unassigned.length ? 'warn' : 'ok'} />
        <Kpi icon="doc" label="Điểm thiếu chứng từ" value={s?.missingDocs.length} sub="Biên bản hoặc bill" tone={s?.missingDocs.length ? 'err' : 'ok'} />
        <Kpi icon="money" label={`Cước tháng ${m}/${y}`} value={s && vnd(s.monthFee)} sub={s && `${s.monthOrders.length} đơn`} tone="ok" />
        <Kpi icon="users" label="Khách hàng" value={data?.customers} tone="blue" href="/nhan-vien/khach-hang/" />
      </div>

      <div className="dash-grid">
        <section className="panel panel-wide">
          <div className="panel-head">
            <h2>Lịch chạy hôm nay</h2>
            <Link href="/nhan-vien/don-hang/" className="panel-link">Tất cả đơn hàng <Icon name="arrow" size={16} /></Link>
          </div>
          {s && !s.todayOrders.length && <p className="panel-empty">Hôm nay chưa có chuyến nào.</p>}
          {s && s.todayOrders.length > 0 && (
            <div className="table-wrap">
              <table className="dash-table">
                <thead>
                  <tr><th>Mã</th><th>Khách hàng / điểm giao</th><th>Lấy hàng</th><th>Xe · Tài xế</th><th>Chứng từ</th></tr>
                </thead>
                <tbody>
                  {s.todayOrders.map((o) => {
                    const pts = pointsOf(o);
                    const dc = s.docsOf(o);
                    return (
                      <tr key={o.id}>
                        <td><Link href={orderLink(o)} className="code">{orderCode(o.order_no)}</Link></td>
                        <td>
                          {pts.length > 1 ? <strong>{pts.length} điểm giao</strong> : <strong>{pts[0].name}</strong>}
                          <div className="muted small">{pts.length > 1 ? pts.map((p) => p.name).join(', ') : pts[0].address}</div>
                        </td>
                        <td className="small">{o.pickup}</td>
                        <td>
                          {o.plate || <span className="pill pill-warn">Chưa gán xe</span>}
                          <div className="muted small">{o.driver || 'Chưa gán tài xế'}</div>
                        </td>
                        <td><DocsPill {...dc} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!s && !err && <p className="panel-empty">Đang tải...</p>}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Đội xe hôm nay</h2>
            <Link href="/nhan-vien/xe/" className="panel-link">Quản lý xe <Icon name="arrow" size={16} /></Link>
          </div>
          {s && !s.fleet.length && <p className="panel-empty">Chưa có xe trong danh sách.</p>}
          <ul className="fleet-list">
            {s?.fleet.map((v) => (
              <li key={v.plate}>
                <span className={`fleet-dot ${v.trips.length ? 'busy' : ''}`} aria-hidden="true" />
                <span className="fleet-info">
                  <strong>{v.plate}</strong>
                  <span className="muted small">
                    {v.payload_tons != null ? `${Number(v.payload_tons)} tấn` : ''}
                    {v.volume_cbm != null ? ` · ${Number(v.volume_cbm)} CBM` : ''}
                  </span>
                </span>
                {v.trips.length ? (
                  <span className="pill pill-blue">Đang chạy · {v.trips.map((t) => orderCode(t.order_no)).join(', ')}</span>
                ) : (
                  <span className="pill pill-ok">Rảnh</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Cần xử lý</h2></div>
          <h3 className="panel-sub"><Icon name="alert" size={18} /> Chưa gán xe / tài xế ({s?.unassigned.length ?? 0})</h3>
          {s && !s.unassigned.length && <p className="panel-ok"><Icon name="check" size={18} /> Tất cả chuyến đã được gán xe và tài xế.</p>}
          <ul className="todo-list">
            {s?.unassigned.slice(0, 6).map((o) => (
              <li key={o.id}>
                <Link href={orderLink(o)}>
                  <strong>{orderCode(o.order_no)}</strong>
                  <span className="muted small">{o.ship_date ? dm(o.ship_date) : 'Chưa có ngày'} · {!o.plate && !o.driver ? 'thiếu xe và tài xế' : !o.plate ? 'thiếu xe' : 'thiếu tài xế'}</span>
                </Link>
              </li>
            ))}
          </ul>

          <h3 className="panel-sub"><Icon name="doc" size={18} /> Thiếu chứng từ ({s?.missingDocs.length ?? 0})</h3>
          {s && !s.missingDocs.length && <p className="panel-ok"><Icon name="check" size={18} /> Các điểm đã giao đều đủ biên bản và bill.</p>}
          <ul className="todo-list">
            {s?.missingDocs.slice(0, 6).map(({ o, p }) => (
              <li key={p.key}>
                <Link href={orderLink(o)}>
                  <strong>{p.code}</strong>
                  <span className="muted small">{dm(o.ship_date)} · {p.name || 'Điểm giao'} · {o.driver || 'chưa có tài xế'}</span>
                </Link>
              </li>
            ))}
          </ul>
          {s && s.missingDocs.length > 6 && <p className="muted small">và {s.missingDocs.length - 6} điểm khác...</p>}
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Lịch 7 ngày tới</h2></div>
          <ul className="week">
            {s?.week.map((w, i) => (
              <li key={w.d} className={i === 0 ? 'is-today' : ''}>
                <span className="week-day"><strong>{i === 0 ? 'Hôm nay' : weekday(w.d)}</strong><span className="muted small">{dm(w.d)}</span></span>
                <span className="week-bar" aria-hidden="true"><span style={{ width: `${(w.trips / s.weekMax) * 100}%` }} /></span>
                <span className="week-num">{w.trips} chuyến{w.points > w.trips ? ` · ${w.points} điểm` : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
