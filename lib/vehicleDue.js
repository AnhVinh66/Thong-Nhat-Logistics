// Hạn giấy tờ xe và lịch bảo dưỡng: tính còn bao nhiêu ngày / km, xếp mức Quá hạn / Sắp đến hạn / Ổn.
import { callVietmap, dayRange, fuelRow, plateKey } from './vietmap';

export const WARN_DAYS = 30; // báo trước 30 ngày
export const WARN_KM = 1000; // ... hoặc 1.000 km

export const DOC_KINDS = [
  { id: 'registration', label: 'Đăng kiểm' },
  { id: 'tnds', label: 'Bảo hiểm TNDS' },
  { id: 'hull', label: 'Bảo hiểm thân vỏ' },
  { id: 'badge', label: 'Phù hiệu xe tải' },
  { id: 'road_fee', label: 'Phí đường bộ' },
  { id: 'city_permit', label: 'Giấy phép vào phố' },
];
export const docLabel = (id) => DOC_KINDS.find((k) => k.id === id)?.label || id;

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const parse = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const isoOf = (ms) => new Date(ms).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / DAY);
export function addMonths(day, n) {
  const y = +day.slice(0, 4);
  const m = +day.slice(5, 7) - 1 + n;
  const d = +day.slice(8, 10);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const t = new Date(Date.UTC(y, m, Math.min(d, last)));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

const TONES = { err: 3, warn: 2, muted: 1, ok: 0 };
export const worse = (a, b) => (TONES[a] >= TONES[b] ? a : b);

function toneOf(days, kmLeft) {
  if ((days != null && days < 0) || (kmLeft != null && kmLeft < 0)) return 'err';
  if ((days != null && days <= WARN_DAYS) || (kmLeft != null && kmLeft <= WARN_KM)) return 'warn';
  return 'ok';
}
export const TONE_LABEL = { err: 'Quá hạn', warn: 'Sắp đến hạn', ok: 'Còn hạn', muted: 'Chưa nhập' };

// Giấy tờ đang dùng của một xe, một loại: dòng có ngày hết hạn xa nhất
export function docStatus(docs, vehicleId, kind, today) {
  const list = docs.filter((d) => d.vehicle_id === vehicleId && d.kind === kind).sort((a, b) => b.expires_on.localeCompare(a.expires_on));
  const cur = list[0] || null;
  if (!cur) return { cur: null, list, tone: 'muted', days: null };
  const days = daysBetween(today, cur.expires_on);
  return { cur, list, days, tone: toneOf(days, null) };
}

// Bảo dưỡng của một xe, một hạng mục. kmSince(vehicleId, fromDay) trả số km đã chạy từ ngày đó (null nếu không biết)
export function maintStatus(logs, item, vehicleId, today, kmSince) {
  const list = logs.filter((l) => l.vehicle_id === vehicleId && l.item_id === item.id).sort((a, b) => b.done_on.localeCompare(a.done_on));
  const last = list[0] || null;
  if (!last) return { last: null, list, tone: 'muted', days: null, kmLeft: null, km: null };
  const dueDay = item.every_months ? addMonths(last.done_on, item.every_months) : null;
  const days = dueDay ? daysBetween(today, dueDay) : null;
  const km = item.every_km ? kmSince(vehicleId, last.done_on) : null;
  const kmLeft = km != null ? item.every_km - km : null;
  return { last, list, dueDay, days, km, kmLeft, tone: toneOf(days, kmLeft) };
}

export const num0 = (n) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(n));
export const leftText = (s) => leftParts(s).join(' · ') || '—';
export function leftParts({ days, kmLeft }) {
  const out = [];
  if (kmLeft != null) out.push(kmLeft < 0 ? `Quá ${num0(-kmLeft)} km` : `Còn ${num0(kmLeft)} km`);
  if (days != null) out.push(days < 0 ? `Quá ${-days} ngày` : days === 0 ? 'Hết hạn hôm nay' : `Còn ${days} ngày`);
  return out;
}

// Km mỗi ngày của từng xe CMS, lấy từ báo cáo nhiên liệu Vietmap (mỗi lần gọi tối đa 31 ngày, xem tối đa 400 ngày).
// cars: [{ cmsId, plate }]. Trả { byDay: Map(cmsId -> Map(day -> km)), from } hoặc ném lỗi.
export async function loadKm(vehicles, fromDay, today) {
  const gps = await callVietmap('vehicles');
  const byPlate = Object.fromEntries(vehicles.map((v) => [plateKey(v.plate), v.id]));
  const cars = gps.filter((g) => byPlate[plateKey(g.plate)]);
  const start = Math.max(parse(fromDay), parse(today) - 400 * DAY);
  const byDay = new Map();
  for (let a = start; a <= parse(today); a += 31 * DAY) {
    const b = Math.min(a + 30 * DAY, parse(today));
    const rows = (await callVietmap('fuel', { ids: cars.map((c) => c.id), ...dayRange(isoOf(a), isoOf(b)) })).map(fuelRow);
    rows.forEach((r) => {
      const cms = byPlate[plateKey(cars.find((c) => c.id === r.id)?.plate)];
      if (!cms) return;
      if (!byDay.has(cms)) byDay.set(cms, new Map());
      byDay.get(cms).set(String(r.date).slice(0, 10), r.km || 0);
    });
  }
  return { byDay, from: isoOf(start) };
}

// Hàm km đã chạy từ sau ngày "day" (không tính ngày làm) đến hôm nay
export function kmCounter(km) {
  if (!km) return () => null;
  return (vehicleId, day) => {
    const m = km.byDay.get(vehicleId);
    if (!m) return null;
    let t = 0;
    m.forEach((v, d) => {
      if (d > day) t += v;
    });
    return t;
  };
}
