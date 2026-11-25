// Nhận diện từng lần đổ dầu từ cảm biến Vietmap và ghi vào bảng fuel_refills (supabase/do-dau.sql).
// Báo cáo nhiên liệu của Vietmap chỉ cho TỔNG lít đổ trong ngày, nên số lượt phải tìm trong hành trình:
// mức dầu tăng nhanh và giữ ở mức cao = một lần đổ.
import { supabase } from './supabase';
import { callVietmap, dayRange, fuelRow, vnTime } from './vietmap';
import { todayIso } from './period';

const MIN_LITRES = 8; // tăng ít hơn thế này coi là dầu sóng sánh, không phải đổ
const HALF = 4; // cửa sổ làm mượt: 2 * HALF + 1 điểm
const STEP_MS = 10 * 60000; // so mức dầu trước và sau trong 10 phút
const SETTLE_MS = 15 * 60000; // lần đổ phải xong được 15 phút mới ghi (tránh ghi khi đang đổ dở)

function median(list) {
  const s = [...list].sort((a, b) => a - b);
  return s[s.length >> 1];
}

// points: [{ t, f }] theo thời gian, f = lít trong bình. Trả về [{ at (ms), litres }]
export function detectRefills(points, now = Date.now()) {
  const p = points.filter((x) => x.f != null && x.f > 0).map((x) => ({ ms: vnTime(x.t), f: Number(x.f) }));
  if (p.length < 2 * HALF + 2) return [];
  const s = p.map((x, i) => ({ ms: x.ms, f: median(p.slice(Math.max(0, i - HALF), i + HALF + 1).map((y) => y.f)) }));

  // Điểm "đang tăng": trong 10 phút tới mức dầu cao hơn hẳn
  const rising = [];
  let j = 0;
  for (let i = 0; i < s.length; i++) {
    if (j < i) j = i;
    while (j + 1 < s.length && s[j + 1].ms - s[i].ms <= STEP_MS) j++;
    // Mất tín hiệu hoặc tắt thiết bị khi đổ: điểm kế tiếp cách xa thì vẫn so với nó
    const k = j === i && i + 1 < s.length ? i + 1 : j;
    if (s[k].f - s[i].f >= MIN_LITRES / 2) rising.push([i, k]);
  }

  // Gộp các điểm tăng liền nhau thành một lần đổ
  const groups = [];
  rising.forEach(([a, b]) => {
    const g = groups[groups.length - 1];
    if (g && a <= g[1]) g[1] = Math.max(g[1], b);
    else groups.push([a, b]);
  });

  return groups.flatMap(([a, b]) => {
    const before = median(s.slice(Math.max(0, a - 2 * HALF), a + 1).map((x) => x.f));
    const after = median(s.slice(b, b + 2 * HALF + 1).map((x) => x.f));
    const litres = after - before;
    if (litres < MIN_LITRES || now - s[b].ms < SETTLE_MS) return [];
    const start = s.slice(a, b + 1).find((x) => x.f > before + litres * 0.2) || s[a];
    return [{ at: start.ms, litres: Math.round(litres * 10) / 10 }];
  });
}

// Số lít đo từ điểm GPS hơi lệch do dầu sóng sánh: chia lại theo tổng lít đổ trong ngày của Vietmap khi hai bên gần nhau
export function fitLitres(events, dayTotal) {
  const sum = events.reduce((t, e) => t + e.litres, 0);
  if (!sum || Math.abs(sum - dayTotal) > dayTotal * 0.25) return events;
  return events.map((e) => ({ ...e, litres: Math.round(((e.litres * dayTotal) / sum) * 10) / 10 }));
}

const isoVn = (ms) => new Date(ms + 7 * 3600000).toISOString().slice(0, 10);
const CHECKED_KEY = 'tn-fuel-checked';
function readChecked() {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHECKED_KEY)) || []);
  } catch {
    return new Set();
  }
}

export const refillDay = (r) => isoVn(Date.parse(r.refilled_at));

