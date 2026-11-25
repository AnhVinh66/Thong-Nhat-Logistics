// Gọi dữ liệu định vị xe Vietmap qua Edge Function "vietmap" (khoá API nằm ở Supabase, không nằm trong mã web).
import { supabase } from './supabase';

export async function callVietmap(report, params = {}) {
  const { data, error } = await supabase.functions.invoke('vietmap', { body: { report, ...params } });
  if (!error) return data.data;
  let message = '';
  try {
    message = (await error.context.json()).error;
  } catch {}
  if (!message && (error.context?.status === 404 || error.name === 'FunctionsFetchError')) {
    message = 'Không gọi được Edge Function "vietmap": mất mạng hoặc chưa triển khai trên Supabase (xem README mục 3v).';
  }
  throw new Error(message || 'Không lấy được dữ liệu định vị. Vui lòng thử lại.');
}

// "2026-11-25" -> mốc đầu / cuối ngày theo giờ Việt Nam, dạng Vietmap cần
const compact = (isoDay) => isoDay.replaceAll('-', '');
export const dayRange = (from, to = from) => ({ from: `${compact(from)}000000`, to: `${compact(to)}235959` });

// Biển số hai bên viết khác nhau (29E37303 / 29E-373.03): so theo chữ và số
export const plateKey = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Thời gian Vietmap trả về luôn là giờ Việt Nam, có hoặc không có đuôi +07:00
export const vnTime = (s) => {
  const t = String(s || '').replace(' ', 'T');
  return Date.parse(/[zZ]$|[+-]\d\d:\d\d$/.test(t) ? t : `${t}+07:00`);
};
export const hm = (s) => String(s || '').slice(11, 16);
export const dmHm = (s) => `${String(s || '').slice(8, 10)}/${String(s || '').slice(5, 7)} ${hm(s)}`;

// Số giây -> "2 giờ 05 phút"
export function duration(sec) {
  const m = Math.round(Math.max(0, Number(sec) || 0) / 60);
  const h = Math.floor(m / 60);
  return h ? `${h} giờ ${String(m % 60).padStart(2, '0')} phút` : `${m} phút`;
}

export const num1 = (n) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(Number(n) || 0);

// Báo cáo nhiên liệu: tài liệu ghi km và lít, nhưng số thật là MÉT và 1/100 LÍT
// (đối chiếu 25/11/2026: EndFuel 3917 / 9358 / 6855 khớp cảm biến 39,15 / 93,58 / 68,55 lít; 45994 khớp 46,2 km GPS).
export const fuelRow = (r) => ({
  ...r,
  km: r.km / 1000,
  start: r.start / 100,
  end: r.end / 100,
  fuelIn: r.fuelIn / 100,
  fuelOut: r.fuelOut / 100,
  consumed: r.consumed / 100,
});

export const hasPos = (p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x !== 0 && p.y !== 0;

// Quãng đường (km) cộng từ các điểm GPS; bỏ rung lắc GPS khi xe đứng yên
export function trackKm(points) {
  const rad = Math.PI / 180;
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a.v && !b.v) continue;
    const h = Math.sin(((b.y - a.y) * rad) / 2) ** 2
      + Math.cos(a.y * rad) * Math.cos(b.y * rad) * Math.sin(((b.x - a.x) * rad) / 2) ** 2;
    km += 12742 * Math.asin(Math.sqrt(h));
  }
  return km;
}

// Khoảng cách gần đúng (mét) giữa hai điểm gần nhau
const metersApart = (a, b) => Math.hypot((a.x - b.x) * 111320 * Math.cos((a.y * Math.PI) / 180), (a.y - b.y) * 111320);

// Vietmap cắt lần dừng qua đêm thành hai đoạn lúc 0 giờ: nối lại thành một lần dừng. Kết quả xếp theo xe rồi theo giờ.
export function mergeStops(stops) {
  const out = [];
  [...stops].sort((a, b) => a.id - b.id || vnTime(a.from) - vnTime(b.from)).forEach((s) => {
    const last = out[out.length - 1];
    const gap = last && last.id === s.id ? vnTime(s.from) - vnTime(last.to) : Infinity;
    if (gap >= 0 && gap <= 120000 && String(s.from).slice(11, 16) === '00:00') {
      out[out.length - 1] = { ...last, to: s.to, seconds: last.seconds + s.seconds, accSeconds: last.accSeconds + s.accSeconds };
    } else out.push(s);
  });
  return out;
}

// Xe đang đứng yên thì dừng từ lúc nào. Lấy từ báo cáo dừng đỗ (trễ vài phút) vì StopTime của API vị trí
// nhảy qua lại giữa các máy chủ Vietmap. Chỉ nhận khi lần dừng cuối còn mới và đúng chỗ xe đang đứng.
export function parkedSince(car, merged) {
  if (car.speed > 0) return null;
  const last = merged.filter((s) => s.id === car.id).pop();
  if (!last || vnTime(car.gpsTime) - vnTime(last.to) > 20 * 60000 || metersApart(car, last) > 200) return null;
  return last.from;
}

// Trạng thái hiển thị của xe
export function vehicleState(s) {
  if (s.lostTime) return { tone: 'err', label: 'Mất tín hiệu' };
  if (s.speed > 0) return { tone: 'ok', label: 'Đang chạy' };
  if (s.accOn) return { tone: 'idle', label: 'Dừng, nổ máy' };
  return { tone: 'muted', label: 'Đỗ, tắt máy' };
}
