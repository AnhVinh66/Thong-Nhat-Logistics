'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  supabase, vnd, orderCode, stopCode, customerCode, collectionCode, customerTypes, methodLabel, fmtDate,
} from '../../../../lib/supabase';
import DateInput from '../../../../components/DateInput';

const dmy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

const PAY = {
  paid: { label: 'Đã thanh toán đủ', cls: 'st-paid' },
  part: { label: 'Thanh toán một phần', cls: 'st-pending' },
  none: { label: 'Chưa thanh toán', cls: 'st-none' },
};
const payState = (fee, paid) => (paid >= fee && fee > 0 ? 'paid' : paid > 0 ? 'part' : 'none');

export default function Page() {
  const [id, setId] = useState(undefined);
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get('id') || null);
  }, []);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const cols = 'id, order_no, order_type, pickup, delivery, ship_date, fee, order_stops(customer_id, address, fee, stop_no)';
      const [c, a, b, it, col] = await Promise.all([
        supabase.from('customers').select('*').eq('id', id).maybeSingle(),
        supabase.from('orders').select(cols).eq('customer_id', id),
        supabase.from('order_stops').select('order_id').eq('customer_id', id),
        supabase.from('collection_items').select('order_id, amount, collection_id, collections!inner(customer_id)').eq('collections.customer_id', id),
        supabase.from('collections').select('id, collection_no, collected_on, amount, method, content').eq('customer_id', id).order('collected_on', { ascending: false }),
      ]);
      if (c.error || !c.data) {
        setErr(c.error ? 'Không tải được dữ liệu khách hàng.' : 'Không tìm thấy khách hàng này.');
        setLoading(false);
        return;
      }
      setCustomer(c.data);

      const multiIds = [...new Set((b.data || []).map((x) => x.order_id))];
      let multi = [];
      if (multiIds.length) multi = (await supabase.from('orders').select(cols).in('id', multiIds)).data || [];

      // Tiền khách đã thanh toán cho từng đơn (theo các phiếu Thu có gán đơn)
      const paidBy = {};
      const allocByCollection = {};
      (it.data || []).forEach((x) => {
        paidBy[x.order_id] = (paidBy[x.order_id] || 0) + Number(x.amount);
        allocByCollection[x.collection_id] = (allocByCollection[x.collection_id] || 0) + Number(x.amount);
      });

      const rows = [...(a.data || []).filter((o) => o.order_type !== 'multi'), ...multi].map((o) => {
        const isMulti = o.order_type === 'multi';
        const mine = (o.order_stops || []).filter((s) => s.customer_id === id).sort((x, y) => x.stop_no - y.stop_no);
        const fee = isMulti ? mine.reduce((s, x) => s + Number(x.fee), 0) : Number(o.fee);
        const paid = paidBy[o.id] || 0;
        return {
          id: o.id,
          order_no: o.order_no,
          code: isMulti && mine.length ? mine.map((s) => stopCode(o.order_no, s.stop_no)).join(', ') : orderCode(o.order_no),
          parent: orderCode(o.order_no),
          multi: isMulti,
          ship_date: o.ship_date,
          route: isMulti ? `${o.pickup} → ${mine.map((s) => s.address).join('; ')}` : `${o.pickup} → ${o.delivery}`,
          fee,
          paid,
          debt: fee - paid,
        };
      });
      rows.sort((x, y) => (y.ship_date || '').localeCompare(x.ship_date || '') || y.order_no - x.order_no);
      setOrders(rows);
      setPayments((col.data || []).map((p) => ({ ...p, allocated: allocByCollection[p.id] || 0 })));
      setErr('');
      setLoading(false);
    })();
  }, [id]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (fStatus && payState(o.fee, o.paid) !== fStatus) return false;
      if (from && (!o.ship_date || o.ship_date < from)) return false;
      if (to && (!o.ship_date || o.ship_date > to)) return false;
      if (!s) return true;
      return [o.code, o.parent, o.route].some((v) => (v || '').toLowerCase().includes(s));
    });
  }, [orders, q, fStatus, from, to]);

  const sum = (list) => list.reduce((a, o) => ({ n: a.n + 1, fee: a.fee + o.fee, paid: a.paid + o.paid, debt: a.debt + o.debt }), { n: 0, fee: 0, paid: 0, debt: 0 });
  const all = useMemo(() => sum(orders), [orders]);
  const view = useMemo(() => sum(shown), [shown]);
  const unallocated = payments.reduce((a, p) => a + (Number(p.amount) - p.allocated), 0);

  if (id === null || (err && !customer)) {
    return (
      <div className="card">
        <p style={{ marginTop: 0 }}>{err || 'Chưa chọn khách hàng.'}</p>
        <Link href="/nhan-vien/khach-hang/" className="btn btn-primary">← Về danh sách khách hàng</Link>
      </div>
    );
  }

  return (
    <>
      <div className="cd-head">
        <div>
          <Link href="/nhan-vien/khach-hang/" className="panel-link" style={{ marginBottom: 4 }}>← Danh sách khách hàng</Link>
          <h1 style={{ fontSize: '1.7rem', margin: '2px 0 4px' }}>
            {customer ? customer.name : '...'}
            {customer && <span className="cus-code" style={{ marginLeft: 10, verticalAlign: 'middle' }}>{customerCode(customer.customer_no)}</span>}
          </h1>
          {customer && (
            <p className="muted" style={{ margin: 0 }}>
              <span className={`pill pill-type-${customer.type}`} style={{ marginRight: 8 }}>{customerTypes[customer.type]}</span>
              {[customer.phone, customer.email, customer.company, customer.tax_code && `MST ${customer.tax_code}`, customer.address].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>

      <div className="kpis" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <div className="kpi"><span className="kpi-icon tone-navy"><span aria-hidden="true">#</span></span><span className="kpi-text"><span className="kpi-label">Tổng số đơn hàng</span><span className="kpi-value">{all.n}</span><span className="kpi-sub">{orders.filter((o) => o.debt > 0).length} đơn còn nợ</span></span></div>
        <div className="kpi"><span className="kpi-icon tone-blue"><span aria-hidden="true">₫</span></span><span className="kpi-text"><span className="kpi-label">Tổng cước các đơn</span><span className="kpi-value">{vnd(all.fee)}</span></span></div>
        <div className="kpi"><span className="kpi-icon tone-ok"><span aria-hidden="true">✓</span></span><span className="kpi-text"><span className="kpi-label">Đã thanh toán</span><span className="kpi-value" style={{ color: 'var(--ok)' }}>{vnd(all.paid)}</span><span className="kpi-sub">{payments.length} lần thu</span></span></div>
        <div className="kpi"><span className="kpi-icon tone-err"><span aria-hidden="true">!</span></span><span className="kpi-text"><span className="kpi-label">Công nợ còn lại</span><span className="kpi-value" style={{ color: all.debt > 0 ? 'var(--err)' : 'var(--muted)' }}>{vnd(all.debt)}</span></span></div>
      </div>

      <h2 className="cd-title">Các đơn hàng</h2>
      <div className="toolbar">
        <input aria-label="Tìm đơn hàng" placeholder="Tìm theo mã đơn (VD: DH0004-2), tuyến..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Tình trạng thanh toán" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">Mọi tình trạng</option>
          <option value="none">Chưa thanh toán</option>
          <option value="part">Thanh toán một phần</option>
          <option value="paid">Đã thanh toán đủ</option>
        </select>
        <span className="date-filter">Từ <DateInput aria-label="Từ ngày" value={from} onChange={setFrom} /></span>
        <span className="date-filter">Đến <DateInput aria-label="Đến ngày" value={to} onChange={setTo} /></span>
      </div>

      {err && <p className="err" role="alert">{err}</p>}
      <div className="table-wrap">
        <table className="fleet-table staff-table cd-table">
          <thead>
            <tr>
              <th>Mã đơn</th><th>Ngày vận chuyển</th><th>Tuyến</th>
              <th className="num">Cước phí</th><th className="num">Đã thanh toán</th><th className="num">Công nợ</th><th>Tình trạng</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((o) => {
              const st = PAY[payState(o.fee, o.paid)];
              return (
                <tr key={o.id}>
                  <td>
                    <Link href={`/nhan-vien/don-hang/?q=${o.parent}`} className="code">{o.code}</Link>
                    {o.multi && <div className="muted small">thuộc {o.parent} (đơn nhiều điểm)</div>}
                  </td>
                  <td>{o.ship_date ? dmy(o.ship_date) : <span className="muted">Chưa có ngày</span>}</td>
                  <td className="cd-route">{o.route}</td>
                  <td className="num">{vnd(o.fee)}</td>
                  <td className="num"><strong style={{ color: o.paid ? 'var(--ok)' : 'var(--muted)' }}>{vnd(o.paid)}</strong></td>
                  <td className="num"><strong style={{ color: o.debt > 0 ? 'var(--err)' : 'var(--muted)' }}>{vnd(o.debt)}</strong></td>
                  <td><span className={`st-pill ${st.cls}`}>{st.label}</span></td>
                </tr>
              );
            })}
            {!loading && !shown.length && <tr><td colSpan={7} className="muted">{orders.length ? 'Không có đơn hàng nào khớp bộ lọc.' : 'Khách hàng này chưa có đơn hàng nào.'}</td></tr>}
            {loading && <tr><td colSpan={7} className="muted">Đang tải...</td></tr>}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={3}><strong>Tổng ({view.n} đơn){shown.length !== orders.length ? ' theo bộ lọc' : ''}</strong></td>
                <td className="num"><strong>{vnd(view.fee)}</strong></td>
                <td className="num"><strong>{vnd(view.paid)}</strong></td>
                <td className="num"><strong>{vnd(view.debt)}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <h2 className="cd-title" style={{ marginTop: 28 }}>Các lần thanh toán (phiếu Thu)</h2>
      <div className="table-wrap">
        <table className="fleet-table staff-table cd-table">
          <thead>
            <tr><th>Mã phiếu</th><th>Ngày thu</th><th>Hình thức</th><th>Nội dung</th><th className="num">Số tiền thu</th><th className="num">Đã gán cho đơn</th><th className="num">Chưa gán</th></tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td><strong>{collectionCode(p.collection_no)}</strong></td>
                <td>{dmy(p.collected_on)}</td>
                <td>{methodLabel[p.method]}</td>
                <td className="cd-route">{p.content || <span className="muted">—</span>}</td>
                <td className="num"><strong style={{ color: 'var(--ok)' }}>{vnd(p.amount)}</strong></td>
                <td className="num">{vnd(p.allocated)}</td>
                <td className="num">{Number(p.amount) - p.allocated > 0 ? <strong style={{ color: 'var(--gold)' }}>{vnd(Number(p.amount) - p.allocated)}</strong> : <span className="muted">—</span>}</td>
              </tr>
            ))}
            {!loading && !payments.length && <tr><td colSpan={7} className="muted">Khách hàng này chưa có phiếu Thu nào.</td></tr>}
          </tbody>
          {payments.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4}><strong>Tổng ({payments.length} phiếu)</strong></td>
                <td className="num"><strong>{vnd(payments.reduce((a, p) => a + Number(p.amount), 0))}</strong></td>
                <td className="num"><strong>{vnd(all.paid)}</strong></td>
                <td className="num"><strong>{unallocated > 0 ? vnd(unallocated) : '—'}</strong></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {unallocated > 0 && (
        <p className="muted small" style={{ marginTop: 8 }}>
          “Chưa gán” là tiền khách đã trả nhưng chưa được gán cho đơn hàng nào nên chưa trừ vào công nợ. Mở phiếu Thu ở mục Thu tiền → Sửa để gán cho đơn.
        </p>
      )}
    </>
  );
}
