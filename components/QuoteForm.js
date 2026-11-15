'use client';

import { useEffect, useState } from 'react';
import { site, fleet, cargoTypes } from '../lib/site';

const initial = {
  name: '', phone: '', email: '', from: '', to: '', cargo: '', weight: '',
  truck: '', date: '', note: '',
};

export default function QuoteForm({ prefill = {} }) {
  const [v, setV] = useState({ ...initial, ...prefill });
  const [status, setStatus] = useState('idle'); // idle | sending | done | error | mailto
  const [errors, setErrors] = useState({});

  // Điền sẵn điểm đi/đến khi chuyển từ trang Tính cước sang (?from=...&to=...)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const from = p.get('from');
    const to = p.get('to');
    if (from || to) setV((s) => ({ ...s, from: from || s.from, to: to || s.to }));
  }, []);

  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));

  function validate() {
    const er = {};
    if (!v.name.trim()) er.name = 'Vui lòng nhập họ tên';
    if (!/^(0|\+84)\d{9,10}$/.test(v.phone.replace(/[\s.-]/g, ''))) er.phone = 'Số điện thoại chưa đúng (ví dụ 0965 328 200)';
    if (v.email && !/^\S+@\S+\.\S+$/.test(v.email)) er.email = 'Email chưa đúng định dạng';
    if (!v.from.trim()) er.from = 'Vui lòng nhập điểm lấy hàng';
    if (!v.to.trim()) er.to = 'Vui lòng nhập điểm giao hàng';
    if (!v.cargo.trim()) er.cargo = 'Vui lòng mô tả loại hàng';
    setErrors(er);
    return Object.keys(er).length === 0;
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    const body = {
      'Họ tên': v.name, 'Điện thoại': v.phone, Email: v.email,
      'Điểm lấy hàng': v.from, 'Điểm giao hàng': v.to, 'Loại hàng': v.cargo,
      'Khối lượng': v.weight, 'Loại xe': v.truck, 'Ngày vận chuyển': v.date, 'Ghi chú': v.note,
    };

    if (!site.formspreeId) {
      const text = Object.entries(body).map(([k, val]) => `${k}: ${val || '-'}`).join('\n');
      window.location.href = `mailto:${site.email}?subject=${encodeURIComponent(
        'Yêu cầu báo giá vận chuyển'
      )}&body=${encodeURIComponent(text)}`;
      setStatus('mailto');
      return;
    }

    setStatus('sending');
    try {
      const res = await fetch(`https://formspree.io/f/${site.formspreeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...body, _subject: 'Yêu cầu báo giá – Thống Nhất Logistic' }),
      });
      setStatus(res.ok ? 'done' : 'error');
      if (res.ok) setV(initial);
    } catch {
      setStatus('error');
    }
  }

  if (status === 'done' || status === 'mailto') {
    return (
      <div className="notice notice-ok" role="status">
        <h3>{status === 'done' ? 'Đã gửi yêu cầu thành công' : 'Đã mở ứng dụng email'}</h3>
        <p>
          {status === 'done'
            ? 'Cảm ơn bạn. Chúng tôi sẽ liên hệ lại để báo giá trong thời gian sớm nhất.'
            : 'Hãy bấm Gửi trong ứng dụng email. Nếu không mở được, vui lòng gọi hotline để được hỗ trợ ngay.'}
        </p>
        <p>
          Cần gấp? Gọi <a href={`tel:${site.hotline}`}><strong>{site.hotlineDisplay}</strong></a>.
        </p>
        <button className="btn btn-outline" onClick={() => setStatus('idle')}>Gửi yêu cầu khác</button>
      </div>
    );
  }

  const f = (id, label, props = {}, extra) => (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {props.required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={id}
        value={v[id]}
        onChange={set(id)}
        aria-invalid={errors[id] ? 'true' : undefined}
        aria-describedby={errors[id] ? `${id}-err` : undefined}
        {...props}
      />
      {extra}
      {errors[id] && <p className="err" id={`${id}-err`}>{errors[id]}</p>}
    </div>
  );

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <div className="grid-2">
        {f('name', 'Họ và tên', { required: true, autoComplete: 'name' })}
        {f('phone', 'Số điện thoại', { required: true, type: 'tel', inputMode: 'tel', autoComplete: 'tel' })}
      </div>
      {f('email', 'Email (không bắt buộc)', { type: 'email', autoComplete: 'email' })}
      <div className="grid-2">
        {f('from', 'Điểm lấy hàng', { required: true, placeholder: 'Ví dụ: KCN Quang Minh, Hà Nội' })}
        {f('to', 'Điểm giao hàng', { required: true, placeholder: 'Ví dụ: Quận 9, TP. Hồ Chí Minh' })}
      </div>
      <div className="grid-2">
        {f('cargo', 'Loại hàng', { required: true, list: 'cargo-list', placeholder: 'Ví dụ: nội thất, thực phẩm đóng gói' })}
        {f('weight', 'Khối lượng / số kiện', { placeholder: 'Ví dụ: 3 tấn hoặc 20 pallet' })}
      </div>
      <datalist id="cargo-list">
        {cargoTypes.map((c) => <option key={c.id} value={c.label} />)}
      </datalist>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="truck">Loại xe mong muốn</label>
          <select id="truck" value={v.truck} onChange={set('truck')}>
            <option value="">Tư vấn giúp tôi</option>
            {fleet.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        </div>
        {f('date', 'Ngày vận chuyển dự kiến', { type: 'date' })}
      </div>
      <div className="field">
        <label htmlFor="note">Ghi chú thêm</label>
        <textarea id="note" rows={4} value={v.note} onChange={set('note')} placeholder="Yêu cầu bốc xếp, giờ nhận hàng, hàng cồng kềnh..." />
      </div>
      {status === 'error' && (
        <p className="err" role="alert">
          Gửi không thành công. Vui lòng thử lại hoặc gọi {site.hotlineDisplay}.
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-lg" disabled={status === 'sending'}>
        {status === 'sending' ? 'Đang gửi...' : 'Gửi yêu cầu báo giá'}
      </button>
      <p className="muted small">Thông tin của bạn chỉ dùng để liên hệ báo giá.</p>
    </form>
  );
}
