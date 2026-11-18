'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, customerTypes, vnd, customerCode, fmtDate, orderCode, stopCode, displayLogin } from '../../../lib/supabase';
import { useRole, roleLabel } from '../../../components/staff/Role';
import Modal from '../../../components/staff/Modal';

const blank = { name: '', phone: '', email: '', address: '', company: '', tax_code: '', type: 'le', note: '' };
const dmy = fmtDate;

// Công nợ theo khách = tổng cước các đơn của khách − tiền đã thu theo phiếu Thu.
// Đơn 1 điểm: cước của đơn; đơn nhiều điểm: cước của từng điểm trả thuộc khách đó.
// Mỗi khách có thêm `lines`: từng đơn của khách (cước, đã thu, còn nợ) để hiện bảng chi tiết.
function debtByCustomer(orders, paidItems) {
  const m = {};
  const row = (id) => (m[id] = m[id] || { fee: 0, paid: 0, debt: 0, orders: new Set(), lines: {} });
  const line = (id, o) => {
    const r = row(id);
    return (r.lines[o.id] = r.lines[o.id] || { order: o, fee: 0, paid: 0, stops: [] });
  };
  const add = (id, v, o, stop) => {
    if (!id) return;
    row(id).fee += Number(v || 0);
    row(id).orders.add(o.id);
    const l = line(id, o);
    l.fee += Number(v || 0);
    if (stop) l.stops.push(stop);
  };
  orders.forEach((o) => {
    if (o.order_type === 'multi') (o.order_stops || []).forEach((s) => add(s.customer_id, s.fee, o, s));
    else add(o.customer_id, o.fee, o, null);
  });
  (paidItems || []).forEach((i) => {
    const cid = i.collections?.customer_id;
    if (!cid) return;
    const amt = Number(i.amount || 0);
    row(cid).paid += amt;
    const l = row(cid).lines[i.order_id];
    if (l) l.paid += amt;
  });
  Object.values(m).forEach((r) => {
    r.debt = r.fee - r.paid;
    r.list = Object.values(r.lines).sort(
      (a, b) => (b.order.ship_date || '').localeCompare(a.order.ship_date || '') || b.order.order_no - a.order.order_no
    );
  });
  return m;
}

