'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  supabase, vnd, orderCode, stopCode, customerCode, collectionCode, commas, displayLogin, BILLS_BUCKET,
} from '../../lib/supabase';
import Modal from './Modal';
import DropZone from './DropZone';
import DateInput from '../DateInput';
import MoneyInput from './MoneyInput';
import { compress } from './DeliveryDocs';

const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const dm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : 'Chưa có ngày');
const labelOf = (c) => `${customerCode(c.customer_no)} – ${c.name}${c.phone ? ` – ${c.phone}` : ''}`;

// Nhập nhãn trong danh sách gợi ý, hoặc chỉ nhập mã KH: "KH0003", "kh3", "3"
function resolveCustomer(text, customers) {
  const t = text.trim();
  if (!t) return null;
  const exact = customers.find((c) => labelOf(c) === t);
  if (exact) return exact;
  const m = t.match(/^(?:kh)?\s*0*(\d+)\s*$/i) || t.match(/^kh\s*0*(\d+)\b/i);
  if (m) return customers.find((c) => c.customer_no === Number(m[1])) || null;
  return null;
}

// edit: dòng phiếu Thu đang sửa (có collection_items); bỏ trống = tạo mới (Đề xuất Thu)
export default function CollectionForm({ onClose, onSaved, edit = null }) {
  const [customers, setCustomers] = useState([]);
  const [custText, setCustText] = useState('');
  const [customer, setCustomer] = useState(null);
  const [amount, setAmount] = useState(edit ? String(edit.amount) : '');
  const [method, setMethod] = useState(edit ? edit.method : '');
  const [bankId, setBankId] = useState(edit?.bank_account_id || '');
  const [banks, setBanks] = useState(null); // null = đang tải
  const [date, setDate] = useState(edit ? edit.collected_on : todayISO());
  const [content, setContent] = useState(edit?.content || '');
  const [files, setFiles] = useState([]); // ảnh mới: [{ file, url }]
  const [oldPhotos, setOldPhotos] = useState([]); // ảnh đã lưu của phiếu đang sửa: [{ id, path, url }]
  const [removed, setRemoved] = useState([]); // id ảnh cũ sẽ xoá khi lưu
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [sel, setSel] = useState({}); // orderId -> chuỗi số tiền thu (có mặt = đã chọn)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  const filesRef = useRef([]);
  filesRef.current = files;
  const editId = edit?.id || null;

  const loadOrders = useCallback(
    async (cid) => {
      setLoadingOrders(true);
      const cols = 'id, order_no, order_type, pickup, delivery, ship_date, fee, order_stops(customer_id, address, fee, stop_no)';
      const [a, b, it] = await Promise.all([
        supabase.from('orders').select(cols).eq('customer_id', cid),
        supabase.from('order_stops').select('order_id').eq('customer_id', cid),
        supabase.from('collection_items').select('order_id, amount, collection_id, collections!inner(customer_id)').eq('collections.customer_id', cid),
      ]);
      const multiIds = [...new Set((b.data || []).map((x) => x.order_id))];
      let multi = [];
      if (multiIds.length) multi = (await supabase.from('orders').select(cols).in('id', multiIds)).data || [];
      // "Đã thu" không tính phần của chính phiếu đang sửa
      const paidBy = {};
      (it.data || []).forEach((x) => {
        if (editId && x.collection_id === editId) return;
        paidBy[x.order_id] = (paidBy[x.order_id] || 0) + Number(x.amount);
      });

      const rows = [...(a.data || []).filter((o) => o.order_type !== 'multi'), ...multi].map((o) => {
        const mine = (o.order_stops || []).filter((s) => s.customer_id === cid);
        const isMulti = o.order_type === 'multi';
        const fee = isMulti ? mine.reduce((s, x) => s + Number(x.fee), 0) : Number(o.fee);
        const paid = paidBy[o.id] || 0;
        return {
          id: o.id,
          order_no: o.order_no,
          ship_date: o.ship_date,
          code: isMulti && mine.length
            ? [...mine].sort((a, b) => a.stop_no - b.stop_no).map((s) => stopCode(o.order_no, s.stop_no)).join(', ')
            : orderCode(o.order_no),
          route: isMulti ? `${o.pickup} → ${mine.map((s) => s.address).join('; ')}` : `${o.pickup} → ${o.delivery}`,
          fee,
          paid,
          remaining: Math.max(0, fee - paid),
        };
      });
      rows.sort((x, y) => (y.remaining > 0) - (x.remaining > 0) || (x.ship_date || '9').localeCompare(y.ship_date || '9') || x.order_no - y.order_no);
      setOrders(rows);
      // Sửa phiếu: chọn sẵn các đơn đã thu trong phiếu này (nếu vẫn là khách cũ)
      if (edit && cid === edit.customer_id) {
        const pre = {};
        (edit.collection_items || []).forEach((i) => {
          if (rows.some((r) => r.id === i.order_id)) pre[i.order_id] = String(i.amount);
        });
        setSel(pre);
      }
      setLoadingOrders(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editId]
  );

  useEffect(() => {
    supabase
      .from('bank_accounts')
      .select('id, bank_name, account_number, account_name')
      .order('bank_name')
      .then(({ data }) => setBanks(data || []));
    supabase
      .from('customers')
      .select('id, customer_no, name, phone')
      .order('customer_no')
      .then(({ data, error }) => {
        if (error) return setErr('Không tải được danh sách khách hàng. Hãy chạy supabase/collections.sql trên Supabase.');
        setCustomers(data || []);
        if (edit) {
          const c = (data || []).find((x) => x.id === edit.customer_id);
          if (c) {
            setCustomer(c);
            setCustText(labelOf(c));
            loadOrders(c.id);
          }
        }
      });
    return () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sửa phiếu: nạp ảnh bill đã lưu
  useEffect(() => {
    if (!editId) return;
    (async () => {
      const { data } = await supabase.from('collection_photos').select('id, path').eq('collection_id', editId).order('created_at');
      if (!data?.length) return;
      const { data: signed } = await supabase.storage.from(BILLS_BUCKET).createSignedUrls(data.map((p) => p.path), 3600);
      const url = Object.fromEntries((signed || []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));
      setOldPhotos(data.map((p) => ({ ...p, url: url[p.path] })));
    })();
  }, [editId]);

  function onCustomerText(v) {
    setCustText(v);
    const c = resolveCustomer(v, customers);
    if ((c?.id || null) !== (customer?.id || null)) {
      setCustomer(c);
      setSel({});
      setOrders([]);
      if (c) loadOrders(c.id);
    }
  }

  const allocated = useMemo(() => Object.values(sel).reduce((a, v) => a + Number(v || 0), 0), [sel]);
  const amt = Number(amount || 0);
  const left = amt - allocated;

  function toggle(o, on) {
    setSel((s) => {
      const n = { ...s };
      if (on) n[o.id] = '';
      else delete n[o.id];
      return n;
    });
  }

  function addFiles(list) {
    const add = [...list].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name)).map((file) => ({ file, url: URL.createObjectURL(file) }));
    setFiles((s) => [...s, ...add]);
    if (fileRef.current) fileRef.current.value = '';
  }
  const removeFile = (i) => setFiles((s) => {
    URL.revokeObjectURL(s[i].url);
    return s.filter((_, j) => j !== i);
  });

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!(amt > 0)) return setErr('Vui lòng nhập số tiền thu.');
    if (!method) return setErr('Vui lòng chọn hình thức thanh toán.');
    if (method === 'transfer' && !bankId) return setErr('Vui lòng chọn ngân hàng nhận tiền.');
    if (!customer) return setErr('Vui lòng chọn khách hàng (hoặc nhập mã KH).');
    if (!date) return setErr('Vui lòng chọn ngày thu tiền.');

    const items = [];
    for (const o of orders) {
      if (sel[o.id] === undefined) continue;
      const a = Number(sel[o.id] || 0);
      if (!(a > 0)) return setErr(`Đơn ${o.code}: vui lòng nhập số tiền thu.`);
      if (a > o.remaining) return setErr(`Đơn ${o.code}: số tiền thu vượt quá số còn thiếu (${vnd(o.remaining)}).`);
      items.push({ order_id: o.id, amount: a });
    }
    if (allocated > amt) return setErr(`Tổng tiền các đơn (${vnd(allocated)}) lớn hơn số tiền thu (${vnd(amt)}).`);
    if (left > 0 && !window.confirm(`Còn ${vnd(left)} chưa được gán cho đơn hàng nào. Vẫn lưu phiếu thu?`)) return;

    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const by = displayLogin(u?.user?.email);
    let id = editId;
    let no = edit?.collection_no;

    if (edit) {
      // Sửa: một lần gọi duy nhất, lỗi thì database giữ nguyên bản cũ
      const r = await supabase.rpc('update_collection', {
        p_id: editId, p_customer: customer.id, p_amount: amt, p_method: method, p_date: date,
        p_content: content.trim() || null, p_items: items, p_by: by,
        p_bank: method === 'transfer' ? bankId : null,
      });
      if (r.error) {
        setBusy(false);
        return setErr(
          r.error.code === 'P0001'
            ? r.error.message
            : r.error.code === 'PGRST202'
              ? 'Chưa bật tính năng chọn ngân hàng. Hãy chạy supabase/reconcile.sql trên Supabase.'
              : 'Không lưu được thay đổi. Vui lòng thử lại.'
        );
      }
    } else {
      const ins = await supabase
        .from('collections')
        .insert({
          customer_id: customer.id, amount: amt, method, collected_on: date, content: content.trim() || null, created_by_name: by,
          bank_account_id: method === 'transfer' ? bankId : null,
        })
        .select('id, collection_no')
        .single();
      if (ins.error) {
        setBusy(false);
        return setErr('Không lưu được phiếu thu. Hãy chạy supabase/collections.sql trên Supabase rồi thử lại.');
      }
      id = ins.data.id;
      no = ins.data.collection_no;
      if (items.length) {
        const r = await supabase.from('collection_items').insert(items.map((i) => ({ ...i, collection_id: id })));
        if (r.error) {
          await supabase.from('collections').delete().eq('id', id); // hoàn tác, không để phiếu dở dang
          setBusy(false);
          return setErr(r.error.code === 'P0001' ? r.error.message : 'Không lưu được phân bổ vào đơn hàng. Vui lòng thử lại.');
        }
      }
    }

    // Ảnh: xoá ảnh cũ đã bỏ, tải ảnh mới
    let failed = 0;
    for (const pid of removed) {
      const p = oldPhotos.find((x) => x.id === pid);
      if (!p) continue;
      await supabase.storage.from(BILLS_BUCKET).remove([p.path]);
      const d = await supabase.from('collection_photos').delete().eq('id', pid);
      if (d.error) failed++;
    }
    for (const f of files) {
      const { blob, ext, type } = await compress(f.file);
      const path = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const up = await supabase.storage.from(BILLS_BUCKET).upload(path, blob, { contentType: type });
      const row = up.error ? { error: up.error } : await supabase.from('collection_photos').insert({ collection_id: id, path });
      if (row.error) {
        failed++;
        if (!up.error) await supabase.storage.from(BILLS_BUCKET).remove([path]);
      }
    }
    setBusy(false);
    onSaved({ no, failedPhotos: failed, edited: !!edit });
  }

  const unpaidCount = orders.filter((o) => o.remaining > 0).length;
  const shownOld = oldPhotos.filter((p) => !removed.includes(p.id));

  return (
    <Modal title={edit ? `Sửa phiếu Thu ${collectionCode(edit.collection_no)}` : 'Đề xuất Thu'} onClose={onClose} width={940}>
      <form className="form" onSubmit={submit} noValidate>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="c-amount">Số tiền thu (đồng) *</label>
            <MoneyInput id="c-amount" value={amount} onChange={setAmount} placeholder="VD: 5,000,000" className="money-big" />
          </div>
          <div className="field">
            <span className="label-like" id="c-method-l">Hình thức thanh toán *</span>
            <div className="seg" role="radiogroup" aria-labelledby="c-method-l">
              {[['cash', 'Tiền mặt'], ['transfer', 'Chuyển khoản']].map(([v, label]) => (
                <button type="button" key={v} role="radio" aria-checked={method === v} className={method === v ? 'on' : ''} onClick={() => setMethod(v)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {method === 'transfer' && (
          <div className="field">
            <label htmlFor="c-bank">Ngân hàng nhận tiền * <span className="muted small" style={{ color: 'var(--muted)' }}>(dùng để đối soát với sao kê)</span></label>
            <select id="c-bank" value={bankId} onChange={(e) => setBankId(e.target.value)}>
              <option value="">{banks === null ? 'Đang tải...' : 'Chọn ngân hàng'}</option>
              {(banks || []).map((b) => (
                <option key={b.id} value={b.id}>{b.bank_name} · {b.account_number} – {b.account_name}</option>
              ))}
            </select>
            {banks && banks.length === 0 && (
              <p className="sum-warn small" style={{ margin: 0 }}>Chưa có ngân hàng nào. Hãy thêm tài khoản ở mục <strong>Giao dịch ngân hàng</strong> trước.</p>
            )}
          </div>
        )}

        <div className="field">
          <label htmlFor="c-cus">Khách hàng * <span className="muted small" style={{ color: 'var(--muted)' }}>(chọn trong danh sách hoặc nhập mã KH)</span></label>
          <input id="c-cus" list="c-cus-list" value={custText} onChange={(e) => onCustomerText(e.target.value)} placeholder="Nhập mã KH (VD: KH0003) hoặc tên khách hàng" autoComplete="off" />
          <datalist id="c-cus-list">{customers.map((c) => <option key={c.id} value={labelOf(c)} />)}</datalist>
          {customer ? (
            <p className="ok-msg" style={{ margin: 0 }}>✓ {customerCode(customer.customer_no)} – {customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</p>
          ) : custText.trim() ? (
            <p className="muted small" style={{ margin: 0 }}>Chưa chọn được khách hàng. Hãy chọn một dòng trong gợi ý hoặc nhập đúng mã KH.</p>
          ) : null}
          {edit && customer && customer.id !== edit.customer_id && (
            <p className="sum-warn small" style={{ margin: 0 }}>Đổi khách hàng: các đơn đã chọn của khách cũ sẽ bị bỏ, cần chọn lại đơn của khách mới.</p>
          )}
        </div>

        <div className="grid-2">
          <div className="field"><label htmlFor="c-date">Ngày thu tiền *</label><DateInput id="c-date" value={date} onChange={setDate} /></div>
          <div className="field"><label htmlFor="c-content">Nội dung thu</label><input id="c-content" value={content} onChange={(e) => setContent(e.target.value)} placeholder="VD: Thu tiền cước tháng 11" /></div>
        </div>

        <div className="field">
          <span className="label-like">Hình ảnh bill thu tiền</span>
          <div className="bill-row">
            <DropZone id="c-files" onFiles={addFiles} />
            {files.length === 0 && shownOld.length === 0 && <span className="muted small">Chưa có ảnh (không bắt buộc)</span>}
            <ul className="bill-thumbs">
              {shownOld.map((p, i) => (
                <li key={p.id}>
                  {p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt={`Ảnh bill đã lưu ${i + 1}`} />
                  ) : <span className="muted small">...</span>}
                  <button type="button" onClick={() => setRemoved((r) => [...r, p.id])} aria-label={`Bỏ ảnh đã lưu ${i + 1}`}>✕</button>
                </li>
              ))}
              {files.map((f, i) => (
                <li key={f.url}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={`Ảnh bill mới ${i + 1}`} />
                  <button type="button" onClick={() => removeFile(i)} aria-label={`Bỏ ảnh mới ${i + 1}`}>✕</button>
                </li>
              ))}
            </ul>
          </div>
          {removed.length > 0 && <p className="muted small" style={{ margin: 0 }}>{removed.length} ảnh đã lưu sẽ bị xoá khi bạn bấm Lưu.</p>}
        </div>

        <section className="alloc">
          <div className="alloc-head">
            <h3>Đơn hàng thu tiền</h3>
            {customer && !loadingOrders && <span className="muted small">{orders.length} đơn của khách · {unpaidCount} đơn còn thiếu</span>}
          </div>

          {!customer && <p className="alloc-empty">Chọn khách hàng ở trên để xem các đơn hàng cần thu.</p>}
          {customer && loadingOrders && <p className="alloc-empty">Đang tải đơn hàng...</p>}
          {customer && !loadingOrders && !orders.length && <p className="alloc-empty">Khách hàng này chưa có đơn hàng nào.</p>}

          {customer && !loadingOrders && orders.length > 0 && (
            <div className="alloc-scroll">
              <table className="alloc-table">
                <thead>
                  <tr>
                    <th aria-label="Chọn" />
                    <th>Đơn hàng</th>
                    <th>Tuyến</th>
                    <th className="num">Cước</th>
                    <th className="num">Đã thu</th>
                    <th className="num">Còn thiếu</th>
                    <th className="num">Số tiền thu</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const on = sel[o.id] !== undefined;
                    const done = o.remaining === 0;
                    return (
                      <tr key={o.id} className={`${on ? 'on' : ''} ${done ? 'done' : ''}`}>
                        <td>
                          <input type="checkbox" checked={on} disabled={done} onChange={(e) => toggle(o, e.target.checked)} aria-label={`Chọn đơn ${o.code}`} />
                        </td>
                        <td><strong>{o.code}</strong><div className="muted small">{dm(o.ship_date)}</div></td>
                        <td className="route">{o.route}</td>
                        <td className="num">{commas(o.fee)}</td>
                        <td className="num">{commas(o.paid)}</td>
                        <td className="num"><strong className={done ? 'debt-zero' : 'debt-has'}>{done ? 'Đã thu đủ' : commas(o.remaining)}</strong></td>
                        <td className="num">
                          <div className="pay-cell">
                            <MoneyInput
                              value={on ? sel[o.id] : ''}
                              onChange={(v) => setSel((s) => ({ ...s, [o.id]: v }))}
                              disabled={!on}
                              placeholder={done ? '' : commas(o.remaining)}
                              aria-label={`Số tiền thu cho đơn ${o.code}`}
                            />
                            <button type="button" className="fill-btn" disabled={!on} onClick={() => setSel((s) => ({ ...s, [o.id]: String(o.remaining) }))} title="Điền đủ số còn thiếu">Đủ</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {customer && orders.length > 0 && (
            <div className="alloc-sum">
              <span>Số tiền thu: <strong>{vnd(amt)}</strong></span>
              <span>Đã gán cho đơn: <strong>{vnd(allocated)}</strong></span>
              <span className={left < 0 ? 'sum-bad' : left > 0 ? 'sum-warn' : 'sum-ok'}>
                {left < 0 ? `Vượt ${vnd(-left)}` : left > 0 ? `Chưa gán: ${vnd(left)}` : 'Đã gán đủ'}
              </span>
            </div>
          )}
        </section>

        {err && <p className="err" role="alert">{err}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>Huỷ</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Đang lưu...' : edit ? 'Lưu thay đổi' : 'Tạo đề xuất Thu'}</button>
        </div>
      </form>
    </Modal>
  );
}
