'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from './Icon';

// Ô chọn ngày luôn hiển thị NGÀY/THÁNG/NĂM (dd/mm/yyyy), không phụ thuộc cài đặt vùng của máy.
// value / onChange dùng chuỗi ISO "yyyy-mm-dd" (rỗng = chưa có ngày hợp lệ).
// Gõ liền các chữ số (VD 15112026), dấu "/" tự thêm. Có nút lịch để chọn.

const pad = (n) => String(n).padStart(2, '0');
const isoToText = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

function digitsToText(d) {
  let s = d.slice(0, 2);
  if (d.length > 2) s += '/' + d.slice(2, 4);
  if (d.length > 4) s += '/' + d.slice(4, 8);
  return s;
}

// 8 chữ số ddmmyyyy -> "yyyy-mm-dd" nếu là ngày có thật, ngược lại ''
function toIso(d) {
  if (d.length !== 8) return '';
  const dd = +d.slice(0, 2);
  const mm = +d.slice(2, 4);
  const yy = +d.slice(4, 8);
  const t = new Date(Date.UTC(yy, mm - 1, dd));
  if (yy < 1900 || yy > 2100 || t.getUTCFullYear() !== yy || t.getUTCMonth() !== mm - 1 || t.getUTCDate() !== dd) return '';
  return `${yy}-${pad(mm)}-${pad(dd)}`;
}

export default function DateInput({ value = '', onChange, id, className = '', placeholder = 'dd/mm/yyyy', disabled = false, ...rest }) {
  const [text, setText] = useState(isoToText(value));
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef(null);
  const pickerRef = useRef(null);
  const caret = useRef(null); // số chữ số nằm bên trái con trỏ

  // Đồng bộ khi giá trị bên ngoài đổi (VD mở form sửa, bấm xoá bộ lọc)
  useEffect(() => {
    if (value !== toIso(text.replace(/\D/g, ''))) {
      setText(isoToText(value));
      setInvalid(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el || caret.current === null || document.activeElement !== el) return;
    let digits = 0;
    let pos = 0;
    while (pos < text.length && digits < caret.current) {
      if (/\d/.test(text[pos])) digits++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
    caret.current = null;
  }, [text]);

  function onType(e) {
    const raw = e.target.value;
    caret.current = raw.slice(0, e.target.selectionStart ?? raw.length).replace(/\D/g, '').length;
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    setText(digitsToText(digits));
    const iso = toIso(digits);
    setInvalid(digits.length === 8 && !iso);
    if (iso !== value) onChange(iso);
  }

  function openPicker() {
    const p = pickerRef.current;
    if (!p || disabled) return;
    if (typeof p.showPicker === 'function') {
      try {
        p.showPicker();
        return;
      } catch {
        /* rơi xuống cách dự phòng */
      }
    }
    p.focus();
    p.click();
  }

  return (
    <span className={`date-field ${className}`}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        aria-invalid={invalid ? 'true' : undefined}
        onChange={onType}
        {...rest}
      />
      <button type="button" className="date-cal" onClick={openPicker} disabled={disabled} aria-label="Chọn ngày từ lịch" title="Chọn từ lịch">
        <Icon name="calendar" size={18} />
      </button>
      <input
        ref={pickerRef}
        type="date"
        className="date-native"
        tabIndex={-1}
        aria-hidden="true"
        value={value || ''}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          setText(isoToText(v));
          setInvalid(false);
          if (v !== value) onChange(v);
        }}
      />
    </span>
  );
}
