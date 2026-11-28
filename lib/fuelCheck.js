// Đối chiếu dầu: so lít trên phiếu chi (hoá đơn cây xăng) với lít cảm biến Vietmap ghi nhận khi đổ,
// và tìm các lần dầu tụt khi xe đứng yên.
import { vnTime } from './vietmap';

export const LITRE_TOL = 0.03; // lệch quá 3% số lít
export const DROP_LITRES = 5; // dầu giảm từ 5 lít ...
export const DROP_WINDOW_MS = 30 * 60000; // ... trong 30 phút khi xe đứng yên

const isoVn = (ms) => new Date(ms + 7 * 3600000).toISOString();
export const dayOf = (isoTs) => isoVn(Date.parse(isoTs)).slice(0, 10);

const pctText = (x) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${(Math.abs(x) * 100).toFixed(1).replace('.', ',')}%`;
export { pctText };

// Lớp 1: mỗi lần đổ của cảm biến ghép với phiếu chi của nó; phiếu nhiên liệu không gắn lần đổ nào thì đứng riêng.
// refills: fuel_refills (+ vehicles), expenses: phiếu chi loại fuel (+ vehicles), checks: { key: fuel_checks }
export function reconcile(refills, expenses, checks) {
  const byRefill = new Map(expenses.filter((e) => e.fuel_refill_id).map((e) => [e.fuel_refill_id, e]));
  const rows = refills.map((r) => {
    const e = byRefill.get(r.id) || null;
    return build({ key: `r:${r.id}`, refill: r, expense: e, day: dayOf(r.refilled_at), at: r.refilled_at, vehicleId: r.vehicle_id, plate: r.vehicles?.plate }, checks);
  });
  const linked = new Set(refills.map((r) => r.id));
  expenses
    .filter((e) => !e.fuel_refill_id || !linked.has(e.fuel_refill_id))
    .forEach((e) => {
      if (e.fuel_refill_id) return; // phiếu của lần đổ nằm ngoài kỳ đang xem
      rows.push(build({ key: `e:${e.id}`, refill: null, expense: e, day: e.expense_date, at: `${e.expense_date}T12:00:00+07:00`, vehicleId: e.vehicle_id, plate: e.vehicles?.plate }, checks));
    });
  return rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

function build(base, checks) {
  const { refill, expense } = base;
  const sensor = refill ? Number(refill.litres) : null;
  const invoice = expense && expense.litres != null ? Number(expense.litres) : null;
  const unit = invoice ? (expense.unit_price != null ? Number(expense.unit_price) : Math.round(Number(expense.amount) / invoice)) : null;
  const diff = sensor != null && invoice != null ? invoice - sensor : null;
  const diffPct = diff != null && sensor ? diff / sensor : null;

  let status;
  if (!expense) {
    status = refill.skipped_at ? { tone: 'muted', label: 'Đã bỏ qua' } : { tone: 'muted', label: 'Chưa có phiếu chi' };
  } else if (!refill) {
    status = { tone: 'err', label: 'Có phiếu, không thấy đổ' };
  } else if (invoice == null) {
    status = { tone: 'warn', label: 'Thiếu số lít' };
  } else if (diffPct > LITRE_TOL) {
    status = { tone: 'err', label: 'Hoá đơn thừa lít' };
  } else if (diffPct < -LITRE_TOL) {
    status = { tone: 'warn', label: 'Hoá đơn thiếu lít' };
  } else {
    status = { tone: 'ok', label: 'Khớp' };
  }
  const check = checks[base.key] || null;
  const problem = status.tone === 'err' || status.tone === 'warn';
  return { ...base, sensor, invoice, unit, diff, diffPct, status, check, open: problem && !check };
}

// Lớp 2: cộng theo xe. fuelRows: báo cáo nhiên liệu Vietmap theo ngày (đã qua fuelRow), cars: [{ id (Vietmap), cmsId, name, normPer100km }]
export function byVehicle(cars, rows, fuelRows, drops) {
  return cars.map((c) => {
    const mine = rows.filter((r) => r.vehicleId === c.cmsId);
    const f = fuelRows.filter((r) => r.id === c.id);
    const sensor = mine.reduce((t, r) => t + (r.sensor || 0), 0);
    const invoice = mine.reduce((t, r) => t + (r.invoice || 0), 0);
    const paid = mine.reduce((t, r) => t + (r.expense ? Number(r.expense.amount) : 0), 0);
    const priced = mine.filter((r) => r.invoice && r.expense);
    const avgPrice = priced.length ? priced.reduce((t, r) => t + Number(r.expense.amount), 0) / priced.reduce((t, r) => t + r.invoice, 0) : null;
    const km = f.reduce((t, r) => t + (r.km || 0), 0);
    const consumed = f.reduce((t, r) => t + (r.consumed || 0), 0);
    const diff = invoice - sensor;
    // Chỉ so lít của những lần đổ đã có phiếu (lần chưa có phiếu không tính là lệch)
    const matched = mine.filter((r) => r.sensor != null && r.invoice != null);
    const mSensor = matched.reduce((t, r) => t + r.sensor, 0);
    const mDiff = matched.reduce((t, r) => t + r.diff, 0);
    return {
      ...c,
      refills: mine.filter((r) => r.refill).length,
      vouchers: mine.filter((r) => r.expense).length,
      sensor,
      invoice,
      paid,
      diff,
      matchedDiff: mDiff,
      matchedPct: mSensor ? mDiff / mSensor : null,
      diffMoney: avgPrice ? Math.round(mDiff * avgPrice) : null,
      km,
      per100: km > 0 ? (consumed / km) * 100 : null,
      issues: mine.filter((r) => r.open).length + drops.filter((d) => d.carId === c.id && d.open).length,
    };
  });
}

function median(list) {
  const s = [...list].sort((a, b) => a - b);
  return s[s.length >> 1];
}

// Lớp 3: dầu giảm từ 5 lít trở lên trong vòng 30 phút khi xe đứng yên (tốc độ 0). points: [{ t, x, y, v, f }]
export function detectDrops(points) {
  const p = points.filter((x) => x.f != null && x.f > 0).map((x) => ({ ms: vnTime(x.t), f: Number(x.f), v: Number(x.v) || 0, x: x.x, y: x.y }));
  if (p.length < 12) return [];
  const H = 4;
  const s = p.map((x, i) => ({ ...x, f: median(p.slice(Math.max(0, i - H), i + H + 1).map((y) => y.f)) }));
  const out = [];
  let i = 0;
  while (i < s.length) {
    if (s[i].v > 0) {
      i++;
      continue;
    }
    // đoạn đứng yên liên tục bắt đầu từ i
    let j = i;
    while (j + 1 < s.length && s[j + 1].v === 0 && s[j + 1].ms - s[i].ms <= DROP_WINDOW_MS) j++;
    const drop = s[i].f - Math.min(...s.slice(i, j + 1).map((x) => x.f));
    if (drop >= DROP_LITRES) {
      const low = s.slice(i, j + 1).reduce((m, x) => (x.f < m.f ? x : m));
      out.push({ from: s[i].ms, to: low.ms, litres: Math.round(drop * 10) / 10, before: s[i].f, after: low.f, x: s[i].x, y: s[i].y });
      i = j + 1;
    } else i++;
  }
  return out;
}

export const vnHm = (ms) => isoVn(ms).slice(11, 16);
export const vnDm = (ms) => {
  const s = isoVn(ms);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
};
