'use client';

import { useMemo, useState } from 'react';
import { supabase, vnd, displayLogin } from '../../lib/supabase';
import { parseDateTime, readStatementFile } from '../../lib/bank';
import Modal from './Modal';
import DropZone from './DropZone';

// Import tiền lãi ngân hàng của một xe từ file Excel / CSV "Lịch trả nợ" (bảng trả nợ) của ngân hàng.
// Chỉ lấy cột tiền lãi (không lấy tiền gốc), cộng theo tháng của ngày trả, rồi ghi vào vehicle_loan_interest.

const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
const colName = (i) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(64 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`);

// Số tiền: số trong Excel, hoặc chuỗi "1.234.567", "1,234,567", "1.234.567,50"
export function parseAmount(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
  const s = String(v ?? '').replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s) || s.startsWith('-')) return 0;
  const sep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  if (sep >= 0 && s.length - sep - 1 !== 3) {
    return Math.round(Number(`${s.slice(0, sep).replace(/[.,]/g, '')}.${s.slice(sep + 1)}`)) || 0;
  }
  return Number(s.replace(/[.,]/g, '')) || 0;
}

const isInterest = (h) => /\blai\b/.test(h) && !/suat|goc|tong|\+/.test(h);
const isDate = (h) => /ngay|han tra|thoi gian|ky tra|thang/.test(h) && !/so ngay/.test(h);

// Đoán dòng tiêu đề và hai cột cần lấy
function guess(rows) {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const h = (rows[r] || []).map(norm);
    const lai = h.findIndex(isInterest);
    const day = h.findIndex(isDate);
    if (lai >= 0 && day >= 0) {
      const exact = h.findIndex((x) => /^(so )?tien lai|^lai( phai tra| tra)?$/.test(x));
      return { header: r, dateCol: day, intCol: exact >= 0 ? exact : lai };
    }
  }
  return { header: 0, dateCol: 0, intCol: 1 };
}

export default function LoanImport({ vehicles, onClose, onDone }) {
  const [car, setCar] = useState('');
  const [file, setFile] = useState('');
  const [rows, setRows] = useState(null);
  const [header, setHeader] = useState(0);
  const [dateCol, setDateCol] = useState(0);
  const [intCol, setIntCol] = useState(1);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function pick(files) {
    const f = files[0];
    if (!f) return;
    setErr('');
    try {
      const data = await readStatementFile(f);
      if (!data?.length) throw new Error('File không có dữ liệu.');
      const g = guess(data);
      setRows(data);
      setFile(f.name);
      setHeader(g.header);
      setDateCol(g.dateCol);
      setIntCol(g.intCol);
    } catch (e) {
      setRows(null);
      setErr(e.message || 'Không đọc được file.');
    }
  }

  const width = rows ? Math.max(...rows.slice(header, header + 30).map((r) => (r || []).length), 1) : 0;
  const cols = Array.from({ length: width }, (_, i) => {
    const h = String(rows?.[header]?.[i] ?? '').trim();
    return { i, label: h ? `${colName(i)} · ${h}` : `Cột ${colName(i)}` };
  });

  // Cộng tiền lãi theo tháng của ngày trả
  const months = useMemo(() => {
    if (!rows) return [];
    const by = new Map();
    rows.slice(header + 1).forEach((r) => {
      const day = parseDateTime(r?.[dateCol])?.day;
      const amt = parseAmount(r?.[intCol]);
      if (!day || !amt) return;
      const ym = day.slice(0, 7);
      by.set(ym, (by.get(ym) || 0) + amt);
    });
    return [...by].sort(([a], [b]) => a.localeCompare(b)).map(([ym, amount]) => ({ ym, amount }));
  }, [rows, header, dateCol, intCol]);
  const total = months.reduce((a, m) => a + m.amount, 0);
  const plate = vehicles.find((v) => v.id === car)?.plate;
  const mmYY = (ym) => `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;

  async function apply() {
    if (!car) return setErr('Vui lòng chọn xe.');
    if (!months.length) return setErr('Không tìm thấy dòng nào có ngày trả và tiền lãi. Hãy chọn lại cột.');
    if (!window.confirm(`Ghi ${months.length} tháng tiền lãi (từ ${mmYY(months[0].ym)} đến ${mmYY(months[months.length - 1].ym)}, tổng ${vnd(total)}) cho xe ${plate}? Tháng nào đã có số sẽ bị thay bằng số trong file.`)) return;
    setBusy(true);
    setErr('');
    const { data: u } = await supabase.auth.getUser();
    const by = displayLogin(u?.user?.email);
    const stamp = new Date().toISOString();
    const list = months.map((m) => ({ vehicle_id: car, year: Number(m.ym.slice(0, 4)), month: Number(m.ym.slice(5, 7)), amount: m.amount, updated_at: stamp, updated_by_name: by }));
    let error = null;
    for (let i = 0; i < list.length && !error; i += 200) {
      ({ error } = await supabase.from('vehicle_loan_interest').upsert(list.slice(i, i + 200), { onConflict: 'vehicle_id,year,month' }));
    }
    setBusy(false);
    if (error) return setErr(error.code === '42501' ? 'Chỉ Admin và Kế toán được nhập lãi ngân hàng.' : 'Không lưu được. Vui lòng thử lại.');
    onDone(`Đã import ${months.length} tháng tiền lãi cho xe ${plate} (${mmYY(months[0].ym)} – ${mmYY(months[months.length - 1].ym)}).`);
  }

  return (
    <Modal title="Import lịch trả nợ ngân hàng" onClose={onClose} width={760}>
      <div className="form">
        <div className="field">
          <label htmlFor="li-car">Xe của khoản vay *</label>
          <select id="li-car" value={car} onChange={(e) => setCar(e.target.value)}>
            <option value="">Chọn xe...</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}
          </select>
        </div>
        <DropZone id="li-file" wide multiple={false} accept=".xlsx,.csv" onFiles={pick} label={file ? `Đã chọn: ${file}` : 'Chọn file lịch trả nợ'} hint="file .xlsx hoặc .csv, hoặc kéo thả vào đây" />

        {rows && (
          <>
            <div className="grid-3" style={{ gap: 12 }}>
              <div className="field">
                <label htmlFor="li-head">Dòng tiêu đề</label>
                <select id="li-head" value={header} onChange={(e) => setHeader(Number(e.target.value))}>
                  {rows.slice(0, 40).map((r, i) => (
                    <option key={i} value={i}>Dòng {i + 1}: {(r || []).filter((x) => x !== null && x !== '').slice(0, 3).join(' | ').slice(0, 40)}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="li-date">Cột ngày trả</label>
                <select id="li-date" value={dateCol} onChange={(e) => setDateCol(Number(e.target.value))}>
                  {cols.map((c) => <option key={c.i} value={c.i}>{c.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="li-int">Cột tiền lãi</label>
                <select id="li-int" value={intCol} onChange={(e) => setIntCol(Number(e.target.value))}>
                  {cols.map((c) => <option key={c.i} value={c.i}>{c.label}</option>)}
                </select>
              </div>
            </div>

            {months.length ? (
              <>
                <p className="small" style={{ margin: 0 }}>
                  Đọc được <strong>{months.length} tháng</strong>, từ {mmYY(months[0].ym)} đến {mmYY(months[months.length - 1].ym)}, tổng tiền lãi <strong>{vnd(total)}</strong>.
                </p>
                <div className="table-wrap li-preview">
                  <table className="staff-table">
                    <thead><tr><th>Tháng</th><th className="num">Tiền lãi</th></tr></thead>
                    <tbody>
                      {months.map((m) => <tr key={m.ym}><td>Tháng {mmYY(m.ym)}</td><td className="num">{vnd(m.amount)}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="err">Không tìm thấy dòng nào có ngày trả và tiền lãi với các cột đang chọn. Hãy chọn lại dòng tiêu đề hoặc cột.</p>
            )}
          </>
        )}

        <p className="muted small" style={{ margin: 0 }}>
          Chỉ lấy cột tiền lãi, không lấy tiền gốc (tiền gốc đã nằm trong giá trị xe và được tính qua khấu hao). Các kỳ trả trong cùng một tháng được cộng lại.
        </p>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>Huỷ</button>
          <button type="button" className="btn btn-primary" disabled={busy || !rows || !months.length || !car} onClick={apply}>
            {busy ? 'Đang lưu...' : 'Ghi vào bảng lãi'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
