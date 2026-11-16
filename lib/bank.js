// Bộ đọc sao kê ngân hàng: nhận dạng cột, đọc ngày giờ / số tiền, chống trùng, khớp khách hàng.
// Hàm ở đây thuần tuý (không gọi Supabase) để dễ kiểm tra.

export const FIELDS = [
  { key: 'time', label: 'Ngày giờ giao dịch', required: true },
  { key: 'timeOnly', label: 'Giờ giao dịch (nếu tách cột riêng)' },
  { key: 'credit', label: 'Tiền vào (ghi có)' },
  { key: 'debit', label: 'Tiền ra (ghi nợ)' },
  { key: 'amount', label: 'Số tiền (có dấu + / −)' },
  { key: 'balance', label: 'Số dư' },
  { key: 'desc', label: 'Nội dung giao dịch' },
];

// Bỏ dấu tiếng Việt, chữ thường, gọn khoảng trắng
export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// Từ khoá tiêu đề cột (đã bỏ dấu). Vị trí càng đầu = càng ưu tiên.
const KEYS = {
  debit: ['so tien ghi no', 'ghi no', 'so tien no', 'rut ra', 'tien ra', 'debit', 'so tien chi', 'withdrawal', 'rut tien', 'chi ra'],
  credit: ['so tien ghi co', 'ghi co', 'so tien co', 'tien vao', 'credit', 'so tien thu', 'deposit', 'nop vao', 'thu vao'],
  balance: ['so du', 'balance'],
  desc: ['noi dung giao dich', 'noi dung', 'dien giai', 'mo ta', 'description', 'narrative', 'chi tiet giao dich', 'chi tiet'],
  amount: ['so tien giao dich', 'so tien gd', 'amount', 'so tien', 'gia tri'],
  timeOnly: ['gio giao dich', 'gio gd', 'time', 'gio'],
  time: ['ngay giao dich', 'ngay gio giao dich', 'ngay gio', 'thoi gian giao dich', 'thoi gian', 'ngay hach toan', 'ngay gd', 'tran date', 'transaction date', 'date', 'ngay'],
};
const PRIORITY = ['debit', 'credit', 'balance', 'desc', 'amount', 'timeOnly', 'time'];

function rank(header, cat) {
  const h = norm(header);
  if (!h) return -1;
  const list = KEYS[cat];
  for (let i = 0; i < list.length; i++) {
    const k = list[i];
    if (cat === 'timeOnly' || cat === 'time') {
      // tránh "ngày hiệu lực", "giờ" lẫn trong từ khác: khớp nguyên cụm hoặc bắt đầu bằng cụm
      if (h === k || h.startsWith(k + ' ')) return i;
    } else if (h.includes(k)) return i;
  }
  return -1;
}

// Nhận dạng dòng tiêu đề và cột. Trả về { headerRow, cols: {time, ...}, headers } hoặc null nếu không đủ.
export function detectMapping(rows) {
  const limit = Math.min(rows.length, 60);
  let best = null;
  for (let r = 0; r < limit; r++) {
    const row = rows[r] || [];
    const taken = new Set();
    const cols = {};
    for (const cat of PRIORITY) {
      let bestCol = -1;
      let bestRank = 1e9;
      row.forEach((cell, c) => {
        if (taken.has(c)) return;
        const rk = rank(cell, cat);
        if (rk >= 0 && rk < bestRank) {
          bestRank = rk;
          bestCol = c;
        }
      });
      if (bestCol >= 0) {
        cols[cat] = bestCol;
        taken.add(bestCol);
      }
    }
    const ok = cols.time !== undefined && ((cols.credit !== undefined && cols.debit !== undefined) || cols.amount !== undefined || cols.credit !== undefined || cols.debit !== undefined);
    if (ok) {
      const found = Object.keys(cols).length;
      if (!best || found > best.found) best = { headerRow: r, cols, found };
      if (found >= 5) break;
    }
  }
  if (!best) return null;
  return { headerRow: best.headerRow, cols: best.cols };
}

