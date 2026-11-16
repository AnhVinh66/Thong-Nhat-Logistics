'use client';

import { useLayoutEffect, useRef } from 'react';
import { commas } from '../../lib/supabase';

// Ô nhập tiền: tự thêm dấu phẩy sau mỗi 3 chữ số khi gõ (1,234,567). value là chuỗi chỉ gồm chữ số.
export default function MoneyInput({ value, onChange, className = '', ...rest }) {
  const ref = useRef(null);
  const caret = useRef(null); // số chữ số nằm bên trái con trỏ sau lần gõ gần nhất

  const display = value === '' ? '' : commas(value);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || caret.current === null || document.activeElement !== el) return;
    let digits = 0;
    let pos = 0;
    while (pos < display.length && digits < caret.current) {
      if (/\d/.test(display[pos])) digits++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
    caret.current = null;
  }, [display]);

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={className}
      value={display}
      onChange={(e) => {
        const raw = e.target.value;
        const before = raw.slice(0, e.target.selectionStart ?? raw.length);
        caret.current = before.replace(/\D/g, '').length;
        const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 13);
        onChange(digits);
      }}
      {...rest}
    />
  );
}
