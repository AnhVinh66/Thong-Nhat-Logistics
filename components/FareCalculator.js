'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { fleet, cities, kmFromHanoi, branchOffAxis, distanceBands } from '../lib/site';

function distance(a, b) {
  if (a === b) return 0;
  const ka = kmFromHanoi[a];
  const kb = kmFromHanoi[b];
  const offA = branchOffAxis.includes(a);
  const offB = branchOffAxis.includes(b);
  if (offA || offB) return ka + kb; // đi qua Hà Nội (gần đúng)
  return Math.abs(ka - kb);
}

const money = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n / 1000) * 1000) + ' đ';

export default function FareCalculator() {
  const [from, setFrom] = useState('Hà Nội');
  const [to, setTo] = useState('Đà Nẵng');
  const [truck, setTruck] = useState('t7');
  const [manualKm, setManualKm] = useState('');

  const result = useMemo(() => {
    const km = manualKm ? Number(manualKm) : distance(from, to);
    if (!km || km <= 0) return null;
    const t = fleet.find((x) => x.id === truck);
    const i = distanceBands.findIndex((max) => km <= max);
    const price = i >= 0 ? t.tiers[i] : km * t.perKm;
    const note = i >= 0 ? `Mốc ${i === 0 ? 0 : distanceBands[i - 1]}–${distanceBands[i]} km` : `${money(t.perKm)}/km × ${km.toLocaleString("vi-VN")} km`;
    return { km, t, price, note };
  }, [from, to, truck, manualKm]);

  return (
    <div className="calc">
      <div className="calc-form">
        <div className="grid-2">
          <div className="field">
            <label htmlFor="c-from">Điểm đi</label>
            <select id="c-from" value={from} onChange={(e) => setFrom(e.target.value)}>
              {cities.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="c-to">Điểm đến</label>
            <select id="c-to" value={to} onChange={(e) => setTo(e.target.value)}>
              {cities.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="c-truck">Loại xe</label>
            <select id="c-truck" value={truck} onChange={(e) => setTruck(e.target.value)}>
              {fleet.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="c-km">Hoặc nhập số km thực tế (dùng cho quãng đường ngắn / nội thành)</label>
          <input id="c-km" type="number" min="1" inputMode="numeric" value={manualKm} onChange={(e) => setManualKm(e.target.value)} placeholder="Ví dụ: 350" />
        </div>
      </div>

      <div className="calc-result" aria-live="polite">
        {result ? (
          <>
            <p className="eyebrow">Cước tham khảo (một chiều)</p>
            <p className="calc-price">{money(result.price)}</p>
            <ul className="calc-meta">
              <li>Quãng đường ước tính: <strong>{result.km.toLocaleString('vi-VN')} km</strong></li>
              <li>Loại xe: <strong>{result.t.name}</strong> ({result.t.size})</li>
              <li>Cách tính: <strong>{result.note}</strong></li>
            </ul>
            <p className="small">
              Đây là mức giá ước tính để bạn tham khảo, chưa gồm phí bốc xếp, cầu đường đặc biệt, VAT và
              phụ phí phát sinh. Giá thực tế phụ thuộc thời điểm và điều kiện lô hàng.
            </p>
            <Link
              className="btn btn-primary"
              href={`/bao-gia/?from=${encodeURIComponent(manualKm ? '' : from)}&to=${encodeURIComponent(manualKm ? '' : to)}`}
            >
              Nhận báo giá chính xác
            </Link>
          </>
        ) : (
          <p>Chọn hai điểm khác nhau hoặc nhập số km để xem cước tham khảo.</p>
        )}
      </div>
    </div>
  );
}
