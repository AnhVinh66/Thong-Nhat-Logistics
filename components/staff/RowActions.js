'use client';

import Link from 'next/link';
import Icon from '../Icon';

// Nút "⋯" xem chi tiết (mở cửa sổ hoặc chuyển trang). Sửa nằm bên trong phần xem chi tiết.
export function ViewBtn({ onClick, href, label = 'Xem chi tiết' }) {
  if (href) {
    return <Link href={href} className="row-icon" aria-label={label} title={label}><Icon name="dots" size={20} /></Link>;
  }
  return <button type="button" className="row-icon" onClick={onClick} aria-label={label} title={label}><Icon name="dots" size={20} /></button>;
}

// Nút thùng rác xoá
export function DeleteBtn({ onClick, label = 'Xoá' }) {
  return <button type="button" className="row-icon danger" onClick={onClick} aria-label={label} title={label}><Icon name="trash" size={19} /></button>;
}

// Hai nút cạnh nhau, luôn cùng vị trí (ô xoá để trống nếu không được xoá)
export default function RowActions({ view, del }) {
  return <div className="row-acts">{view}{del || <span className="row-icon-gap" aria-hidden="true" />}</div>;
}