// Gợi ý dòng tiêu đề khi không nhận dạng được: dòng đầu tiên có ≥ 3 ô chữ
export function guessHeaderRow(rows) {
  for (let r = 0; r < Math.min(rows.length, 60); r++) {
    const texts = (rows[r] || []).filter((c) => typeof c === 'string' && c.trim());
    if (texts.length >= 3) return r;
  }
  return 0;
}

const pad2 = (n) => String(n).padStart(2, '0');

function build(y, mo, d, h, mi, s, hasTime) {
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100)) return null;
  if (h > 23 || mi > 59 || s > 59) return null;
  // Sao kê là giờ Việt Nam (UTC+7)
  return { iso: `${y}-${pad2(mo)}-${pad2(d)}T${pad2(h)}:${pad2(mi)}:${pad2(s)}+07:00`, hasTime, day: `${y}-${pad2(mo)}-${pad2(d)}` };
}

// Đọc ô ngày/giờ: Date (từ Excel), số serial Excel, hoặc chuỗi "16/11/2026 16:43:12", "2026-11-16 16:43", ...
export function parseDateTime(v, timeCell) {
  let y, mo, d, h = 0, mi = 0, s = 0, hasTime = false;

  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // read-excel-file trả Date với giờ "treo tường" nằm ở các trường UTC
    y = v.getUTCFullYear(); mo = v.getUTCMonth() + 1; d = v.getUTCDate();
    h = v.getUTCHours(); mi = v.getUTCMinutes(); s = v.getUTCSeconds();
    hasTime = h + mi + s > 0;
  } else if (typeof v === 'number' && v > 20000 && v < 80000) {
    const ms = Math.round((v - 25569) * 86400) * 1000;
    const dt = new Date(ms);
    y = dt.getUTCFullYear(); mo = dt.getUTCMonth() + 1; d = dt.getUTCDate();
    h = dt.getUTCHours(); mi = dt.getUTCMinutes(); s = dt.getUTCSeconds();
    hasTime = h + mi + s > 0;
  } else if (typeof v === 'string' && v.trim()) {
    const str = v.trim();
    const dm = str.match(/(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})/);
    if (!dm) return null;
    const a = dm[1], b = dm[2], c = dm[3];
    if (a.length === 4) { y = +a; mo = +b; d = +c; } // yyyy-mm-dd
    else { d = +a; mo = +b; y = c.length === 2 ? 2000 + +c : +c; } // dd/mm/yyyy (Việt Nam)
    const tm = str.replace(dm[0], ' ').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (tm) { h = +tm[1]; mi = +tm[2]; s = tm[3] ? +tm[3] : 0; hasTime = true; }
  } else return null;

  // Cột giờ riêng
  if (timeCell !== undefined && timeCell !== null && timeCell !== '') {
    let th, tmi, ts;
    if (timeCell instanceof Date) { th = timeCell.getUTCHours(); tmi = timeCell.getUTCMinutes(); ts = timeCell.getUTCSeconds(); }
    else if (typeof timeCell === 'number') {
      const secs = Math.round((timeCell % 1) * 86400);
      th = Math.floor(secs / 3600); tmi = Math.floor((secs % 3600) / 60); ts = secs % 60;
    } else {
      const m = String(timeCell).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (m) { th = +m[1]; tmi = +m[2]; ts = m[3] ? +m[3] : 0; }
    }
    if (th !== undefined) { h = th; mi = tmi; s = ts; hasTime = true; }
  }
  return build(y, mo, d, h, mi, s, hasTime);
}

