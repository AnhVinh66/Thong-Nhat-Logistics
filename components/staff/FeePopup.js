'use client';

import { useEffect, useRef, useState } from 'react';
import { commas } from '../../lib/supabase';
import MoneyInput from './MoneyInput';

// Pop up nhỏ nhập một khoản phí phát sinh (VD: phí cầu đường, phí bến bãi). Có thể để trống nếu không phát sinh.
// value là chuỗi chỉ gồm chữ số; tiền tự có dấu phẩy khi gõ.
export default function FeePopup({ label, value, onChange, idPrefix }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const has = Number(value || 0) > 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      // Chỉ đóng pop up, không đóng cả form (cửa sổ form cũng nghe phím Esc trên cùng một nơi)
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation?.();
      close();
    } else if (e.key === 'Enter') {
      e.preventDefault(); // không gửi cả form khi bấm Enter trong pop up
      close();
    }
  }

  return (
    <div className="fee-pop" ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`fee-trigger ${has ? 'has' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {has ? <>{label}: <strong>{commas(value)} đ</strong> <span aria-hidden="true">✎</span></> : <>+ {label}</>}
      </button>

      {open && (
        <div className="fee-panel" role="dialog" aria-label={label} onKeyDown={onKey}>
          <label htmlFor={`${idPrefix}-fee`} className="fee-title">{label}</label>
          <MoneyInput
            id={`${idPrefix}-fee`}
            value={value}
            onChange={onChange}
            placeholder="VD: 120,000"
            className="money-big"
            autoFocus
          />
          <p className="muted small" style={{ margin: 0 }}>Để trống nếu không phát sinh.</p>
          <div className="fee-actions">
            {has && <button type="button" className="btn btn-danger sm" onClick={() => { onChange(''); close(); }}>Xoá phí</button>}
            <button type="button" className="btn btn-primary sm" onClick={close}>Xong</button>
          </div>
        </div>
      )}
    </div>
  );
}
