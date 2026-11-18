'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, commas, customerCode, collectionCode, expenseCode } from '../../lib/supabase';
import { fmtTime } from '../../lib/bank';
import Modal from './Modal';
import DateInput from '../DateInput';

const PAGE = 50;
const TABS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'out', label: 'Tiền ra' },
  { id: 'in', label: 'Tiền vào' },
];

const addDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};

// Cửa sổ xem TẤT CẢ giao dịch của mọi ngân hàng (chỉ xem; gán khách hàng / tải sao kê làm ở trang từng ngân hàng)
export default function AllBankTransactions({ banks, onClose }) {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [totals, setTotals] = useState(null);
  const [customers, setCustomers] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [bankId, setBankId] = useState('');
  const [tab, setTab] = useState('all');
  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);

  const bankById = useMemo(() => Object.fromEntries(banks.map((b) => [b.id, b])), [banks]);

  useEffect(() => {
    supabase.from('customers').select('id, customer_no, name').then(({ data }) => setCustomers(Object.fromEntries((data || []).map((c) => [c.id, c]))));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const fromIso = from ? `${from}T00:00:00+07:00` : null;
  const toIso = to ? `${addDay(to)}T00:00:00+07:00` : null;

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('bank_transactions_v').select('*', { count: 'exact' });
    if (bankId) query = query.eq('bank_account_id', bankId);
    if (tab !== 'all') query = query.eq('direction', tab);
    if (fromIso) query = query.gte('txn_time', fromIso);
    if (toIso) query = query.lt('txn_time', toIso);
    if (status === 'matched') query = query.or('collection_id.not.is.null,expense_id.not.is.null');
    if (status === 'unmatched') query = query.is('collection_id', null).is('expense_id', null);
    if (q) query = query.ilike('description', `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`);
    query = query.order('txn_time', { ascending: false }).order('seq', { ascending: false }).order('id').range(page * PAGE, page * PAGE + PAGE - 1);

    const [r, t] = await Promise.all([
      query,
      supabase.rpc('bank_totals', { p_account: bankId || null, p_from: fromIso, p_to: toIso, p_q: q || null, p_status: status }),
    ]);
    if (r.error) setErr('Không tải được giao dịch. Hãy chạy supabase/bank.sql trên Supabase.');
    else {
      setErr('');
      setRows(r.data || []);
      setCount(r.count || 0);
    }
    // Tổng tiền cho "mọi ngân hàng" cần bản cập nhật supabase/bank-all.sql; chưa chạy thì bỏ qua phần tổng
    setTotals(t.error ? null : t.data?.[0] || null);
    setLoading(false);
  }, [bankId, tab, fromIso, toIso, status, q, page]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(count / PAGE));
  const reset = (fn) => (e) => { fn(e.target.value); setPage(0); };
  const allTotalsOk = bankId || totals; // tổng có sẵn

  return (
    <Modal title="Tất cả giao dịch ngân hàng" onClose={onClose} width={1280}>
      <div className="bk-all">
        <div className="kpis" style={{ marginBottom: 12, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <div className="kpi"><span className="kpi-text"><span className="kpi-label">Số giao dịch</span><span className="kpi-value">{commas(count)}</span><span className="kpi-sub">{bankId ? `${bankById[bankId]?.bank_name} ${bankById[bankId]?.account_number}` : `${banks.length} tài khoản`}</span></span></div>
          <div className="kpi"><span className="kpi-text"><span className="kpi-label">Tổng tiền vào</span><span className="kpi-value" style={{ color: 'var(--ok)' }}>{allTotalsOk && totals ? commas(totals.total_in) : '—'}</span><span className="kpi-sub">theo bộ lọc · VNĐ</span></span></div>
          <div className="kpi"><span className="kpi-text"><span className="kpi-label">Tổng tiền ra</span><span className="kpi-value" style={{ color: 'var(--err)' }}>{allTotalsOk && totals ? commas(totals.total_out) : '—'}</span><span className="kpi-sub">theo bộ lọc · VNĐ</span></span></div>
        </div>

        <div className="toolbar">
          <input aria-label="Tìm theo nội dung" placeholder="Tìm theo nội dung giao dịch..." value={qInput} onChange={(e) => setQInput(e.target.value)} />
          <select aria-label="Ngân hàng" value={bankId} onChange={reset(setBankId)}>
            <option value="">Tất cả ngân hàng</option>
            {banks.map((b) => <option key={b.id} value={b.id}>{b.bank_name} – {b.account_number}</option>)}
          </select>
          <select aria-label="Trạng thái" value={status} onChange={reset(setStatus)}>
            <option value="all">Mọi trạng thái</option>
            <option value="matched">Đã khớp</option>
            <option value="unmatched">Chưa khớp</option>
          </select>
          <span className="date-filter">Từ <DateInput aria-label="Từ ngày" value={from} onChange={(v) => { setFrom(v); setPage(0); }} /></span>
          <span className="date-filter">Đến <DateInput aria-label="Đến ngày" value={to} onChange={(v) => { setTo(v); setPage(0); }} /></span>
        </div>

        <div className="bk-tabs" role="tablist" aria-label="Loại giao dịch">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => { setTab(t.id); setPage(0); }}>{t.label}</button>
          ))}
        </div>

        {err && <p className="err" role="alert">{err}</p>}
        <div className="bk-table-wrap bk-all-scroll">
          <table className="bk-table">
            <thead>
              <tr>
                <th className="c-time">Thời gian giao dịch</th>
                <th className="c-bank">Ngân hàng</th>
                <th className="c-amt">Số tiền giao dịch</th>
                <th className="c-status">Trạng thái</th>
                <th>Nội dung giao dịch</th>
                <th className="c-bal">Số dư</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const ft = fmtTime(t.txn_time, t.has_time);
                const b = bankById[t.bank_account_id];
                const cus = customers[t.customer_id];
                const pos = Number(t.amount) > 0;
                return (
                  <tr key={t.id}>
                    <td className="c-time">{ft.date} <strong>{ft.time}</strong></td>
                    <td className="c-bank">
                      <Link href={`/nhan-vien/ngan-hang/chi-tiet/?id=${t.bank_account_id}`} onClick={onClose} title="Mở trang giao dịch của tài khoản này">
                        <strong>{b?.bank_name || '—'}</strong>
                      </Link>
                      <div className="muted small">{b?.account_number}</div>
                    </td>
                    <td className="c-amt"><span className={pos ? 'amt-in' : 'amt-out'}>{pos ? '+ ' : '- '}{commas(Math.abs(t.amount))}</span> <span className="vnd">VNĐ</span></td>
                    <td className="c-status">
                      {t.collection_id || t.expense_id ? (
                        <>
                          <span className="bk-pill ok"><span aria-hidden="true">●</span> Đã khớp</span>
                          <span className={`bk-ref ${t.expense_id ? 'out' : ''}`}>{t.collection_id ? collectionCode(t.collection_no) : expenseCode(t.expense_no)}</span>
                        </>
                      ) : (
                        <span className="bk-pill bad"><span aria-hidden="true">●</span> Chưa khớp</span>
                      )}
                    </td>
                    <td className="c-desc">
                      {t.description}
                      {cus && <span className="bk-cus">{customerCode(cus.customer_no)} – {cus.name}</span>}
                    </td>
                    <td className="c-bal">{t.balance === null ? <span className="muted">—</span> : <>{commas(t.balance)}<span className="vnd">VNĐ</span></>}</td>
                  </tr>
                );
              })}
              {!loading && !rows.length && <tr><td colSpan={6} className="bk-empty">Không có giao dịch nào.</td></tr>}
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
        <div className="modal-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </Modal>
  );
}