// Đọc số tiền: "83,645,000", "83.645.000", "83,645,000.00", "(1,000)", "-1.000.000", "+500000 VND"
export function parseMoney(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  let s = String(v).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/^[−–-]/.test(s)) { neg = true; s = s.slice(1); }
  else if (/[−–-]\s*$/.test(s)) { neg = true; }
  s = s.replace(/[^\d.,]/g, '');
  if (!s || !/\d/.test(s)) return null;
  const lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  let intPart = s;
  let frac = '';
  if (lastSep >= 0) {
    const after = s.length - lastSep - 1;
    const other = s.slice(0, lastSep).search(/[.,]/) >= 0;
    // 1–2 chữ số sau dấu cuối = phần thập phân; 3 chữ số = dấu phân cách hàng nghìn
    if (after >= 1 && after <= 2 && (other || after !== 3)) { intPart = s.slice(0, lastSep); frac = s.slice(lastSep + 1); }
  }
  const n = Number(intPart.replace(/[.,]/g, '') + (frac ? '.' + frac : ''));
  if (!Number.isFinite(n)) return null;
  const val = Math.round(n);
  return neg ? -val : val;
}

const hasSign = (v) => typeof v === 'string' && /^[+−–-]/.test(v.trim());
const cellText = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return '';
  return String(v).replace(/\s+/g, ' ').trim();
};

// Biến các dòng của file thành giao dịch theo cách ánh xạ cột.
// mapping = { headerRow, cols: { time, timeOnly?, credit?, debit?, amount?, balance?, desc? } }
export function parseRows(rows, mapping) {
  const { headerRow, cols } = mapping;
  const txns = [];
  let skipped = 0; // dòng trống / dòng tổng cộng
  let invalid = 0; // dòng có tiền nhưng không đọc được ngày giờ
  let signSeen = false;
  let negSeen = false;

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (row.every((c) => c === null || c === undefined || String(c).trim() === '')) continue;

    const tm = parseDateTime(row[cols.time], cols.timeOnly !== undefined ? row[cols.timeOnly] : undefined);
    const credit = cols.credit !== undefined ? parseMoney(row[cols.credit]) : null;
    const debit = cols.debit !== undefined ? parseMoney(row[cols.debit]) : null;
    const single = cols.amount !== undefined ? parseMoney(row[cols.amount]) : null;

    let amount = 0;
    if (credit !== null || debit !== null) amount = Math.abs(credit || 0) - Math.abs(debit || 0);
    else if (single !== null) {
      amount = single;
      if (hasSign(row[cols.amount])) signSeen = true;
      if (single < 0) negSeen = true;
    }

    if (!tm) {
      // dòng tổng cộng cuối bảng không phải giao dịch
      const isTotal = row.some((c) => /^(tong|total|cong)\b/.test(norm(c)));
      if (amount !== 0 && !isTotal) invalid++;
      else skipped++;
      continue;
    }
    if (amount === 0) { skipped++; continue; }

    txns.push({
      time: tm.iso,
      day: tm.day,
      hasTime: tm.hasTime,
      amount,
      balance: cols.balance !== undefined ? parseMoney(row[cols.balance]) : null,
      description: cols.desc !== undefined ? cellText(row[cols.desc]) : '',
      seq: 0,
    });
  }

  // Sao kê chỉ có ngày: đánh số các giao dịch cùng ngày + cùng số tiền (theo thứ tự trong file)
  // để không bị coi là trùng nhau; tải lại cùng file vẫn cho cùng số thứ tự nên không bị nhân đôi.
  const seen = new Map();
  for (const t of txns) {
    if (t.hasTime) continue;
    const k = `${t.day}|${t.amount}`;
    const n = seen.get(k) || 0;
    t.seq = n;
    seen.set(k, n + 1);
  }

  const singleMode = cols.credit === undefined && cols.debit === undefined && cols.amount !== undefined;
  const noDirection = singleMode && txns.length > 0 && !negSeen && !signSeen;
  const hasAnyTime = txns.some((t) => t.hasTime);
  return { txns, skipped, invalid, noDirection, hasAnyTime };
}

// ---------- Khớp giao dịch với khách hàng ----------
const COMPANY_WORDS = /\b(cong ty|cty|ct|tnhh|co phan|cp|hkd|dntn|mtv|tm|dv|sx|xnk|thuong mai|dich vu|va|ho kinh doanh)\b/g;

