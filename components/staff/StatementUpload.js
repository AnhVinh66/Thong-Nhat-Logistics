'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, displayLogin, commas, vnd } from '../../lib/supabase';
import {
  FIELDS, detectMapping, guessHeaderRow, parseRows, readStatementFile, columnLabels, buildMatcher, norm, fmtTime,
} from '../../lib/bank';
import Modal from './Modal';

const BATCH = 500;

// Áp dụng cách đọc đã lưu của ngân hàng này (theo tên cột trong file) nếu file khớp
function applySaved(rows, saved) {
  const names = saved?.names;
  if (!names || !names.time) return null;
  const want = Object.entries(names).map(([k, v]) => [k, norm(v)]);
  for (let r = 0; r < Math.min(rows.length, 60); r++) {
    const row = (rows[r] || []).map((c) => (c instanceof Date ? '' : norm(c)));
    const cols = {};
    let ok = true;
    for (const [k, v] of want) {
      const i = row.indexOf(v);
      if (i < 0) { ok = false; break; }
      cols[k] = i;
    }
    if (ok) return { headerRow: r, cols };
  }
  return null;
}

export default function StatementUpload({ bank, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState(null);
  const [mapping, setMapping] = useState(null); // { headerRow, cols }
  const [autoNote, setAutoNote] = useState('');
  const [showMap, setShowMap] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);
  const [customers, setCustomers] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    supabase.from('customers').select('id, customer_no, name, tax_code').then(({ data }) => setCustomers(data || []));
  }, []);

  async function onFile(f) {
    setErr('');
    setResult(null);
    setRows(null);
    setMapping(null);
    if (!f) return;
    setFile(f);
    try {
      const data = await readStatementFile(f);
      if (!data.length) throw new Error('File không có dữ liệu.');
      setRows(data);
      const saved = applySaved(data, bank.statement_mapping);
      if (saved) {
        setMapping(saved);
        setAutoNote('Đã dùng cách đọc file đã lưu của ngân hàng này.');
        setShowMap(false);
        return;
      }
      const det = detectMapping(data);
      if (det) {
        setMapping(det);
        setAutoNote('Hệ thống tự nhận dạng các cột. Hãy kiểm tra bảng xem trước bên dưới.');
        setShowMap(false);
      } else {
        setMapping({ headerRow: guessHeaderRow(data), cols: {} });
        setAutoNote('Chưa nhận dạng được các cột. Hãy chọn cột tương ứng ở mục "Cách đọc file" bên dưới.');
        setShowMap(true);
      }
    } catch (e) {
      setErr(e.message || 'Không đọc được file.');
    }
  }

  const labels = useMemo(() => (rows && mapping ? columnLabels(rows, mapping.headerRow) : []), [rows, mapping]);
  const mappingOk = mapping && mapping.cols.time !== undefined &&
    (mapping.cols.credit !== undefined || mapping.cols.debit !== undefined || mapping.cols.amount !== undefined);
  const parsed = useMemo(() => (rows && mappingOk ? parseRows(rows, mapping) : null), [rows, mapping, mappingOk]);

  const stats = useMemo(() => {
    if (!parsed || !parsed.txns.length) return null;
    const days = parsed.txns.map((t) => t.day).sort();
    return {
      from: days[0], to: days[days.length - 1],
      inSum: parsed.txns.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0),
      outSum: -parsed.txns.filter((t) => t.amount < 0).reduce((a, t) => a + t.amount, 0),
      inN: parsed.txns.filter((t) => t.amount > 0).length,
      outN: parsed.txns.filter((t) => t.amount < 0).length,
    };
  }, [parsed]);

  const setCol = (key, val) => setMapping((m) => {
    const cols = { ...m.cols };
    if (val === '') delete cols[key];
    else cols[key] = Number(val);
    return { ...m, cols };
  });
  const dmy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');

  async function doImport() {
    if (!parsed?.txns.length) return;
    setBusy(true);
    setErr('');
    try {
      const { data: u } = await supabase.auth.getUser();
      const by = displayLogin(u?.user?.email);
      const matcher = buildMatcher(customers);
      const payload = parsed.txns.map((t) => ({
        bank_account_id: bank.id,
        txn_time: t.time,
        has_time: t.hasTime,
        seq: t.seq,
        amount: t.amount,
        balance: t.balance,
        description: t.description || null,
        customer_id: matcher(t.description),
        uploaded_by_name: by,
        source_file: file.name,
      }));
      let inserted = 0;
      let matched = 0;
      for (let i = 0; i < payload.length; i += BATCH) {
        setProgress(`Đang lưu ${Math.min(i + BATCH, payload.length)}/${payload.length} giao dịch...`);
        // Trùng (cùng tài khoản, cùng ngày giờ phút giây, cùng số tiền) sẽ bị bỏ qua, không báo lỗi
        const r = await supabase
          .from('bank_transactions')
          .upsert(payload.slice(i, i + BATCH), { onConflict: 'bank_account_id,txn_time,amount,seq', ignoreDuplicates: true })
          .select('id, customer_id');
        if (r.error) throw r.error;
        inserted += r.data.length;
        matched += r.data.filter((x) => x.customer_id).length;
      }
      // Nhớ cách đọc file của ngân hàng này cho lần tải sau
      const header = rows[mapping.headerRow] || [];
      const names = {};
      Object.entries(mapping.cols).forEach(([k, idx]) => {
        const h = header[idx];
        if (typeof h === 'string' && h.trim()) names[k] = h.trim();
      });
      if (names.time) await supabase.from('bank_accounts').update({ statement_mapping: { names } }).eq('id', bank.id);

      const res = { inserted, duplicates: payload.length - inserted, invalid: parsed.invalid, matched };
      setResult(res);
      onDone?.(res);
    } catch (e) {
      setErr(
        e?.code === '42P01' || e?.code === 'PGRST205'
          ? 'Chưa có bảng giao dịch ngân hàng. Hãy chạy supabase/bank.sql trên Supabase.'
          : `Không lưu được sao kê${e?.message ? `: ${e.message}` : ''}. Những giao dịch đã lưu ở các lô trước vẫn được giữ; tải lại cùng file sẽ không bị trùng.`
      );
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  if (result) {
    return (
      <Modal title="Đã tải lên sao kê" onClose={onClose} width={560}>
        <div className="notice notice-ok" role="status">
          <p style={{ margin: 0, fontSize: '1.05rem' }}><strong>{commas(result.inserted)}</strong> giao dịch mới đã được thêm vào <strong>{bank.bank_name}</strong>.</p>
          <ul className="up-result">
            <li>Bỏ qua <strong>{commas(result.duplicates)}</strong> giao dịch đã có từ trước (trùng ngày giờ và số tiền).</li>
            <li><strong>{commas(result.matched)}</strong> giao dịch mới tự khớp được với khách hàng.</li>
            {result.invalid > 0 && <li className="sum-warn"><strong>{result.invalid}</strong> dòng không đọc được ngày giờ nên bị bỏ qua.</li>}
          </ul>
        </div>
        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={onClose}>Xong</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Tải sao kê – ${bank.bank_name} · ${bank.account_number}`} onClose={onClose} width={900}>
      <div className="form">
        <div className="up-drop">
          <input ref={inputRef} type="file" accept=".xlsx,.csv,.txt" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()}>
            {file ? 'Chọn file khác' : 'Chọn file sao kê (.xlsx hoặc .csv)'}
          </button>
          <span className="muted small">{file ? file.name : 'Tải file sao kê xuất từ internet banking, có thể tải lại cùng khoảng thời gian, giao dịch trùng sẽ tự bỏ qua.'}</span>
        </div>

        {err && <p className="err" role="alert">{err}</p>}
        {rows && autoNote && <p className="muted small" style={{ margin: 0 }}>{autoNote}</p>}

        {rows && mapping && (
          <div className="up-map">
            <button type="button" className="up-map-toggle" onClick={() => setShowMap((s) => !s)} aria-expanded={showMap}>
              {showMap ? '▾' : '▸'} Cách đọc file (cột nào là ngày giờ, số tiền...)
              {!mappingOk && <span className="pill pill-warn" style={{ marginLeft: 8 }}>Cần chọn cột</span>}
            </button>
            {showMap && (
              <div className="up-map-body">
                <div className="field" style={{ maxWidth: 260 }}>
                  <label htmlFor="m-header">Dòng tiêu đề của bảng (số dòng trong file)</label>
                  <input id="m-header" type="number" min="1" value={mapping.headerRow + 1}
                    onChange={(e) => setMapping((m) => ({ ...m, headerRow: Math.max(0, Number(e.target.value || 1) - 1) }))} />
                </div>
                <div className="grid-2">
                  {FIELDS.map((f) => (
                    <div className="field" key={f.key}>
                      <label htmlFor={`m-${f.key}`}>{f.label}{f.required ? ' *' : ''}</label>
                      <select id={`m-${f.key}`} value={mapping.cols[f.key] ?? ''} onChange={(e) => setCol(f.key, e.target.value)}>
                        <option value="">— Không dùng —</option>
                        {labels.map((l, i) => <option key={i} value={i}>{l}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <p className="muted small" style={{ margin: 0 }}>
                  Cần chọn <strong>Ngày giờ</strong> và một trong hai cách: cột <strong>Tiền vào + Tiền ra</strong>, hoặc một cột <strong>Số tiền có dấu + / −</strong>.
                </p>
              </div>
            )}
          </div>
        )}

        {parsed && parsed.noDirection && (
          <p className="err" role="alert">
            Cột số tiền không có dấu + / − nên không phân biệt được tiền vào và tiền ra. Hãy mở "Cách đọc file" và chọn cột Tiền vào / Tiền ra riêng.
          </p>
        )}

        {parsed && !parsed.noDirection && (
          <section className="up-preview">
            <div className="up-stats">
              <div><span>Đọc được</span><strong>{commas(parsed.txns.length)} giao dịch</strong></div>
              {stats && <div><span>Từ ngày – đến ngày</span><strong>{dmy(stats.from)} – {dmy(stats.to)}</strong></div>}
              {stats && <div><span>Tiền vào</span><strong style={{ color: 'var(--ok)' }}>+ {vnd(stats.inSum)}</strong><small>{stats.inN} giao dịch</small></div>}
              {stats && <div><span>Tiền ra</span><strong style={{ color: 'var(--err)' }}>− {vnd(stats.outSum)}</strong><small>{stats.outN} giao dịch</small></div>}
            </div>
            {parsed.invalid > 0 && <p className="sum-warn small" style={{ margin: '8px 0 0' }}>{parsed.invalid} dòng có số tiền nhưng không đọc được ngày giờ sẽ bị bỏ qua.</p>}
            {!parsed.hasAnyTime && parsed.txns.length > 0 && (
              <p className="muted small" style={{ margin: '8px 0 0' }}>
                File này chỉ có ngày, không có giờ phút giây. Các giao dịch cùng ngày và cùng số tiền được đánh số thứ tự để không bị coi là trùng nhau.
              </p>
            )}
            {parsed.txns.length === 0 && <p className="err" style={{ margin: '8px 0 0' }}>Không đọc được giao dịch nào. Hãy kiểm tra "Cách đọc file".</p>}
            {parsed.txns.length > 0 && (
              <div className="alloc-scroll" style={{ marginTop: 10, maxHeight: 230 }}>
                <table className="alloc-table">
                  <thead><tr><th>Thời gian</th><th className="num">Số tiền</th><th className="num">Số dư</th><th>Nội dung</th></tr></thead>
                  <tbody>
                    {parsed.txns.slice(0, 8).map((t, i) => {
                      const ft = fmtTime(t.time, t.hasTime);
                      return (
                        <tr key={i}>
                          <td className="nowrap">{ft.date} {ft.time}</td>
                          <td className="num"><strong style={{ color: t.amount > 0 ? 'var(--ok)' : 'var(--err)' }}>{t.amount > 0 ? '+ ' : '− '}{commas(Math.abs(t.amount))}</strong></td>
                          <td className="num">{t.balance === null ? '—' : commas(t.balance)}</td>
                          <td className="route">{t.description}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {parsed.txns.length > 8 && <p className="muted small" style={{ margin: '6px 0 0' }}>Hiện 8 / {commas(parsed.txns.length)} giao dịch.</p>}
          </section>
        )}

        <div className="modal-actions">
          {progress && <span className="muted small" style={{ marginRight: 'auto' }}>{progress}</span>}
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Huỷ</button>
          <button type="button" className="btn btn-primary" onClick={doImport} disabled={busy || !parsed || parsed.noDirection || !parsed.txns.length}>
            {busy ? 'Đang lưu...' : parsed?.txns.length ? `Nhập ${commas(parsed.txns.length)} giao dịch` : 'Nhập sao kê'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
