// Kỳ thống kê dùng chung (ngày / tuần / tháng / năm). Ngày dạng "yyyy-mm-dd".
export const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const dmy = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
export const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const PERIODS = [
  { id: 'day', label: 'Ngày' },
  { id: 'week', label: 'Tuần' },
  { id: 'month', label: 'Tháng' },
  { id: 'year', label: 'Năm' },
];

// Khoảng ngày [from, to] của kỳ chứa ngày "anchor". Tuần tính từ thứ Hai đến Chủ nhật.
export function rangeOf(period, anchor) {
  const a = parse(anchor);
  if (period === 'day') return { from: anchor, to: anchor, label: `Ngày ${dmy(anchor)}` };
  if (period === 'week') {
    const dow = (a.getUTCDay() + 6) % 7;
    const mon = new Date(a.getTime() - dow * 86400000);
    const sun = new Date(mon.getTime() + 6 * 86400000);
    return { from: iso(mon), to: iso(sun), label: `Tuần từ ${dmy(iso(mon))} đến ${dmy(iso(sun))}` };
  }
  if (period === 'month') {
    const first = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1));
    const last = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 0));
    return { from: iso(first), to: iso(last), label: `Tháng ${pad(a.getUTCMonth() + 1)}/${a.getUTCFullYear()}` };
  }
  const y = a.getUTCFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: `Năm ${y}` };
}

export function shiftAnchor(period, anchor, dir) {
  const a = parse(anchor);
  if (period === 'day') return iso(new Date(a.getTime() + dir * 86400000));
  if (period === 'week') return iso(new Date(a.getTime() + dir * 7 * 86400000));
  if (period === 'month') return iso(new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + dir, 1)));
  return iso(new Date(Date.UTC(a.getUTCFullYear() + dir, 0, 1)));
}
