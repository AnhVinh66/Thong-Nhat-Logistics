'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, commas, customerCode, collectionCode, expenseCode } from '../../../../lib/supabase';
import { fmtTime, buildMatcher } from '../../../../lib/bank';
import Icon from '../../../../components/Icon';
import Modal from '../../../../components/staff/Modal';
import DateInput from '../../../../components/DateInput';
import StatementUpload from '../../../../components/staff/StatementUpload';

const PAGE = 50;
const TABS = [
  { id: 'all', label: 'Tất cả', icon: 'route' },
  { id: 'out', label: 'Tiền ra', icon: 'arrow' },
  { id: 'in', label: 'Tiền vào', icon: 'arrow' },
];

const addDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};
const labelOf = (c) => `${customerCode(c.customer_no)} – ${c.name}`;

function resolveCustomer(text, customers) {
  const t = text.trim();
  if (!t) return null;
  const exact = customers.find((c) => labelOf(c) === t);
  if (exact) return exact;
  const m = t.match(/^(?:kh)?\s*0*(\d+)\s*$/i) || t.match(/^kh\s*0*(\d+)\b/i);
  return m ? customers.find((c) => c.customer_no === Number(m[1])) || null : null;
}

function Assign({ txn, customers, onClose, onSaved }) {
  const current = customers.find((c) => c.id === txn.customer_id) || null;
  const [text, setText] = useState(current ? labelOf(current) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const chosen = resolveCustomer(text, customers);

  async function save(customerId) {
    setBusy(true);
    const { error } = await supabase.from('bank_transactions').update({ customer_id: customerId }).eq('id', txn.id);
    setBusy(false);
    if (error) return setErr('Không lưu được. Vui lòng thử lại.');
    onSaved();
  }

  return (
    <Modal title="Gán khách hàng cho giao dịch" onClose={onClose} width={560}>
      <div className="form">
        <p className="muted" style={{ margin: 0 }}>{txn.description || '(không có nội dung)'}</p>
        <div className="field">
          <label htmlFor="as-cus">Khách hàng (chọn trong danh sách hoặc nhập mã KH)</label>
          <input id="as-cus" list="as-list" value={text} onChange={(e) => setText(e.target.value)} placeholder="VD: KH0003" autoComplete="off" />
          <datalist id="as-list">{customers.map((c) => <option key={c.id} value={labelOf(c)} />)}</datalist>
          {chosen ? <p className="ok-msg" style={{ margin: 0 }}>✓ {labelOf(chosen)}</p> : text.trim() ? <p className="muted small" style={{ margin: 0 }}>Chưa chọn được khách hàng.</p> : null}
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="modal-actions">
          {current && <button type="button" className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={busy} onClick={() => save(null)}>Bỏ khớp</button>}
          <button type="button" className="btn btn-outline" onClick={onClose}>Huỷ</button>
          <button type="button" className="btn btn-primary" disabled={busy || !chosen} onClick={() => save(chosen.id)}>Lưu</button>
        </div>
      </div>
    </Modal>
  );
}

export default function Page() {
  const [bankId, setBankId] = useState(undefined);
  const [bank, setBank] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [totals, setTotals] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('all');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [upload, setUpload] = useState(false);
  const [assign, setAssign] = useState(null);
  const [notice, setNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setBankId(new URLSearchParams(window.location.search).get('id') || null);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    if (!bankId) return;
    supabase.from('bank_accounts').select('*').eq('id', bankId).maybeSingle().then(({ data, error }) => {
      if (error) setErr('Chưa có bảng ngân hàng. Hãy chạy supabase/bank.sql trên Supabase.');
      else if (!data) setErr('Không tìm thấy tài khoản ngân hàng này.');
      else setBank(data);
    });
    supabase.from('customers').select('id, customer_no, name, tax_code').order('customer_no').then(({ data }) => setCustomers(data || []));
  }, [bankId]);

  const customerById = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);

  const fromIso = from ? `${from}T00:00:00+07:00` : null;
  const toIso = to ? `${addDay(to)}T00:00:00+07:00` : null;

  const load = useCallback(async () => {
    if (!bankId) return;
    setLoading(true);
    let query = supabase.from('bank_transactions_v').select('*', { count: 'exact' }).eq('bank_account_id', bankId);
    if (tab !== 'all') query = query.eq('direction', tab);
    if (fromIso) query = query.gte('txn_time', fromIso);
    if (toIso) query = query.lt('txn_time', toIso);
    // Trạng thái theo lệnh Thu: Đã khớp = có lệnh Thu gắn vào dòng sao kê; Chưa khớp chỉ tính tiền vào
    if (status === 'matched') query = query.or('collection_id.not.is.null,expense_id.not.is.null');
    if (status === 'unmatched') query = query.is('collection_id', null).is('expense_id', null);
    if (q) query = query.ilike('description', `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`);
    query = query.order('txn_time', { ascending: false }).order('seq', { ascending: false }).order('id').range(page * PAGE, page * PAGE + PAGE - 1);

    const [r, t, last] = await Promise.all([
      query,
      supabase.rpc('bank_totals', { p_account: bankId, p_from: fromIso, p_to: toIso, p_q: q || null, p_status: status }),
      supabase.from('bank_transactions').select('balance').eq('bank_account_id', bankId).not('balance', 'is', null)
        .order('txn_time', { ascending: false }).order('seq', { ascending: false }).limit(1),
    ]);
    if (r.error) setErr('Không tải được giao dịch. Hãy chạy supabase/bank.sql trên Supabase.');
    else {
      setErr('');
      setRows(r.data || []);
      setCount(r.count || 0);
    }
    setTotals(t.error ? null : t.data?.[0] || null);
    setBalance(last.data?.[0]?.balance ?? null);
    setLoading(false);
  }, [bankId, tab, fromIso, toIso, status, q, page]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const pages = Math.max(1, Math.ceil(count / PAGE));
  const refresh = () => setReloadKey((k) => k + 1);
  const resetPage = (fn) => (e) => { fn(e.target.value); setPage(0); };

  async function rematch() {
    setNotice('');
    const { data, error } = await supabase.from('bank_transactions').select('id, description').eq('bank_account_id', bankId).is('customer_id', null).limit(5000);
    if (error) return setNotice('Không đọc được danh sách giao dịch chưa khớp.');
    const match = buildMatcher(customers);
    const groups = {};
    (data || []).forEach((t) => {
      const cid = match(t.description || '');
      if (cid) (groups[cid] = groups[cid] || []).push(t.id);
    });
    let n = 0;
    for (const [cid, ids] of Object.entries(groups)) {
      for (let i = 0; i < ids.length; i += 200) {
        const r = await supabase.from('bank_transactions').update({ customer_id: cid }).in('id', ids.slice(i, i + 200));
        if (!r.error) n += Math.min(200, ids.length - i);
      }
    }
    setNotice(n ? `Đã khớp thêm ${commas(n)} giao dịch với khách hàng.` : 'Không có giao dịch nào khớp thêm được.');
    refresh();
  }

  if (bankId === null || err === 'Không tìm thấy tài khoản ngân hàng này.') {
    return (
      <div className="card"><p style={{ marginTop: 0 }}>{err || 'Chưa chọn tài khoản ngân hàng.'}</p>
        <Link href="/nhan-vien/ngan-hang/" className="btn btn-primary">← Về danh sách ngân hàng</Link></div>
    );
  }

  return (
    <>
      <div className="bk-head">
        <div>
          <Link href="/nhan-vien/ngan-hang/" className="panel-link" style={{ marginBottom: 4 }}>← Danh sách ngân hàng</Link>
          <h1 style={{ fontSize: '1.7rem', margin: '2px 0 0' }}>{bank ? bank.bank_name : '...'} <span className="bank-acc big">{bank?.account_number}</span></h1>
          <p className="muted" style={{ margin: 0 }}>{bank?.account_name}</p>
        </div>
        <div className="dash-actions">
          {bank && <Link href={`/nhan-vien/ngan-hang/?edit=${bank.id}`} className="btn btn-outline">Sửa tài khoản</Link>}
          <button className="btn btn-outline" onClick={rematch} title="Thử gắn lại khách hàng cho các giao dịch chưa có khách (theo mã KH, MST, tên trong nội dung)">Khớp lại khách hàng</button>
          <button className="btn btn-primary" onClick={() => setUpload(true)} disabled={!bank}>Tải sao kê</button>
        </div>
      </div>

      <div className="kpis" style={{ marginBottom: 16 }}>
        <div className="kpi"><span className="kpi-icon tone-navy"><Icon name="money" size={22} /></span><span className="kpi-text"><span className="kpi-label">Số dư gần nhất</span><span className="kpi-value">{balance === null ? '—' : commas(balance)}</span><span className="kpi-sub">VNĐ</span></span></div>
        <div className="kpi"><span className="kpi-icon tone-ok"><span aria-hidden="true">+</span></span><span className="kpi-text"><span className="kpi-label">Tổng tiền vào</span><span className="kpi-value" style={{ color: 'var(--ok)' }}>{commas(totals?.total_in || 0)}</span><span className="kpi-sub">theo bộ lọc</span></span></div>
        <div className="kpi"><span className="kpi-icon tone-err"><span aria-hidden="true">−</span></span><span className="kpi-text"><span className="kpi-label">Tổng tiền ra</span><span className="kpi-value" style={{ color: 'var(--err)' }}>{commas(totals?.total_out || 0)}</span><span className="kpi-sub">theo bộ lọc</span></span></div>
      </div>

      <div className="toolbar">
        <input aria-label="Tìm theo nội dung" placeholder="Tìm theo nội dung giao dịch..." value={qInput} onChange={(e) => setQInput(e.target.value)} />
        <select aria-label="Trạng thái" value={status} onChange={resetPage(setStatus)}>
          <option value="all">Mọi trạng thái</option>
          <option value="matched">Đã khớp (lệnh Thu / phiếu chi)</option>
          <option value="unmatched">Chưa khớp</option>
        </select>
        <span className="date-filter">Từ <DateInput aria-label="Từ ngày" value={from} onChange={(v) => { setFrom(v); setPage(0); }} /></span>
        <span className="date-filter">Đến <DateInput aria-label="Đến ngày" value={to} onChange={(v) => { setTo(v); setPage(0); }} /></span>
      </div>

      {err && !err.startsWith('Không tìm thấy') && <p className="err" role="alert">{err}</p>}
      {notice && <p className="ok-msg" role="status">{notice}</p>}

      <div className="bk-tabs" role="tablist" aria-label="Loại giao dịch">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => { setTab(t.id); setPage(0); }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th className="c-time">Thời gian giao dịch</th>
              <th className="c-amt">Số tiền giao dịch</th>
              <th className="c-status">Trạng thái</th>
              <th>Nội dung giao dịch</th>
              <th className="c-hash">Hash Code</th>
              <th className="c-bal">Số dư</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const ft = fmtTime(t.txn_time, t.has_time);
              const cus = customerById[t.customer_id];
              const pos = Number(t.amount) > 0;
              return (
                <tr key={t.id}>
                  <td className="c-time"><span className="bk-clock"><Icon name="clock" size={13} /></span>{ft.date} <strong>{ft.time}</strong></td>
                  <td className="c-amt"><span className={pos ? 'amt-in' : 'amt-out'}>{pos ? '+ ' : '- '}{commas(Math.abs(t.amount))}</span> <span className="vnd">VNĐ</span></td>
                  <td className="c-status">
                    {t.collection_id || t.expense_id ? (
                      <>
                        <span
                          className="bk-pill ok"
                          title={t.collection_id
                            ? `Đã khớp lệnh Thu ${collectionCode(t.collection_no)}. Dòng sao kê này không thể khớp lệnh khác.`
                            : `Đã khớp phiếu chi ${expenseCode(t.expense_no)}. Dòng sao kê này không thể khớp phiếu khác.`}
                        >
                          <span aria-hidden="true">●</span> Đã khớp
                        </span>
                        <span className={`bk-ref ${t.expense_id ? 'out' : ''}`}>{t.collection_id ? collectionCode(t.collection_no) : expenseCode(t.expense_no)}</span>
                      </>
                    ) : (
                      <span
                        className="bk-pill bad"
                        title={pos ? 'Chưa có lệnh Thu nào đúng ngân hàng, số tiền và ngày với dòng sao kê này' : 'Chưa có phiếu chi nào đúng ngân hàng, số tiền và ngày với dòng sao kê này'}
                      >
                        <span aria-hidden="true">●</span> Chưa khớp
                      </span>
                    )}
                  </td>
                  <td className="c-desc">
                    {t.description}
                    {cus ? (
                      <button type="button" className="bk-cus bk-cus-btn" onClick={() => setAssign(t)} title="Bấm để đổi khách hàng">{labelOf(cus)}</button>
                    ) : pos ? (
                      <button type="button" className="bk-assign" onClick={() => setAssign(t)}>+ Gán khách hàng</button>
                    ) : null}
                  </td>
                  <td className="c-hash">{t.hash_code}</td>
                  <td className="c-bal">{t.balance === null ? <span className="muted">—</span> : <>{commas(t.balance)}<span className="vnd">VNĐ</span></>}</td>
                </tr>
              );
            })}
            {!loading && !rows.length && <tr><td colSpan={6} className="bk-empty">Chưa có giao dịch nào. Bấm <strong>Tải sao kê</strong> để nhập sao kê ngân hàng.</td></tr>}
            {loading && !rows.length && <tr><td colSpan={6} className="bk-empty">Đang tải...</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="bk-pager">
        <span className="muted small">{commas(count)} giao dịch</span>
        <div>
          <button className="btn btn-outline sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹ Trước</button>
          <span className="small" style={{ margin: '0 12px' }}>Trang {page + 1} / {pages}</span>
          <button className="btn btn-outline sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Sau ›</button>
        </div>
      </div>

      {upload && bank && (
        <StatementUpload
          bank={bank}
          onClose={() => { setUpload(false); setPage(0); refresh(); }}
          onDone={(r) => setNotice(`Đã thêm ${commas(r.inserted)} giao dịch, bỏ qua ${commas(r.duplicates)} giao dịch trùng.`)}
        />
      )}
      {assign && <Assign txn={assign} customers={customers} onClose={() => setAssign(null)} onSaved={() => { setAssign(null); refresh(); }} />}
    </>
  );
}
