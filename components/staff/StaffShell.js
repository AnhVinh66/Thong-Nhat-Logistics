'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase, LOGIN_DOMAIN, displayLogin } from '../../lib/supabase';
import Logo from '../Logo';
import Icon from '../Icon';
import DriverApp from './DriverApp';
import InstallApp, { useServiceWorker } from './InstallApp';
import { RoleProvider, canView, roleLabel } from './Role';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    // Cho phép gõ tên đăng nhập (VD "trang") thay cho email
    const id = email.trim().toLowerCase();
    const loginEmail = id.includes('@') ? id : `${id}@${LOGIN_DOMAIN}`;
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
    setBusy(false);
    if (error) setErr(error.status === 400 || error.status === 401 ? 'Tên đăng nhập hoặc mật khẩu không đúng.' : 'Không kết nối được máy chủ. Vui lòng thử lại.');
  }

  return (
    <div className="login-wrap">
      <form className="login-card form" onSubmit={onSubmit}>
        <Logo />
        <h1 style={{ fontSize: '1.5rem', marginTop: 14 }}>Đăng nhập nhân viên</h1>
        <div className="field">
          <label htmlFor="l-email">Tên đăng nhập</label>
          <input id="l-email" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="VD: trang (hoặc email)" />
        </div>
        <div className="field">
          <label htmlFor="l-pass">Mật khẩu</label>
          <input id="l-pass" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
        <p className="muted small">Khu vực dành riêng cho nhân viên. Liên hệ quản lý nếu cần tài khoản.</p>
        <InstallApp />
      </form>
    </div>
  );
}

export default function StaffShell({ children }) {
  const [session, setSession] = useState(undefined); // undefined = đang kiểm tra
  useServiceWorker();
  const pathname = usePathname() || '';

  useEffect(() => {
    if (!supabase) {
      setSession(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Vai trò của tài khoản: undefined = đang kiểm tra, null = chưa được phân quyền
  const [role, setRole] = useState(undefined);
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) {
      setRole(undefined);
      return;
    }
    supabase
      .from('staff_roles')
      .select('role, driver_name')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        // Chưa chạy driver-role.sql (chưa có bảng) -> giữ cách cũ: mọi tài khoản là văn phòng
        if (error) setRole({ role: 'staff' });
        else setRole(data || null);
      });
  }, [userId]);

  if (!supabase) {
    return (
      <div className="login-wrap">
        <div className="login-card notice">
          <h1 style={{ fontSize: '1.4rem' }}>Chưa cấu hình cơ sở dữ liệu</h1>
          <p>
            Cần đặt <code>NEXT_PUBLIC_SUPABASE_URL</code> và <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
            Xem hướng dẫn trong README.
          </p>
        </div>
      </div>
    );
  }
  if (session === undefined) return <div className="login-wrap"><p className="muted">Đang tải...</p></div>;
  if (!session) return <Login />;
  if (role === undefined) return <div className="login-wrap"><p className="muted">Đang tải...</p></div>;

  if (role === null) {
    return (
      <div className="login-wrap">
        <div className="login-card notice">
          <h1 style={{ fontSize: '1.4rem' }}>Tài khoản chưa được phân quyền</h1>
          <p>Tài khoản <strong>{displayLogin(session.user.email)}</strong> chưa được cấp quyền. Vui lòng báo văn phòng phân quyền ở mục Tài khoản.</p>
          <button className="btn btn-outline" onClick={() => supabase.auth.signOut()}>Đăng xuất</button>
        </div>
      </div>
    );
  }

  if (role.role === 'driver') {
    return <DriverApp driverName={role.driver_name} email={session.user.email} onLogout={() => supabase.auth.signOut()} />;
  }

  const r = role.role;
  return (
    <RoleProvider role={r} userId={userId}>
      <AdminLayout role={r} pathname={pathname} login={displayLogin(session.user.email)} onLogout={() => supabase.auth.signOut()}>
        {canView(r, pathname) ? children : (
          <div className="card">
            <h1 style={{ fontSize: '1.4rem' }}>Bạn không có quyền truy cập mục này</h1>
            <p className="muted">Vai trò hiện tại: <strong>{roleLabel[r]}</strong>. Liên hệ Quản trị nếu cần thêm quyền.</p>
            <Link href="/nhan-vien/" className="btn btn-primary">Về Tổng quan</Link>
          </div>
        )}
      </AdminLayout>
    </RoleProvider>
  );
}