// Bảng chi tiết các đơn hàng của một khách
function CustomerDetail({ d }) {
  if (!d || !d.list.length) return <p className="muted" style={{ margin: 0 }}>Khách hàng này chưa có đơn hàng nào.</p>;
  return (
    <div className="cus-detail-box">
      <div className="cus-sum">
        <div><span className="muted small">Số đơn hàng</span><strong>{d.orders.size}</strong></div>
        <div><span className="muted small">Tổng cước</span><strong>{vnd(d.fee)}</strong></div>
        <div><span className="muted small">Đã thanh toán</span><strong className="debt-ok">{vnd(d.paid)}</strong></div>
        <div><span className="muted small">Công nợ (còn phải thu)</span><strong className={d.debt ? 'debt-has' : 'debt-zero'}>{vnd(d.debt)}</strong></div>
      </div>
      <table className="cus-detail-table">
        <thead>
          <tr>
            <th>Mã đơn</th>
            <th>Ngày vận chuyển</th>
            <th>Tuyến / Hàng hoá</th>
            <th className="num">Cước</th>
            <th className="num">Đã thanh toán</th>
            <th className="num">Công nợ</th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {d.list.map(({ order: o, fee, paid, stops }) => {
            const debt = fee - paid;
            const sorted = [...stops].sort((a, b) => a.stop_no - b.stop_no);
            const codes = sorted.length ? sorted.map((s) => stopCode(o.order_no, s.stop_no)) : [orderCode(o.order_no)];
            const dest = sorted.length ? sorted.map((s) => s.address).join('; ') : o.delivery;
            const cargo = sorted.length ? sorted.map((s) => s.cargo).filter(Boolean).join('; ') : o.cargo;
            return (
              <tr key={o.id}>
                <td>{codes.map((c) => <div key={c}><span className="stop-code">{c}</span></div>)}</td>
                <td>{o.ship_date ? fmtDate(o.ship_date) : <span className="muted">—</span>}</td>
                <td>
                  <div>{o.pickup} → {dest}</div>
                  {cargo && <div className="muted small">{cargo}</div>}
                </td>
                <td className="num">{vnd(fee)}</td>
                <td className="num">{vnd(paid)}</td>
                <td className="num"><strong className={debt ? 'debt-has' : 'debt-zero'}>{vnd(debt)}</strong></td>
                <td>
                  {debt <= 0 ? <span className="pill pill-ok">Đã thanh toán</span>
                    : paid > 0 ? <span className="pill pill-warn">Thanh toán một phần</span>
                    : <span className="pill pill-err">Chưa thanh toán</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}><strong>Tổng cộng</strong></td>
            <td className="num"><strong>{vnd(d.fee)}</strong></td>
            <td className="num"><strong>{vnd(d.paid)}</strong></td>
            <td className="num"><strong className={d.debt ? 'debt-has' : 'debt-zero'}>{vnd(d.debt)}</strong></td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function Page() {
  const { addCustomer, editCustomer, deleteCustomer, assignCustomer, userId } = useRole();
  const [staffList, setStaffList] = useState([]); // nhân viên văn phòng (để hiện tên người phụ trách)
  const [rows, setRows] = useState([]);
  const [debts, setDebts] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState('debt'); // debt | new | name
  const [open, setOpen] = useState({}); // khách nào đang mở bảng chi tiết
  const [editing, setEditing] = useState(null);
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('staff_roles').select('user_id, full_name, email, role').in('role', ['staff', 'sales', 'accountant', 'dispatcher'])
      .then(({ data }) => setStaffList((data || []).map((u) => ({ ...u, name: u.full_name || displayLogin(u.email) }))));
  }, []);
  const staffById = useMemo(() => Object.fromEntries(staffList.map((u) => [u.user_id, u])), [staffList]);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, o, p] = await Promise.all([
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('id, order_no, order_type, customer_id, fee, ship_date, pickup, delivery, cargo, order_stops(customer_id, fee, stop_no, address, cargo)'),
      supabase.from('collection_items').select('order_id, amount, collections(customer_id)'),
    ]);
    if (c.error) setErr('Không tải được danh sách khách hàng.');
    else {
      setErr('');
      setRows(c.data);
    }
    if (!o.error) setDebts(debtByCustomer(o.data || [], p.error ? [] : p.data));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (!type || r.type === type) &&
        (!s || [r.name, r.phone, r.email, r.company, r.tax_code, r.address, customerCode(r.customer_no)].some((v) => (v || '').toLowerCase().includes(s)))
    );
    const debtOf = (r) => debts[r.id]?.debt || 0;
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'vi');
      if (sort === 'new') return (b.created_at || '').localeCompare(a.created_at || '');
      return debtOf(b) - debtOf(a) || a.name.localeCompare(b.name, 'vi');
    });
  }, [rows, q, type, sort, debts]);

  const totalDebt = useMemo(() => shown.reduce((a, r) => a + (debts[r.id]?.debt || 0), 0), [shown, debts]);

  async function save(e) {
    e.preventDefault();
    setFormErr('');
    if (!editing.name.trim() || !editing.phone.trim()) {
      setFormErr('Vui lòng nhập tên và số điện thoại.');
      return;
    }
    setBusy(true);
    const { id, created_at, customer_no, ...fields } = editing;
    if (!assignCustomer) delete fields.sales_user_id; // chỉ Admin được đổi người phụ trách
    else if (!fields.sales_user_id) fields.sales_user_id = null;
    const clean = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
    const { error } = id
      ? await supabase.from('customers').update(clean).eq('id', id)
      : await supabase.from('customers').insert(clean);
    setBusy(false);
    if (error) {
      setFormErr('Không lưu được. Vui lòng thử lại.');
      return;
    }
    setEditing(null);
    load();
  }

  async function remove(r) {
    if (!window.confirm(`Xoá khách hàng "${r.name}"? Thao tác này không thể hoàn tác.`)) return;
    const { error } = await supabase.from('customers').delete().eq('id', r.id);
    if (error) {
      window.alert(
        error.code === '23503'
          ? 'Không thể xoá: khách hàng này còn đơn hàng. Hãy xoá hoặc chuyển các đơn hàng trước.'
          : 'Không xoá được. Vui lòng thử lại.'
      );
      return;
    }
    load();
  }

  const set = (k) => (e) => setEditing((s) => ({ ...s, [k]: e.target.value }));
  const openEdit = (r) => {
    setFormErr('');
    const { created_at, customer_no, ...rest } = r || {};
    setEditing(r ? { ...blank, ...rest } : { ...blank, sales_user_id: userId || '' });
  };

  return (
    <>
      <div className="staff-head">
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Khách hàng</h1>
        {addCustomer && <button className="btn btn-primary" onClick={() => openEdit(null)}>+ Thêm khách hàng</button>}
      </div>

      <div className="toolbar">
        <input aria-label="Tìm kiếm" placeholder="Tìm theo mã KH, tên, SĐT, công ty, MST..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Lọc theo loại khách" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Tất cả loại khách</option>
          {Object.entries(customerTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Sắp xếp" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="debt">Công nợ: nhiều → ít</option>
          <option value="new">Mới tạo trước</option>
          <option value="name">Tên A → Z</option>
        </select>
      </div>

      {err && <p className="err" role="alert">{err}</p>}

      <table className="cus-table">
        <thead>
          <tr>
            <th className="c-date">Ngày tạo</th>
            <th>Khách hàng</th>
            <th>Liên hệ</th>
            <th>Công ty / MST</th>
            <th>Địa chỉ</th>
            <th className="c-owner">Nhân viên phụ trách</th>
            <th className="c-debt">Công nợ</th>
            <th className="c-act c-act3"><span className="sr-only">Thao tác</span></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const d = debts[r.id];
            const isOpen = !!open[r.id];
            return (
              <Fragment key={r.id}>
              <tr>
                <td className="c-date" data-label="Ngày tạo"><div>{dmy(r.created_at)}</div></td>
                <td data-label="Khách hàng">
                  <div>
                    <span className="cus-code">{customerCode(r.customer_no)}</span>
                    <strong className="c-name">{r.name}</strong>
                    <span className={`pill pill-type-${r.type}`}>{customerTypes[r.type]}</span>
                    {r.note && <div className="muted small c-note">{r.note}</div>}
                  </div>
                </td>
                <td data-label="Liên hệ">
                  <div>
                    <a href={`tel:${r.phone}`} className="c-phone">{r.phone}</a>
                    {r.email && <div className="muted small c-break">{r.email}</div>}
                  </div>
                </td>
                <td data-label="Công ty / MST">
                  <div>
                    {r.company || <span className="muted">—</span>}
                    {r.tax_code && <div className="muted small">MST: {r.tax_code}</div>}
                  </div>
                </td>
                <td data-label="Địa chỉ" className="c-break"><div>{r.address || <span className="muted">—</span>}</div></td>
                <td className="c-owner" data-label="Phụ trách">
                  <div>
                    {staffById[r.sales_user_id] ? (
                      <><strong>{staffById[r.sales_user_id].name}</strong><span className="muted small" style={{ display: 'block' }}>{roleLabel[staffById[r.sales_user_id].role]}</span></>
                    ) : <span className="muted">—</span>}
                  </div>
                </td>
                <td className="c-debt" data-label="Công nợ">
                  <div>
                    <strong className={d?.debt ? 'debt-has' : 'debt-zero'}>{vnd(d?.debt || 0)}</strong>
                    {d && <div className="muted small">{d.orders.size} đơn{d.paid > 0 ? ` · đã thu ${vnd(d.paid)}` : ''}</div>}
                    <button
                      type="button"
                      className="btn btn-outline sm detail-btn"
                      aria-expanded={isOpen}
                      onClick={() => setOpen((s) => ({ ...s, [r.id]: !s[r.id] }))}
                    >
                      {isOpen ? 'Ẩn chi tiết ▴' : 'Chi tiết ▾'}
                    </button>
                  </div>
                </td>
                <td className="c-act c-act3">
                  <div className="actions">
                    <a className="btn btn-primary sm" href={`/nhan-vien/khach-hang/chi-tiet/?id=${r.id}`}>Chi tiết</a>
                    {editCustomer && <button className="btn btn-outline sm" onClick={() => openEdit(r)}>Sửa</button>}
                    {deleteCustomer && <button className="btn btn-danger sm" onClick={() => remove(r)}>Xoá</button>}
                  </div>
                </td>
              </tr>
              {isOpen && (
                <tr className="cus-detail-row">
                  <td colSpan={8}><CustomerDetail d={d} /></td>
                </tr>
              )}
              </Fragment>
            );
          })}
          {!loading && !shown.length && <tr><td colSpan={8} className="muted">Chưa có khách hàng nào.</td></tr>}
          {loading && <tr><td colSpan={8} className="muted">Đang tải...</td></tr>}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={6}><strong>Tổng ({shown.length} khách hàng)</strong></td>
              <td className="c-debt" data-label="Tổng công nợ"><div><strong>{vnd(totalDebt)}</strong></div></td>
              <td className="c-act" />
            </tr>
          </tfoot>
        )}
      </table>

      {editing && (
        <Modal title={editing.id ? 'Sửa khách hàng' : 'Thêm khách hàng'} onClose={() => setEditing(null)}>
          <form className="form" onSubmit={save} noValidate>
            <div className="grid-2">
              <div className="field"><label htmlFor="f-name">Tên khách hàng *</label><input id="f-name" value={editing.name} onChange={set('name')} /></div>
              <div className="field"><label htmlFor="f-phone">Số điện thoại *</label><input id="f-phone" type="tel" value={editing.phone} onChange={set('phone')} /></div>
            </div>
            <div className="grid-2">
              <div className="field"><label htmlFor="f-email">Email</label><input id="f-email" type="email" value={editing.email || ''} onChange={set('email')} /></div>
              <div className="field">
                <label htmlFor="f-type">Phân loại</label>
                <select id="f-type" value={editing.type} onChange={set('type')}>
                  {Object.entries(customerTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="grid-2">
              <div className="field"><label htmlFor="f-company">Công ty</label><input id="f-company" value={editing.company || ''} onChange={set('company')} /></div>
              <div className="field"><label htmlFor="f-tax">Mã số thuế</label><input id="f-tax" value={editing.tax_code || ''} onChange={set('tax_code')} /></div>
            </div>
            <div className="field"><label htmlFor="f-addr">Địa chỉ</label><input id="f-addr" value={editing.address || ''} onChange={set('address')} /></div>
            {assignCustomer && (
              <div className="field">
                <label htmlFor="f-sales">Nhân viên phụ trách</label>
                <select id="f-sales" value={editing.sales_user_id || ''} onChange={set('sales_user_id')}>
                  <option value="">Chưa giao cho ai</option>
                  {staffList.map((u) => <option key={u.user_id} value={u.user_id}>{u.name} – {roleLabel[u.role]}</option>)}
                </select>
                {!editing.id && <p className="muted small" style={{ margin: 0 }}>Mặc định là người tạo khách hàng.</p>}
              </div>
            )}
            <div className="field"><label htmlFor="f-note">Ghi chú</label><textarea id="f-note" rows={3} value={editing.note || ''} onChange={set('note')} /></div>
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
