'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, orderCode } from '../../lib/supabase';
import Icon from '../Icon';
import DeliveryDocs, { uploadDocs } from './DeliveryDocs';
import InstallApp from './InstallApp';

const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : 'Chưa có ngày');
const mapsUrl = (addr) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr || '')}`;

// Các điểm giao của một đơn (đơn 1 điểm cũng quy về một điểm)
function pointsOf(o) {
  if (o.order_type === 'multi') {
    return [...(o.order_stops || [])]
      .sort((a, b) => a.position - b.position)
      .map((s, i) => ({
        key: `${o.id}|${s.id}`, stopId: s.id, no: i + 1,
        name: s.customers?.name, phone: s.customers?.phone, address: s.address, cargo: s.cargo, weight: s.weight,
      }));
  }
  return [{
    key: `${o.id}|`, stopId: null, no: 1,
    name: o.customers?.name, phone: o.customers?.phone, address: o.delivery, cargo: o.cargo, weight: o.weight,
  }];
}

function ShotButton({ label, count, busy, onFiles }) {
  return (
    <label className={`drv-shot ${count ? 'has' : ''} ${busy ? 'busy' : ''}`}>
      <input type="file" accept="image/*" capture="environment" hidden disabled={busy}
        onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
      <Icon name="camera" size={26} />
      <span className="drv-shot-text">
        <strong>{busy ? 'Đang tải...' : label}</strong>
        <small>{count ? `Đã có ${count} ảnh` : 'Chưa có ảnh'}</small>
      </span>
    </label>
  );
}

export default function DriverApp({ driverName, email, onLogout }) {
  const [orders, setOrders] = useState([]);
  const [counts, setCounts] = useState({}); // "orderId|stopId" -> { bien_ban, bill }
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('now'); // now | old
  const [busyKey, setBusyKey] = useState('');
  const [toast, setToast] = useState(null);
  const [docsFor, setDocsFor] = useState(null);

  const loadCounts = useCallback(async () => {
    const { data, error } = await supabase.from('delivery_photos').select('order_id, stop_id, kind');
    if (error) return;
    const m = {};
    data.forEach((p) => {
      const k = `${p.order_id}|${p.stop_id || ''}`;
      m[k] = m[k] || { bien_ban: 0, bill: 0 };
      m[k][p.kind] = (m[k][p.kind] || 0) + 1;
    });
    setCounts(m);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_no, order_type, pickup, delivery, cargo, weight, plate, truck, ship_date, customers(name, phone), order_stops(id, position, address, cargo, weight, customers(name, phone))')
      .order('ship_date', { ascending: true, nullsFirst: false });
    if (error) setErr('Không tải được danh sách chuyến. Bấm "Tải lại danh sách" bên dưới hoặc báo văn phòng.');
    else {
      setErr('');
      setOrders(data);
    }
    await loadCounts();
    setLoading(false);
  }, [loadCounts]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const list = useMemo(() => {
    const today = todayISO();
    const now = orders.filter((o) => !o.ship_date || o.ship_date >= today);
    const old = orders.filter((o) => o.ship_date && o.ship_date < today).reverse();
    return { now, old };
  }, [orders]);

  async function onFiles(order, point, kind, files) {
    if (!files?.length) return;
    const key = `${point.key}|${kind}`;
    setBusyKey(key);
    const { ok, total } = await uploadDocs(order.id, point.stopId, kind, files);
    setBusyKey('');
    setToast(
      ok === total
        ? { ok: true, text: `Đã lưu ${ok} ảnh ${kind === 'bill' ? 'bill' : 'biên bản'} – ${point.name || 'điểm giao'}` }
        : { ok: false, text: 'Tải ảnh không thành công. Kiểm tra mạng rồi chụp lại.' }
    );
    loadCounts();
  }

  const shown = tab === 'now' ? list.now : list.old;

  return (
    <div className="drv">
      <header className="drv-top">
        <div>
          <p className="drv-hello">Xin chào,</p>
          <p className="drv-name">{driverName}</p>
        </div>
        <button className="drv-logout" onClick={onLogout} aria-label={`Đăng xuất tài khoản ${email}`}>Đăng xuất</button>
      </header>

      <div className="drv-tabs" role="tablist" aria-label="Danh sách chuyến">
        <button role="tab" aria-selected={tab === 'now'} className={tab === 'now' ? 'on' : ''} onClick={() => setTab('now')}>
          Chuyến cần chạy ({list.now.length})
        </button>
        <button role="tab" aria-selected={tab === 'old'} className={tab === 'old' ? 'on' : ''} onClick={() => setTab('old')}>
          Đã qua ({list.old.length})
        </button>
      </div>

      <main className="drv-main">
        {err && <p className="err" role="alert">{err}</p>}
        {loading && !orders.length && <p className="drv-empty">Đang tải chuyến...</p>}
        {!loading && !shown.length && (
          <p className="drv-empty">{tab === 'now' ? 'Hiện chưa có chuyến nào được giao cho bạn.' : 'Chưa có chuyến cũ.'}</p>
        )}

        {shown.map((o) => {
          const points = pointsOf(o);
          return (
            <article className="drv-order" key={o.id}>
              <div className="drv-order-head">
                <strong>{orderCode(o.order_no)}</strong>
                <span>{dmy(o.ship_date)}</span>
              </div>
              <p className="drv-meta">
                <Icon name="truck" size={18} /> {o.plate || 'Chưa gán xe'}
              </p>
              <p className="drv-meta">
                <Icon name="box" size={18} /> <span><span className="muted">Lấy hàng:</span> {o.pickup}</span>
              </p>

              {points.map((p) => {
                const c = counts[p.key] || { bien_ban: 0, bill: 0 };
                const done = c.bien_ban > 0 && c.bill > 0;
                return (
                  <section className={`drv-point ${done ? 'done' : ''}`} key={p.key}>
                    <div className="drv-point-head">
                      <span className="drv-no">{points.length > 1 ? `Điểm ${p.no}` : 'Điểm giao'}</span>
                      {done && <span className="drv-done"><Icon name="check" size={16} /> Đủ chứng từ</span>}
                    </div>
                    <p className="drv-cus">{p.name}</p>
                    {p.address && (
                      <a className="drv-link" href={mapsUrl(p.address)} target="_blank" rel="noopener noreferrer">
                        <Icon name="pin" size={18} /> {p.address}
                      </a>
                    )}
                    {p.phone && (
                      <a className="drv-link" href={`tel:${p.phone}`}>
                        <Icon name="phone" size={18} /> {p.phone}
                      </a>
                    )}
                    {(p.cargo || p.weight) && <p className="drv-cargo">{[p.cargo, p.weight].filter(Boolean).join(' · ')}</p>}

                    <div className="drv-shots">
                      <ShotButton label="Chụp biên bản" count={c.bien_ban} busy={busyKey === `${p.key}|bien_ban`}
                        onFiles={(f) => onFiles(o, p, 'bien_ban', f)} />
                      <ShotButton label="Chụp bill" count={c.bill} busy={busyKey === `${p.key}|bill`}
                        onFiles={(f) => onFiles(o, p, 'bill', f)} />
                    </div>
                    {(c.bien_ban > 0 || c.bill > 0) && (
                      <button className="drv-view" onClick={() => setDocsFor({
                        orderId: o.id, stopId: p.stopId, title: `${orderCode(o.order_no)} · ${p.name || 'Điểm giao'}`,
                      })}>
                        <Icon name="image" size={18} /> Xem ảnh đã chụp
                      </button>
                    )}
                  </section>
                );
              })}
            </article>
          );
        })}

        {!loading && <button className="drv-reload" onClick={load}>Tải lại danh sách</button>}
        <InstallApp compact />
      </main>

      {toast && <div className={`drv-toast ${toast.ok ? '' : 'bad'}`} role="status">{toast.text}</div>}

      {docsFor && (
        <DeliveryDocs
          orderId={docsFor.orderId}
          stopId={docsFor.stopId}
          title={docsFor.title}
          onClose={() => setDocsFor(null)}
          onChanged={loadCounts}
        />
      )}
    </div>
  );
}