export async function loadRefills(from, to) {
  const { data, error } = await supabase
    .from('fuel_refills')
    .select('*, vehicles(plate)')
    .gte('refilled_at', `${from}T00:00:00+07:00`)
    .lte('refilled_at', `${to}T23:59:59+07:00`)
    .order('refilled_at', { ascending: false });
  if (error) throw new Error('Chưa có bảng lần đổ dầu. Hãy chạy supabase/do-dau.sql trên Supabase.');
  return data;
}

// Tìm và ghi các lần đổ dầu còn thiếu trong khoảng ngày (tối đa 31 ngày). cars: [{ id (Vietmap), cmsId }]
export async function syncRefills(cars, from, to, fuelRows = null) {
  const known = cars.filter((c) => c.cmsId);
  if (!known.length) return;
  const today = todayIso();
  const [rows, existing] = await Promise.all([
    fuelRows || callVietmap('fuel', { ids: known.map((c) => c.id), ...dayRange(from, to) }).then((r) => r.map(fuelRow)),
    loadRefills(from, to),
  ]);
  const checked = readChecked();
  const found = [];

  for (const r of rows) {
    const car = known.find((c) => c.id === r.id);
    const day = String(r.date).slice(0, 10);
    if (!car || r.fuelIn < MIN_LITRES) continue;
    const have = existing.filter((x) => x.vehicle_id === car.cmsId && refillDay(x) === day);
    const sum = have.reduce((t, x) => t + Number(x.litres), 0);
    const mark = `${car.id}:${day}:${r.fuelIn}`;
    if ((have.length && Math.abs(sum - r.fuelIn) <= Math.max(5, r.fuelIn * 0.1)) || checked.has(mark)) continue;

    const range = dayRange(day);
    const [points, stops] = await Promise.all([
      callVietmap('history', { id: car.id, ...range }),
      callVietmap('stops', { ids: [car.id], ...range, duration: 120 }),
    ]);
    if (points.length && points.every((p) => p.f === undefined)) {
      throw new Error('Function "vietmap" trên Supabase là bản cũ. Hãy dán và Deploy lại supabase/functions/vietmap/index.ts.');
    }
    const events = fitLitres(detectRefills(points), r.fuelIn);
    events.forEach((e) => {
      const stop = stops.find((s) => e.at >= vnTime(s.from) - 300000 && e.at <= vnTime(s.to) + 300000);
      found.push({ vehicle_id: car.cmsId, refilled_at: new Date(e.at).toISOString(), litres: e.litres, address: stop?.address || null, estimated: false });
    });
    // Ngày đã qua mà không thấy rõ lúc đổ (thiếu tín hiệu): vẫn ghi một lần theo tổng lít của báo cáo
    if (!events.length && !have.length && day < today) {
      found.push({ vehicle_id: car.cmsId, refilled_at: `${day}T12:00:00+07:00`, litres: r.fuelIn, address: null, estimated: true });
    }
    if (day < today) checked.add(mark);
  }

  if (found.length) {
    const { error } = await supabase.rpc('record_fuel_refills', { p_rows: found });
    if (error) throw new Error('Không ghi được lần đổ dầu. Hãy chạy supabase/do-dau.sql trên Supabase.');
  }
  try {
    localStorage.setItem(CHECKED_KEY, JSON.stringify([...checked].slice(-300)));
  } catch {}
}

export const isWaiting = (r) => r.needs_voucher && !r.expense_id && !r.skipped_at;
export function voucherState(r) {
  if (r.expense_id) return { tone: 'ok', label: 'Đã lập phiếu chi' };
  if (r.skipped_at) return { tone: 'muted', label: 'Đã bỏ qua' };
  if (!r.needs_voucher) return { tone: 'muted', label: 'Trước khi bật' };
  return { tone: 'warn', label: 'Chờ nhập tiền' };
}

const vnParts = (iso) => new Date(Date.parse(iso) + 7 * 3600000).toISOString();
export const refillTime = (r) => {
  const s = vnParts(r.refilled_at);
  const day = `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  return r.estimated ? `${day} (không rõ giờ)` : `${day} ${s.slice(11, 16)}`;
};
export const refillContent = (r) =>
  `Đổ dầu ${String(Number(r.litres)).replace('.', ',')} lít, xe ${r.vehicles?.plate || ''}, ${refillTime(r)}${r.address ? `, tại ${r.address}` : ''} (tự ghi từ cảm biến Vietmap)`;
