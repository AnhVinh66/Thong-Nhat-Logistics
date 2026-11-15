'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase, LOGIN_DOMAIN, displayLogin } from '../../lib/supabase';
import Logo from '../Logo';
import DriverApp from './DriverApp';

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
      </form>
    </div>
  );
}

export default function StaffShell({ children }) {
  const [session, setSession] = useState(undefined); // undefined = đang kiểm tra
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

  const links = [
    { href: '/nhan-vien/', label: 'Tổng quan' },
    { href: '/nhan-vien/khach-hang/', label: 'Khách hàng' },
    { href: '/nhan-vien/don-hang/', label: 'Đơn hàng' },
    { href: '/nhan-vien/xe/', label: 'Danh sách xe' },
    { href: '/nhan-vien/tai-khoan/', label: 'Tài khoản' },
  ];
  const active = (h) => (h === '/nhan-vien/' ? pathname.replace(/\/$/, '') === '/nhan-vien' : pathname.startsWith(h));

  return (
    <div className="staff">
      <header className="staff-bar">
        <div className="container staff-bar-in">
          <Link href="/nhan-vien/" aria-label="Trang nhân viên"><Logo light /></Link>
          <nav className="staff-nav" aria-label="Điều hướng nhân viên">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className={active(l.href) ? 'active' : ''} aria-current={active(l.href) ? 'page' : undefined}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="staff-user">
            <span className="small">{displayLogin(session.user.email)}</span>
            <button className="btn btn-ghost" style={{ minHeight: 38, padding: '6px 14px' }} onClick={() => supabase.auth.signOut()}>
              Đăng xuất
            </button>
          </div>
        </div>
      </header>
      <div className="container staff-main">{children}</div>
    </div>
  );
}
