'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { expenseTypes, expenseTypeHints, needsVehicle } from '../../lib/supabase';
import { norm } from '../../lib/bank';

// Chọn loại yêu cầu chi: một ô duy nhất, bấm vào mở pop up gợi ý các loại chi (có tìm kiếm, dùng được bàn phím)
export default function TypePicker({ id, value, onChange, 'aria-labelledby': labelledBy }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const searchRef = useRef(null);
  const triggerRef = useRef(null);

  const items = useMemo(() => {
    const s = norm(q);
    return Object.entries(expenseTypes).filter(([k, label]) => !s || norm(`${label} ${expenseTypeHints[k]}`).includes(s));
  }, [q]);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, items.findIndex(([k]) => k === value)));
    searchRef.current?.focus();
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (active >= items.length) setActive(Math.max(0, items.length - 1));
  }, [items, active]);

  function choose(k) {
    onChange(k);
    setOpen(false);
    setQ('');
    triggerRef.current?.focus();
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      // Chỉ đóng pop up, không đóng cả form: cửa sổ form cũng nghe phím Esc trên cùng một nơi nên cần chặn cả các bộ lắng nghe còn lại
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation?.();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[active]) choose(items[active][0]);
    }
  }

  const label = value ? expenseTypes[value] : '';

  return (
    <div className="tp" ref={wrapRef}>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className={`tp-trigger ${value ? '' : 'empty'}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelledBy}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span>{label || 'Chọn loại yêu cầu chi'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="tp-pop" onKeyDown={onKey}>
          <input
            ref={searchRef}
            className="tp-search"
            type="text"
            placeholder="Tìm loại chi (VD: xăng, lương, điện...)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Tìm loại chi"
            autoComplete="off"
          />
          <ul className="tp-list" role="listbox" aria-label="Các loại yêu cầu chi">
            {items.map(([k, text], i) => (
              <li
                key={k}
                role="option"
                aria-selected={value === k}
                className={`${i === active ? 'active' : ''} ${value === k ? 'chosen' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(k)}
              >
                <span className="tp-main">
                  <strong>{text}</strong>
                  <small>{expenseTypeHints[k]}</small>
                </span>
                {needsVehicle(k) && <span className="tp-tag">Chọn xe</span>}
                {value === k && <span className="tp-check" aria-hidden="true">✓</span>}
              </li>
            ))}
            {items.length === 0 && <li className="tp-none" role="presentation">Không có loại chi nào khớp. Hãy chọn “Chi phí khác”.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
