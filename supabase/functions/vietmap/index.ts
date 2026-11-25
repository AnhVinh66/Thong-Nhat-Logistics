// Edge Function "vietmap": cầu nối giữa Thống Nhất CMS và API định vị xe Vietmap (tài liệu: https://doc-api.quanlyxe.vn).
// Khoá Vietmap nằm ở Supabase -> Edge Functions -> Secrets, tên VIETMAP_API_KEY. KHÔNG ghi khoá vào file này.
// Chỉ Admin, Kế toán, Điều phối xe gọi được: hỏi database bằng chính phiên đăng nhập của người gọi (hàm sees_all() trong roles.sql),
// nên không cần khoá service_role. Vì tự kiểm tra ở đây, khi triển khai hãy TẮT "Verify JWT with legacy secret".
// Chỉ trả về các trường giao diện cần (bỏ số GPLX, link theo dõi kèm token, ảnh camera...).

const BASE = 'https://client-api.quanlyxe.vn/v3/tracking/';
const DAY = 86400;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class Fail extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

// ---------- Kiểm tra quyền ----------
async function assertAllowed(req) {
  const auth = req.headers.get('authorization') || '';
  const anon = req.headers.get('apikey') || '';
  if (!auth.startsWith('Bearer ') || !anon) throw new Fail(401, 'Bạn chưa đăng nhập.');
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/sees_all`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: auth, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 401) throw new Fail(401, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  if (!res.ok || (await res.json()) !== true) throw new Fail(403, 'Bạn không có quyền xem định vị xe.');
}

// ---------- Kiểm tra tham số ----------
function readIds(v) {
  const ids = Array.isArray(v) ? v : [];
  if (!ids.length || ids.length > 50 || !ids.every((x) => Number.isInteger(x) && x > 0)) throw new Fail(400, 'Danh sách xe không hợp lệ.');
  return ids;
}

// Vietmap nhận giờ Việt Nam dạng yyyyMMddHHmmss
function readRange(p, maxDays) {
  const sec = (s) => {
    const m = /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/.exec(String(s ?? ''));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000 : NaN;
  };
  const span = sec(p.to) - sec(p.from);
  if (!(span >= 0)) throw new Fail(400, 'Khoảng thời gian không hợp lệ.');
  if (span > maxDays * DAY) throw new Fail(400, `Chỉ xem được tối đa ${maxDays} ngày mỗi lần.`);
  return { from: String(p.from), to: String(p.to) };
}

// ---------- Gọi Vietmap ----------
async function vietmap(name, params = {}) {
  const key = Deno.env.get('VIETMAP_API_KEY');
  if (!key) throw new Fail(500, 'Chưa đặt VIETMAP_API_KEY trong Supabase Secrets.');
  let res;
  try {
    res = await fetch(`${BASE}${name}?${new URLSearchParams(params)}`, {
      headers: { apikey: key.trim() },
      redirect: 'error',
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    throw new Fail(502, 'Không kết nối được máy chủ Vietmap. Vui lòng thử lại.');
  }
  if (res.status === 401 || res.status === 403) throw new Fail(502, 'Vietmap từ chối khoá API. Kiểm tra lại VIETMAP_API_KEY.');
  if (res.status === 429) throw new Fail(502, 'Vietmap báo gọi quá nhiều lần. Vui lòng chờ một lát rồi thử lại.');
  if (!res.ok) throw new Fail(502, `Vietmap báo lỗi (mã ${res.status}).`);
  const body = await res.json().catch(() => null);
  if (body && body.Data == null && !body.Message) return []; // không có dữ liệu trong khoảng đã chọn
  if (!body || !Array.isArray(body.Data)) throw new Fail(502, 'Vietmap trả về dữ liệu không đúng định dạng.');
  return body.Data;
}

// Nhớ kết quả trong thời gian ngắn để nhiều người cùng xem không gọi Vietmap liên tục
const memo = new Map();
async function cached(key, seconds, load) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < seconds * 1000) return hit.data;
  const data = await load();
  memo.set(key, { at: Date.now(), data });
  return data;
}

// Cảm biến dầu theo tài liệu Vietmap (đơn vị: lít)
const FUEL_SENSORS = [10, 20, 21, 22, 26, 29, 30];
function fuelLitres(sensors) {
  const found = (Array.isArray(sensors) ? sensors : [])
    .filter((s) => FUEL_SENSORS.includes(Number(s?.SensorTypeId)) && s.Value != null)
    .map((s) => Number(s.Value))
    .filter(Number.isFinite);
  return found.length ? found.reduce((a, b) => a + b, 0) : null;
}

const listVehicles = () =>
  cached('vehicles', 300, async () =>
    (await vietmap('getvehicles')).map((v) => ({
      id: v.Id,
      plate: v.ActualPlate || v.Plate,
      type: v.VehicleTypeName || '',
      normPer100km: v.FuelPer100km ?? 0,
    }))
  );

const reports = {
  vehicles: () => listVehicles(),

  // Vị trí hiện tại của mọi xe
  status: async () => {
    const cars = await listVehicles();
    return cached('status', 15, async () => {
      const rows = await Promise.all(cars.map((c) => vietmap('getvehiclestatuses', { id: String(c.id), ticks: '0' })));
      return rows.flatMap((data, i) =>
        data.slice(0, 1).map((s) => ({
          id: cars[i].id,
          plate: cars[i].plate,
          gpsTime: s.GpsTime,
          x: s.X,
          y: s.Y,
          speed: s.Speed ?? 0,
          heading: s.Heading ?? 0,
          accOn: s.IsAccOn === true,
          address: s.Address || '',
          driver: s.Driver || '',
          meters: s.Distance ?? 0,
          odoKm: s.LastOdoMile ?? null,
          stopTime: s.StopTime || null,
          lostTime: s.LostGpsTime || null,
          fuel: fuelLitres(s.Sensors),
        }))
      );
    });
  },

  // Hành trình của 1 xe (Vietmap cho tối đa 3 ngày)
  history: async (p) => {
    const [id] = readIds([p.id]);
    const r = readRange(p, 3);
    return (await vietmap('getvehiclehistory', { id: String(id), ...r })).map((h) => ({
      t: h.GpsTime,
      x: h.X,
      y: h.Y,
      v: h.Speed ?? 0,
      f: fuelLitres(h.Sensors),
    }));
  },

  // Điểm dừng đỗ từ "duration" giây trở lên (tối đa 31 ngày)
  stops: async (p) => {
    const ids = readIds(p.ids);
    const r = readRange(p, 31);
    const duration = Number(p.duration);
    if (!Number.isInteger(duration) || duration < 0 || duration > DAY) throw new Fail(400, 'Thời gian dừng tối thiểu không hợp lệ.');
    const rows = await Promise.all(ids.map((id) => vietmap('GetVehicleStopReports', { id: String(id), ...r, duration: String(duration) })));
    return rows.flatMap((data, i) =>
      data.map((s) => ({
        id: ids[i],
        from: s.FromTime,
        to: s.ToTime,
        seconds: s.Duration ?? 0,
        accSeconds: s.AccTime ?? 0,
        address: s.Address || '',
        station: s.Station || '',
        driver: s.Driver || '',
        x: s.X,
        y: s.Y,
      }))
    );
  },

  // Quãng đường và nhiên liệu theo ngày của từng xe. Tài liệu không ghi giới hạn, dùng 31 ngày như các báo cáo khác.
  fuel: async (p) => {
    const ids = readIds(p.ids);
    const r = readRange(p, 31);
    return (await vietmap('GetVehicleFuelReport', { vehicles: ids.join(','), ...r })).map((f) => ({
      id: f.VehicleId,
      date: f.Time,
      km: f.GpsMileage ?? 0,
      norm: f.FuelPer100Km ?? 0,
      signal: f.FuelSignal ?? 0,
      start: f.StartFuel ?? 0,
      end: f.EndFuel ?? 0,
      fuelIn: f.FuelIn ?? 0,
      fuelOut: f.FuelOut ?? 0,
      consumed: f.FuelConsumed ?? 0,
      idleSeconds: f.IdleTime ?? 0,
    }));
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    if (req.method !== 'POST') throw new Fail(405, 'Chỉ nhận POST.');
    await assertAllowed(req);
    const p = await req.json().catch(() => null);
    if (!p || !Object.hasOwn(reports, p.report)) throw new Fail(400, 'Không có báo cáo này.');
    return json({ data: await reports[p.report](p) });
  } catch (e) {
    if (e instanceof Fail) return json({ error: e.message }, e.status);
    console.error('vietmap:', e?.name, e?.message);
    return json({ error: 'Máy chủ gặp lỗi. Vui lòng thử lại.' }, 500);
  }
});
