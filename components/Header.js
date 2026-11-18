'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from './Logo';
import Icon from './Icon';
import { nav, site } from '../lib/site';

export default function Header() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() || '/';
  const isActive = (href) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <header className="header">
      <div className="topbar">
        <div className="container topbar-in">
          <span>
            <Icon name="pin" size={14} /> {site.address}
          </span>
          <a href={`mailto:${site.email}`}>
            <Icon name="mail" size={14} /> {site.email}
          </a>
          <a href={`tel:${site.hotline}`} className="topbar-hot">
            <Icon name="phone" size={14} /> Hotline {site.hotlineDisplay}
          </a>
          <Link href="/nhan-vien/" className="topbar-cms">
            <Icon name="key" size={14} /> Thống Nhất CMS
          </Link>
        </div>
      </div>
      <div className="container nav-in">
        <Link href="/" aria-label={`${site.name} – trang chủ`} onClick={() => setOpen(false)}>
          <Logo />
        </Link>
        <nav id="main-nav" className={`nav ${open ? 'open' : ''}`} aria-label="Điều hướng chính">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={isActive(n.href) ? 'active' : ''}
              aria-current={isActive(n.href) ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              {n.label}
            </Link>
          ))}
          <Link href="/nhan-vien/" className="nav-cms" onClick={() => setOpen(false)}>
            <Icon name="key" size={18} /> Thống Nhất CMS – Đăng nhập
          </Link>
          <Link href="/bao-gia/" className="btn btn-primary nav-cta" onClick={() => setOpen(false)}>
            Yêu cầu báo giá
          </Link>
        </nav>
        <button
          className="menu-btn"
          aria-label={open ? 'Đóng menu' : 'Mở menu'}
          aria-expanded={open}
          aria-controls="main-nav"
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? 'close' : 'menu'} />
        </button>
      </div>
    </header>
  );
}