const nameKey = (name) =>
  norm(name)
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(COMPANY_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function buildMatcher(customers) {
  const list = customers.map((c) => ({
    id: c.id,
    no: c.customer_no,
    key: nameKey(c.name),
    tax: String(c.tax_code || '').replace(/\D/g, ''),
  }));
  return (description) => {
    const text = ` ${norm(description).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `;
    // 1) Mã khách hàng KH0003 / KH3
    const m = text.match(/\bkh\s*0*(\d{1,7})\b/);
    if (m) {
      const c = list.find((x) => x.no === Number(m[1]));
      if (c) return c.id;
    }
    // 2) Mã số thuế
    for (const c of list) if (c.tax.length >= 10 && text.replace(/ /g, '').includes(c.tax)) return c.id;
    // 3) Tên khách hàng nằm trong nội dung (bỏ chữ "Công ty", "TNHH"...). Chỉ nhận khi có đúng một khách khớp.
    const hits = list.filter((c) => c.key.length >= 4 && text.includes(` ${c.key} `)).sort((a, b) => b.key.length - a.key.length);
    if (hits.length === 0) return null;
    // Nhiều khách cùng khớp: chỉ nhận khi tên dài nhất bao trùm các tên còn lại (VD "Minh Tâm" và "Minh Tâm Logistics")
    return hits.every((h) => hits[0].key.includes(h.key)) ? hits[0].id : null;
  };
}

// ---------- Đọc file (xlsx hoặc csv) thành mảng dòng ----------
function parseCsv(text) {
  const t = text.replace(/^﻿/, '');
  const first = t.split(/\r?\n/).slice(0, 5).join('\n');
  const delim = [';', '\t', ','].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

export async function readStatementFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) return parseCsv(await file.text());
  if (name.endsWith('.xlsx')) {
    const { readSheet } = await import('read-excel-file/browser');
    return await readSheet(file);
  }
  if (name.endsWith('.xls')) {
    throw new Error('File .xls (Excel cũ) chưa được hỗ trợ. Hãy mở file bằng Excel, chọn Lưu thành (Save As) định dạng .xlsx rồi tải lên lại.');
  }
  throw new Error('Chỉ hỗ trợ file sao kê .xlsx hoặc .csv.');
}

// Tên hiển thị của từng cột trong file (để kế toán chọn khi ánh xạ)
export function columnLabels(rows, headerRow) {
  const header = rows[headerRow] || [];
  const width = Math.max(header.length, ...rows.slice(headerRow, headerRow + 20).map((r) => (r || []).length));
  return Array.from({ length: width }, (_, i) => {
    const h = header[i] instanceof Date ? '' : String(header[i] ?? '').replace(/\s+/g, ' ').trim();
    return h ? `${columnName(i)}: ${h.length > 38 ? h.slice(0, 36) + '…' : h}` : `Cột ${columnName(i)}`;
  });
}
export function columnName(i) {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

// ---------- Hiển thị ----------
const TZ = 'Asia/Ho_Chi_Minh';
export function fmtTime(iso, hasTime = true) {
  if (!iso) return { date: '', time: '' };
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).reduce((a, p) => ({ ...a, [p.type]: p.value }), {});
  const date = `${parts.day}/${parts.month}/${parts.year}`;
  return hasTime ? { date, time: `${parts.hour}:${parts.minute}:${parts.second}` } : { date, time: '' };
}

// Bản gợi ý tên ngân hàng phổ biến ở Việt Nam
export const BANKS = [
  'Vietcombank', 'VietinBank', 'BIDV', 'Agribank', 'Techcombank', 'MB Bank', 'ACB', 'VPBank', 'TPBank', 'Sacombank',
  'HDBank', 'VIB', 'SHB', 'SeABank', 'OCB', 'MSB', 'Eximbank', 'LPBank', 'Nam A Bank', 'Bac A Bank', 'ABBank',
  'PVcomBank', 'Saigonbank', 'VietABank', 'NCB', 'Kienlongbank', 'BaoViet Bank', 'PG Bank', 'Cake', 'Timo',
];