const sections = [
  {
    title: 'Điều phối',
    links: [
      { href: '/nhan-vien/', label: 'Tổng quan', icon: 'grid' },
      { href: '/nhan-vien/don-hang/', label: 'Đơn hàng', icon: 'route' },
      { href: '/nhan-vien/ke-hoach/', label: 'Kế hoạch chạy xe', icon: 'calendar' },
    ],
  },
  {
    title: 'Tài chính',
    links: [
      { href: '/nhan-vien/thu-tien/', label: 'Thu tiền', icon: 'money' },
      { href: '/nhan-vien/chi-tien/', label: 'Chi tiền', icon: 'out' },
      { href: '/nhan-vien/ngan-hang/', label: 'Giao dịch ngân hàng', icon: 'bank' },
    ],
  },
  {
    title: 'Dữ liệu',
    links: [
      { href: '/nhan-vien/khach-hang/', label: 'Khách hàng', icon: 'users' },
      { href: '/nhan-vien/xe/', label: 'Danh sách xe', icon: 'truck' },
      { href: '/nhan-vien/lai-xe/', label: 'Lái xe', icon: 'wheel' },
    ],
  },
  {
    title: 'Hệ thống',
    links: [{ href: '/nhan-vien/tai-khoan/', label: 'Tài khoản', icon: 'key' }],
  },
];

// Bố cục quản trị: menu cố định bên trái (máy tính), thu gọn thành nút ☰ (điện thoại)
// Giao diện Sáng / Tối do người dùng chọn, nhớ trên máy này
const THEME_KEY = 'tn-cms-theme';
function useTheme() {
  const [theme, setTheme] = useState('light');
  useEffect(() => {
    try { if (localStorage.getItem(THEME_KEY) === 'dark') setTheme('dark'); } catch {}
  }, []);
  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'dark') el.setAttribute('data-theme', 'dark');
    else el.removeAttribute('data-theme');
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    return () => el.removeAttribute('data-theme'); // ra khỏi CMS (đăng xuất) thì về giao diện thường
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

function AdminLayout({ role, pathname, login, onLogout, children }) {
  const [open, setOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const isActive = (h) => (h === '/nhan-vien/' ? pathname.replace(/\/$/, '') === '/nhan-vien' : pathname.startsWith(h));
  const visible = sections
    .map((s) => ({ ...s, links: s.links.filter((l) => canView(role, l.href)) }))
    .filter((s) => s.links.length);
  const current = sections.flatMap((s) => s.links).find((l) => isActive(l.href));

  // Đóng menu khi chuyển trang hoặc bấm Esc
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="admin">
      <aside id="admin-side" className={`side ${open ? 'open' : ''}`} aria-label="Menu quản trị">
        <div className="side-brand">
          <Link href="/nhan-vien/" aria-label="Tổng quan"><Logo light /></Link>
          <button className="side-close" onClick={() => setOpen(false)} aria-label="Đóng menu"><Icon name="close" size={22} /></button>
        </div>
        <nav className="side-nav">
          {visible.map((s) => (
            <div className="side-group" key={s.title}>
              <p className="side-title">{s.title}</p>
              {s.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`side-link ${isActive(l.href) ? 'active' : ''}`}
                  aria-current={isActive(l.href) ? 'page' : undefined}
                >
                  <Icon name={l.icon} size={20} />
                  <span>{l.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <a className="side-link" href="/" target="_blank" rel="noopener noreferrer">
            <Icon name="external" size={20} /><span>Xem website</span>
          </a>
          <div className="side-user">
            <span className="side-avatar" aria-hidden="true">{(login[0] || '?').toUpperCase()}</span>
            <span className="side-login" title={login}>{login}<small className="side-role">{roleLabel[role]}</small></span>
          </div>
          <button
            type="button"
            className="side-link side-theme"
            role="switch"
            aria-checked={theme === 'dark'}
            onClick={toggleTheme}
            title="Bật / tắt giao diện tối"
          >
            <Icon name="moon" size={20} />
            <span>Dark mode</span>
            <span className={`theme-switch ${theme === 'dark' ? 'on' : ''}`} aria-hidden="true"><span /></span>
          </button>
          <button className="side-link side-logout" onClick={onLogout}>
            <Icon name="logout" size={20} /><span>Đăng xuất</span>
          </button>
        </div>
      </aside>
      {open && <div className="side-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className="admin-main">
        <header className="admin-top">
          <button className="admin-burger" onClick={() => setOpen(true)} aria-label="Mở menu" aria-expanded={open} aria-controls="admin-side">
            <Icon name="menu" size={22} />
          </button>
          <span className="admin-top-title">{current?.label || 'Nhân viên'}</span>
        </header>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
