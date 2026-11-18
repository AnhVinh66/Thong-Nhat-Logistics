'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase, displayLogin, fmtDateTime, avatarUrl, AVATAR_BUCKET } from '../../../lib/supabase';
import { useRole, roleLabel, roleDesc } from '../../../components/staff/Role';
import { compress } from '../../../components/staff/DeliveryDocs';
import DropZone from '../../../components/staff/DropZone';
import ChangePassword from '../../../components/staff/ChangePassword';

// Thông tin cá nhân của người đang đăng nhập: ảnh đại diện, họ tên, tài khoản, đổi mật khẩu
export default function Page() {
  const { role } = useRole();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null); // { full_name, avatar_path }
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [pwOpen, setPwOpen] = useState(false);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    setUser(u?.user || null);
    if (!u?.user) return;
    const { data, error } = await supabase.from('staff_roles').select('full_name, avatar_path').eq('user_id', u.user.id).maybeSingle();
    const p = error ? { full_name: '', avatar_path: null, missing: true } : data || { full_name: '', avatar_path: null };
    setProfile(p);
    setName(p.full_name || '');
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(avatarPath, fullName = name) {
    const { error } = await supabase.rpc('update_my_profile', { p_full_name: fullName, p_avatar_path: avatarPath ?? '' });
    if (error) {
      setMsg({ ok: false, text: /update_my_profile|function/i.test(error.message || '') ? 'Chưa bật tính năng hồ sơ cá nhân. Hãy chạy supabase/profile.sql trên Supabase.' : error.message });
      return false;
    }
    window.dispatchEvent(new Event('profile-updated')); // menu trái cập nhật ảnh / tên ngay
    await load();
    return true;
  }

  async function uploadAvatar(files) {
    const file = files?.[0];
    if (!file || !user) return;
    setMsg(null);
    setBusy(true);
    try {
      const { blob, ext, type } = await compress(file);
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const up = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, { contentType: type, upsert: true });
      if (up.error) throw up.error;
      const old = profile?.avatar_path;
      if (await save(path, profile?.full_name || name)) {
        if (old && old !== path) await supabase.storage.from(AVATAR_BUCKET).remove([old]);
        setMsg({ ok: true, text: 'Đã cập nhật ảnh đại diện.' });
      } else {
        await supabase.storage.from(AVATAR_BUCKET).remove([path]);
      }
    } catch (e) {
      setMsg({ ok: false, text: /bucket|not found/i.test(e?.message || '') ? 'Chưa có kho ảnh đại diện. Hãy chạy supabase/profile.sql trên Supabase.' : 'Không tải được ảnh lên (ảnh tối đa 2 MB, định dạng JPG/PNG/WebP).' });
    }
    setBusy(false);
  }

  async function removeAvatar() {
    if (!profile?.avatar_path || !window.confirm('Bỏ ảnh đại diện?')) return;
    setBusy(true);
    const old = profile.avatar_path;
    if (await save('', profile.full_name || name)) {
      await supabase.storage.from(AVATAR_BUCKET).remove([old]);
      setMsg({ ok: true, text: 'Đã bỏ ảnh đại diện.' });
    }
    setBusy(false);
  }

  async function saveName(e) {
    e.preventDefault();
    setMsg(null);
    if (!name.trim()) return setMsg({ ok: false, text: 'Vui lòng nhập họ tên.' });
    setBusy(true);
    if (await save(profile?.avatar_path || '', name.trim())) setMsg({ ok: true, text: 'Đã lưu họ tên.' });
    setBusy(false);
  }

  const login = user ? displayLogin(user.email) : '';
  const shownName = profile?.full_name || login;
  const isDriver = role === 'driver';
  const url = avatarUrl(profile?.avatar_path);

  return (
    <>
      <h1 style={{ fontSize: '1.8rem' }}>Thông tin cá nhân</h1>
      {msg && <p className={msg.ok ? 'ok-msg' : 'err'} role="status">{msg.text}</p>}

      <div className="pf">
        <section className="pf-card pf-avatar-card">
          <div className="pf-avatar">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {url ? <img src={url} alt={`Ảnh đại diện của ${shownName}`} /> : <span aria-hidden="true">{(shownName[0] || '?').toUpperCase()}</span>}
          </div>
          <strong className="pf-name">{shownName || '...'}</strong>
          <span className="pf-role">{roleLabel[role] || ''}</span>
          <DropZone id="pf-avatar" multiple={false} disabled={busy} onFiles={uploadAvatar} label={busy ? 'Đang tải ảnh...' : 'Đổi ảnh đại diện'} hint="Bấm chọn hoặc kéo thả ảnh (tối đa 2 MB)" wide />
          {profile?.avatar_path && <button type="button" className="link-btn" onClick={removeAvatar} disabled={busy}>Bỏ ảnh đại diện</button>}
        </section>

        <section className="pf-card">
          <h2 className="pf-h">Thông tin tài khoản</h2>
          <form className="form" onSubmit={saveName} noValidate>
            <div className="field">
              <label htmlFor="pf-name">Họ tên</label>
              <input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} disabled={isDriver} placeholder="VD: Nguyễn Văn A" />
              {isDriver && <p className="muted small" style={{ margin: 0 }}>Tên lái xe gắn với các chuyến đã giao, nhờ Admin đổi ở trang Tài khoản.</p>}
            </div>
            <dl className="pf-dl">
              <div><dt>Tên đăng nhập</dt><dd>{login}</dd></div>
              <div><dt>Vai trò</dt><dd>{roleLabel[role] || '—'}<span className="muted small" style={{ display: 'block' }}>{roleDesc[role] || ''}</span></dd></div>
              <div><dt>Ngày tạo tài khoản</dt><dd>{user ? fmtDateTime(user.created_at) : '—'}</dd></div>
              <div><dt>Đăng nhập gần nhất</dt><dd>{user?.last_sign_in_at ? fmtDateTime(user.last_sign_in_at) : '—'}</dd></div>
            </dl>
            <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
              {!isDriver && <button className="btn btn-primary" disabled={busy}>Lưu họ tên</button>}
              <button type="button" className="btn btn-outline" onClick={() => setPwOpen(true)}>Đổi mật khẩu</button>
            </div>
          </form>
        </section>
      </div>

      {pwOpen && user && <ChangePassword email={user.email} onClose={() => setPwOpen(false)} />}
    </>
  );
}
