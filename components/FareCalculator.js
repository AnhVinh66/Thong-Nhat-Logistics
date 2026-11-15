'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fleet, distanceBands, site } from '../lib/site';

const money = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n / 1000) * 1000) + ' đ';

// ---------- Google Maps (nạp 1 lần) ----------
let mapsPromise;
function loadGoogleMaps() {
  if (!site.googleMapsKey) return Promise.reject(new Error('NO_KEY'));
  if (typeof window !== 'undefined' && window.google?.maps?.importLibrary) return Promise.resolve();
  if (!mapsPromise) {
    mapsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        site.googleMapsKey
      )}&v=weekly&loading=async&language=vi&region=VN`;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        mapsPromise = undefined;
        reject(new Error('LOAD_FAIL'));
      };
      document.head.appendChild(s);
    });
  }
  return mapsPromise;
}

async function geocode(address) {
  const { Geocoder } = await google.maps.importLibrary('geocoding');
  const { results } = await new Geocoder().geocode({ address, componentRestrictions: { country: 'VN' } });
  if (!results?.length) throw new Error('ZERO_RESULTS');
  return { text: results[0].formatted_address, loc: results[0].geometry.location.toJSON() };
}

async function drivingKm(a, b) {
  const { Route } = await google.maps.importLibrary('routes');
  const { routes } = await Route.computeRoutes({
    origin: a,
    destination: b,
    travelMode: 'DRIVING',
    fields: ['distanceMeters'],
  });
  if (!routes?.length || !routes[0].distanceMeters) throw new Error('NO_ROUTE');
  return Math.round(routes[0].distanceMeters / 100) / 10;
}

// ---------- Ô nhập địa chỉ ----------
function AddressBox({ id, title, value, onChange, provinces, error }) {
  const wards = useMemo(
    () => provinces.find((p) => String(p.c) === value.province)?.w || [],
    [provinces, value.province]
  );
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value, ...(k === 'province' ? { ward: '' } : {}) });
  return (
    <fieldset className="addr">
      <legend>{title}</legend>
      <div className="field">
        <label htmlFor={`${id}-p`}>Tỉnh / Thành phố <span aria-hidden="true">*</span></label>
        <select id={`${id}-p`} value={value.province} onChange={set('province')} disabled={!provinces.length}>
          <option value="">{provinces.length ? 'Chọn tỉnh / thành phố' : 'Đang tải...'}</option>
          {provinces.map((p) => <option key={p.c} value={p.c}>{p.n}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${id}-w`}>Phường / Xã <span aria-hidden="true">*</span></label>
        <select id={`${id}-w`} value={value.ward} onChange={set('ward')} disabled={!value.province}>
          <option value="">{value.province ? 'Chọn phường / xã' : 'Chọn tỉnh / thành trước'}</option>
          {wards.map((w) => <option key={w.c} value={w.c}>{w.n}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${id}-s`}>Địa chỉ cụ thể <span aria-hidden="true">*</span></label>
        <input id={`${id}-s`} value={value.street} onChange={set('street')} placeholder="Số nhà, tên đường, thôn/xóm, KCN..." autoComplete="off" />
      </div>
      {error && <p className="err" role="alert">{error}</p>}
    </fieldset>
  );
}

const empty = { province: '', ward: '', street: '' };

function fullAddress(v, provinces) {
  const p = provinces.find((x) => String(x.c) === v.province);
  const w = p?.w.find((x) => String(x.c) === v.ward);
  return [v.street.trim(), w?.n, p?.n, 'Việt Nam'].filter(Boolean).join(', ');
}

export default function FareCalculator() {
  const [provinces, setProvinces] = useState([]);
  const [loadErr, setLoadErr] = useState(false);
  const [from, setFrom] = useState(empty);
  const [to, setTo] = useState(empty);
  const [truck, setTruck] = useState('t7');
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirmed, setConfirmed] = useState(null); // { fromText, toText, km }
  const [manualKm, setManualKm] = useState('');

  useEffect(() => {
    fetch('/data/vn-admin.json')
      .then((r) => r.json())
      .then(setProvinces)
      .catch(() => setLoadErr(true));
  }, []);

  // Đổi địa chỉ thì phải xác nhận lại
  useEffect(() => {
    setConfirmed(null);
  }, [from, to]);

  function validate() {
    const check = (v) => (!v.province || !v.ward || !v.street.trim() ? 'Vui lòng chọn đủ Tỉnh/Thành, Phường/Xã và nhập địa chỉ cụ thể.' : '');
    const e = { from: check(from), to: check(to) };
    setErrs(e);
    return !e.from && !e.to;
  }

  async function onConfirm() {
    setMsg('');
    if (!validate()) return;
    setBusy(true);
    try {
      await loadGoogleMaps();
      let a, b;
      try {
        a = await geocode(fullAddress(from, provinces));
      } catch {
        setErrs({ from: 'Không tìm thấy địa chỉ điểm đi trên bản đồ. Hãy kiểm tra lại địa chỉ cụ thể.', to: '' });
        return;
      }
      try {
        b = await geocode(fullAddress(to, provinces));
      } catch {
        setErrs({ from: '', to: 'Không tìm thấy địa chỉ điểm đến trên bản đồ. Hãy kiểm tra lại địa chỉ cụ thể.' });
        return;
      }
      const km = await drivingKm(a.loc, b.loc);
      setConfirmed({ fromText: a.text, toText: b.text, km });
    } catch (err) {
      if (err.message === 'NO_KEY') setMsg('Tính năng tự động tính km chưa được cấu hình. Vui lòng nhập số km thủ công bên dưới hoặc gọi hotline.');
      else if (err.message === 'NO_ROUTE') setMsg('Không tìm được tuyến đường bộ giữa hai địa chỉ. Vui lòng kiểm tra lại hoặc liên hệ hotline.');
      else setMsg('Không kết nối được Google Maps. Vui lòng thử lại hoặc nhập số km thủ công.');
    } finally {
      setBusy(false);
    }
  }

  const km = manualKm ? Number(manualKm) : confirmed?.km;
  const result = useMemo(() => {
    if (!km || km <= 0) return null;
    const t = fleet.find((x) => x.id === truck);
    const i = distanceBands.findIndex((max) => km <= max);
    const price = i >= 0 ? t.tiers[i] : km * t.perKm;
    const note =
      i >= 0
        ? `Mốc ${i === 0 ? 0 : distanceBands[i - 1]}–${distanceBands[i]} km`
        : `${new Intl.NumberFormat('vi-VN').format(t.perKm)} đ/km × ${km.toLocaleString('vi-VN')} km`;
    return { km, t, price, note };
  }, [km, truck]);

  const useConfirmed = confirmed && !manualKm;
  const quoteHref = `/bao-gia/?from=${encodeURIComponent(
    useConfirmed ? confirmed.fromText : ''
  )}&to=${encodeURIComponent(useConfirmed ? confirmed.toText : '')}`;

  return (
    <div className="calc">
      <div className="calc-form">
        {loadErr && <p className="err" role="alert">Không tải được danh sách tỉnh/thành. Vui lòng tải lại trang.</p>}
        <AddressBox id="from" title="Điểm đi (nơi lấy hàng)" value={from} onChange={setFrom} provinces={provinces} error={errs.from} />
        <AddressBox id="to" title="Điểm đến (nơi giao hàng)" value={to} onChange={setTo} provinces={provinces} error={errs.to} />

        <div className="field">
          <label htmlFor="c-truck">Loại xe</label>
          <select id="c-truck" value={truck} onChange={(e) => setTruck(e.target.value)}>
            {fleet.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <button type="button" className="btn btn-primary btn-lg" onClick={onConfirm} disabled={busy || !provinces.length}>
          {busy ? 'Đang xác nhận địa chỉ...' : 'Xác nhận địa chỉ'}
        </button>
        {msg && <p className="err" role="alert">{msg}</p>}

        <details className="manual">
          <summary>Không tính được? Nhập số km thủ công</summary>
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="c-km">Số km thực tế</label>
            <input id="c-km" type="number" min="1" inputMode="numeric" value={manualKm} onChange={(e) => setManualKm(e.target.value)} placeholder="Ví dụ: 35" />
          </div>
        </details>
      </div>

      <div className="calc-result" aria-live="polite">
        {result ? (
          <>
            <p className="eyebrow">Cước tham khảo (một chiều)</p>
            <p className="calc-price">{money(result.price)}</p>
            <ul className="calc-meta">
              {useConfirmed && (
                <>
                  <li>Điểm đi: <strong>{confirmed.fromText}</strong></li>
                  <li>Điểm đến: <strong>{confirmed.toText}</strong></li>
                </>
              )}
              <li>Quãng đường{manualKm ? '' : ' (Google Maps)'}: <strong>{result.km.toLocaleString('vi-VN')} km</strong></li>
              <li>Loại xe: <strong>{result.t.name}</strong> ({result.t.load}, {result.t.volume})</li>
              <li>Cách tính: <strong>{result.note}</strong></li>
            </ul>
            <p className="small">
              Đây là mức giá ước tính để bạn tham khảo, chưa gồm phí bốc xếp, cầu đường đặc biệt, VAT và
              phụ phí phát sinh. Giá thực tế phụ thuộc thời điểm và điều kiện lô hàng.
            </p>
            <Link className="btn btn-primary" href={quoteHref}>Nhận báo giá chính xác</Link>
          </>
        ) : (
          <p>Nhập địa chỉ điểm đi, điểm đến rồi bấm <strong>Xác nhận địa chỉ</strong> để hệ thống tính quãng đường và cước tham khảo.</p>
        )}
      </div>
    </div>
  );
}
