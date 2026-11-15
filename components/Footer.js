import Link from 'next/link';
import Logo from './Logo';
import Icon from './Icon';
import { nav, site, services } from '../lib/site';

export default function Footer() {
  return (
    <>
      <footer className="footer">
        <div className="container footer-grid">
          <div>
            <Logo light />
            <p className="footer-about">
              {site.name} – vận chuyển hàng hoá nội địa đường bộ bằng xe tải. {site.slogan}.
            </p>
          </div>
          <div>
            <h3>Dịch vụ</h3>
            <ul>
              {services.slice(0, 5).map((s) => (
                <li key={s.title}>
                  <Link href="/dich-vu/">{s.title}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Liên kết</h3>
            <ul>
              {nav.map((n) => (
                <li key={n.href}>
                  <Link href={n.href}>{n.label}</Link>
                </li>
              ))}
              <li>
                <Link href="/bao-gia/">Yêu cầu báo giá</Link>
              </li>
            </ul>
          </div>
          <div>
            <h3>Liên hệ</h3>
            <ul className="contact-list">
              <li>
                <Icon name="phone" size={16} /> <a href={`tel:${site.hotline}`}>{site.hotlineDisplay}</a>
              </li>
              <li>
                <Icon name="mail" size={16} /> <a href={`mailto:${site.email}`}>{site.email}</a>
              </li>
              <li>
                <Icon name="pin" size={16} /> {site.address}
              </li>
              <li>
                <Icon name="clock" size={16} /> {site.workingHours}
              </li>
            </ul>
          </div>
        </div>
        <div className="container footer-bottom">
          © {new Date().getFullYear()} {site.name}. Thành lập năm {site.founded}. Bảo lưu mọi quyền. · <Link href="/nhan-vien/">Nhân viên</Link>
        </div>
      </footer>

      <div className="mobile-bar">
        <a href={`tel:${site.hotline}`} className="mb-call">
          <Icon name="phone" size={18} /> Gọi ngay
        </a>
        <a href={`https://zalo.me/${site.zalo}`} className="mb-zalo" target="_blank" rel="noopener noreferrer">
          Zalo
        </a>
        <Link href="/bao-gia/" className="mb-quote">
          Báo giá
        </Link>
      </div>
    </>
  );
}
