'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { DeleteBtn } from '../../../components/staff/RowActions';
import { supabase, commas } from '../../../lib/supabase';
import { BANKS, fmtTime } from '../../../lib/bank';
import Modal from '../../../components/staff/Modal';
import StatementUpload from '../../../components/staff/StatementUpload';
import AllBankTransactions from '../../../components/staff/AllBankTransactions';

const blank = { bank_name: '', account_number: '', account_name: '', note: '' };

export default function Page() {
  const [banks, setBanks] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [b, s] = await Promise.all([
      supabase.from('bank_accounts').select('*').order('bank_name').order('account_number'),
      supabase.rpc('bank_overview'),
    ]);
    if (b.error) setErr('Chưa có bảng ngân hàng. Hãy chạy supabase/bank.sql trên Supabase.');
    else {
      setErr('');
      setBanks(b.data || []);
    }
    if (!s.error) setStats(Object.fromEntries((s.data || []).map((x) => [x.bank_account_id, x])));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e) {
    e.preventDefault();
    setFormErr('');
    const f = {
      bank_name: editing.bank_name.trim(),
      account_number: editing.account_number.replace(/\s+/g, ''),
      account_name: editing.account_name.trim(),
      note: editing.note?.trim() || null,
    };
    if (!f.bank_name) return setFormErr('Vui lòng nhập tên ngân hàng.');
    if (!f.account_name) return setFormErr('Vui lòng nhập tên tài khoản.');
    if (!/^\d{4,25}$/.test(f.account_number)) return setFormErr('Số tài khoản chỉ gồm chữ số (4–25 số).');
    setBusy(true);
    const r = editing.id
      ? await supabase.from('bank_accounts').update(f).eq('id', editing.id)
      : await supabase.from('bank_accounts').insert(f);
    setBusy(false);
    if (r.error) return setFormErr(r.error.code === '23505' ? 'Tài khoản này (cùng ngân hàng và số tài khoản) đã có trong danh sách.' : 'Không lưu được. Vui lòng thử lại.');
    setEditing(null);
    load();
  }

  async function remove(b) {
    const n = stats[b.id]?.txn_count || 0;
    const msg = n
      ? `Xoá tài khoản ${b.bank_name} ${b.account_number} và TOÀN BỘ ${commas(n)} giao dịch của tài khoản này? Không thể hoàn tác.`
      : `Xoá tài khoản ${b.bank_name} ${b.account_number}?`;
    if (!window.confirm(msg)) return;
    const { error } = await supabase.from('bank_accounts').delete().eq('id', b.id);
    if (error) return window.alert('Không xoá được. Vui lòng thử lại.');
    load();
  }

  // Mở sẵn form sửa khi đến từ trang giao dịch của tài khoản: /nhan-vien/ngan-hang/?edit=<id>
  const [editParam, setEditParam] = useState(null);
  useEffect(() => { setEditParam(new URLSearchParams(window.location.search).get('edit')); }, []);
  useEffect(() => {
    if (!editParam || !banks.length) return;
    const b = banks.find((x) => x.id === editParam);
    if (b) { setFormErr(''); setEditing({ ...blank, ...b, note: b.note || '' }); }
    setEditParam(null);
    window.history.replaceState(null, '', '/nhan-vien/ngan-hang/');
  }, [editParam, banks]);

  const set = (k) => (e) => setEditing((s) => ({ ...s, [k]: e.target.value }));

  return (
    <>
      <div className="staff-head">
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Giao dịch ngân hàng</h1>
        <div className="dash-actions">
          <button className="btn btn-outline" onClick={() => setShowAll(true)} disabled={!banks.length}>Tất cả giao dịch</button>
          <button className="btn btn-primary" onClick={() => { setFormErr(''); setEditing({ ...blank }); }}>+ Thêm ngân hàng</button>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>Chọn một tài khoản để xem giao dịch, hoặc bấm <strong>Tải sao kê</strong> để nhập sao kê mới.</p>

      {err && <p className="err" role="alert">{err}</p>}
      {notice && <p className="ok-msg" role="status">{notice}</p>}
      {loading && <p className="muted">Đang tải...</p>}
      {!loading && !err && !banks.length && (
        <div className="card" style={{ textAlign: 'center', padding: 36 }}>
          <p style={{ marginTop: 0 }}>Chưa có ngân hàng nào. Hãy thêm tài khoản ngân hàng đầu tiên của công ty.</p>
          <button className="btn btn-primary" onClick={() => { setFormErr(''); setEditing({ ...blank }); }}>+ Thêm ngân hàng</button>
        </div>
      )}

      <div className="bank-grid">
        {banks.map((b) => {
          const s = stats[b.id];
          const last = s?.last_time ? fmtTime(s.last_time) : null;
          return (
            <article className="bank-card" key={b.id}>
              <Link href={`/nhan-vien/ngan-hang/chi-tiet/?id=${b.id}`} className="bank-main" aria-label={`Xem giao dịch ${b.bank_name} ${b.account_number}`}>
                <span className="bank-logo" aria-hidden="true">{b.bank_name.slice(0, 2).toUpperCase()}</span>
                <span className="bank-info">
                  <strong className="bank-name">{b.bank_name}</strong>
                  <span className="bank-acc">{b.account_number}</span>
                  <span className="muted small bank-holder" title={b.account_name}>{b.account_name}</span>
                </span>
              </Link>
              <dl className="bank-stats">
                <div><dt>Số dư gần nhất</dt><dd className="bal">{s?.last_balance != null ? `${commas(s.last_balance)} VNĐ` : '—'}</dd></div>
                <div><dt>Tiền vào</dt><dd style={{ color: 'var(--ok)' }}>{commas(s?.total_in || 0)}</dd></div>
                <div><dt>Tiền ra</dt><dd style={{ color: 'var(--err)' }}>{commas(s?.total_out || 0)}</dd></div>
                <div><dt>Giao dịch</dt><dd>{commas(s?.txn_count || 0)}</dd></div>
              </dl>
              <p className="muted small bank-last">{last ? `Giao dịch mới nhất: ${last.date} ${last.time}` : 'Chưa có giao dịch nào'}</p>
              <div className="bank-actions">
                <Link href={`/nhan-vien/ngan-hang/chi-tiet/?id=${b.id}`} className="btn btn-outline sm">Xem giao dịch</Link>
                <button className="btn btn-primary sm" onClick={() => setUpload(b)}>Tải sao kê</button>
                <span className="bank-del"><DeleteBtn onClick={() => remove(b)} label={`Xoá tài khoản ${b.bank_name} ${b.account_number}`} /></span>
              </div>
            </article>
          );
        })}
      </div>

      {editing && (
        <Modal title={editing.id ? 'Sửa ngân hàng' : 'Thêm ngân hàng'} onClose={() => setEditing(null)} width={560}>
          <form className="form" onSubmit={save} noValidate>
            <div className="field">
              <label htmlFor="b-bank">Ngân hàng *</label>
              <input id="b-bank" list="b-banks" value={editing.bank_name} onChange={set('bank_name')} placeholder="VD: Vietcombank, Techcombank, MB Bank..." autoComplete="off" />
              <datalist id="b-banks">{BANKS.map((x) => <option key={x} value={x} />)}</datalist>
            </div>
            <div className="field">
              <label htmlFor="b-acc">Số tài khoản *</label>
              <input id="b-acc" inputMode="numeric" value={editing.account_number} onChange={set('account_number')} placeholder="VD: 21021998" autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="b-name">Tên tài khoản *</label>
              <input id="b-name" value={editing.account_name} onChange={set('account_name')} placeholder="VD: CONG TY TNHH THONG NHAT LOGISTIC" autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="b-note">Ghi chú</label>
              <input id="b-note" value={editing.note} onChange={set('note')} />
            </div>
            {formErr && <p className="err" role="alert">{formErr}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>Huỷ</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showAll && <AllBankTransactions banks={banks} onClose={() => setShowAll(false)} />}

      {upload && (
        <StatementUpload
          bank={upload}
          onClose={() => { setUpload(null); load(); }}
          onDone={(r) => setNotice(`Đã thêm ${commas(r.inserted)} giao dịch vào ${upload.bank_name}, bỏ qua ${commas(r.duplicates)} giao dịch trùng.`)}
        />
      )}
    </>
  );
}
