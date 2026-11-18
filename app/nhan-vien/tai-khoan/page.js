'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase, displayLogin, fmtDateTime } from '../../../lib/supabase';
import Modal from '../../../components/staff/Modal';
import RowActions, { ViewBtn, DeleteBtn } from '../../../components/staff/RowActions';
import { roleLabel, roleDesc } from '../../../components/staff/Role';

const ROLE_OPTIONS = ['sales', 'accountant', 'dispatcher', 'driver', 'staff'];
const blank = { name: '', username: '', password: '', role: 'driver' };

// Gợi ý tên đăng nhập từ họ tên: "Nguyễn Thế Trang" -> "trang"
const suggestUsername = (name) =>
  (name.trim().split(/\s+/).pop() || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');

export default function Page() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [form, setForm] = useState(blank);
  const [userTouched, setUserTouched] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState('');
  const [editing, setEditing] = useState(null); // { user_id, name, role, password }
  const [editMsg, setEditMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    setMe(u?.user?.id || '');
    const { data, error } = await supabase.rpc('list_staff_users');
    if (error) setErr('Chưa bật tính năng tạo tài khoản. Hãy chạy supabase/simple-users.sql trên Supabase.');
    else {
      setErr('');
      setRows(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === 'name' && !userTouched) next.username = suggestUsername(v);
      return next;
    });
    if (k === 'username') setUserTouched(true);
  };

  async function create(e) {
    e.preventDefault();
    setMsg(null);
    if (!form.name.trim() || !form.username.trim() || !form.password) {
      return setMsg({ ok: false, text: 'Vui lòng nhập họ tên, tên đăng nhập và mật khẩu.' });
    }
    setBusy(true);
    const { error } = await supabase.rpc('create_staff_user', {
      p_username: form.username, p_password: form.password, p_role: form.role, p_name: form.name,
    });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message || 'Không tạo được tài khoản.' });
    setMsg({
      ok: true,
      text: `Đã tạo tài khoản ${roleLabel[form.role]}: đăng nhập "${form.username.trim().toLowerCase()}", mật khẩu "${form.password}". Hãy gửi thông tin này cho ${form.name.trim()}.`,
    });
    setForm(blank);
    setUserTouched(false);
    load();
  }

  async function saveEdit(e) {
    e.preventDefault();
    setEditMsg(null);
    setBusy(true);
    const r = editing;
    const up = await supabase.rpc('update_staff_user', { p_user_id: r.user_id, p_role: r.role, p_name: r.name });
    if (up.error) {
      setBusy(false);
      return setEditMsg({ ok: false, text: up.error.message });
    }
    if (r.password) {
      const pw = await supabase.rpc('set_staff_password', { p_user_id: r.user_id, p_password: r.password });
      if (pw.error) {
        setBusy(false);
        return setEditMsg({ ok: false, text: pw.error.message });
      }
    }
    setBusy(false);
    setEditing(null);
    setMsg({ ok: true, text: r.password ? `Đã lưu. Mật khẩu mới: "${r.password}".` : 'Đã lưu thay đổi.' });
    load();
  }

  async function remove(r) {
    const who = r.full_name || displayLogin(r.email);
    if (!window.confirm(`Xoá hẳn tài khoản của ${who}? Người này sẽ không đăng nhập được nữa. Thao tác không thể hoàn tác.`)) return;
    const { error } = await supabase.rpc('delete_staff_user', { p_user_id: r.user_id });
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: `Đã xoá tài khoản của ${who}.` });
    load();
  }

  return (
    <>
      <h1 style={{ fontSize: '1.8rem' }}>Tài khoản</h1>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.15rem' }}>Tạo tài khoản mới</h2>
        <form className="form" onSubmit={create} noValidate>
          <div className="grid-4" style={{ gap: 12 }}>
            <div className="field">
              <label htmlFor="n-name">Họ tên *</label>
              <input id="n-name" value={form.name} onChange={set('name')} placeholder="VD: Nguyễn Thế Trang" autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="n-user">Tên đăng nhập *</label>
              <input id="n-user" value={form.username} onChange={set('username')} placeholder="VD: trang"
                autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="n-pass">Mật khẩu * <span className="muted small" style={{ color: 'var(--muted)' }}>(ít nhất 6 ký tự)</span></label>
              <input id="n-pass" type="text" value={form.password} onChange={set('password')} autoComplete="new-password" />
            </div>
            <div className="field">
              <label htmlFor="n-role">Vai trò</label>
              <select id="n-role" value={form.role} onChange={set('role')}>
                {ROLE_OPTIONS.map((k) => <option key={k} value={k}>{roleLabel[k]}</option>)}
              </select>
            </div>
          </div>
          <p className="muted small" style={{ margin: 0 }}>{roleDesc[form.role]}.</p>
          {msg && <p className={msg.ok ? 'ok-msg' : 'err'} role="status">{msg.text}</p>}
          <div><button className="btn btn-primary" disabled={busy}>{busy ? 'Đang tạo...' : 'Tạo tài khoản'}</button></div>
        </form>
      </div>

      {err && <p className="err" role="alert">{err}</p>}
      <div className="table-wrap">
        <table className="fleet-table staff-table">
          <thead>
            <tr><th>Họ tên</th><th>Tên đăng nhập</th><th>Vai trò</th><th>Đăng nhập gần nhất</th><th aria-label="Thao tác"></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id}>
                <td><strong>{r.full_name || '—'}</strong>{r.user_id === me && <span className="muted small"> (bạn)</span>}</td>
                <td>{displayLogin(r.email)}</td>
                <td>{r.role ? roleLabel[r.role] : <span className="err" style={{ fontSize: '.9rem' }}>Chưa phân quyền</span>}</td>
                <td className="muted small">{r.last_sign_in_at ? fmtDateTime(r.last_sign_in_at) : 'Chưa đăng nhập'}</td>
                <td className="actions">
                  <RowActions
                    view={<ViewBtn label={`Xem / sửa tài khoản ${displayLogin(r.email)}`} onClick={() => {
                      setEditMsg(null);
                      setEditing({ user_id: r.user_id, name: r.full_name || '', role: r.role || 'driver', password: '', login: displayLogin(r.email), self: r.user_id === me });
                    }} />}
                    del={r.user_id !== me && <DeleteBtn onClick={() => remove(r)} label={`Xoá tài khoản ${displayLogin(r.email)}`} />}
                  />
                </td>
              </tr>
            ))}
            {loading && <tr><td colSpan={5} className="muted">Đang tải...</td></tr>}
            {!loading && !rows.length && !err && <tr><td colSpan={5} className="muted">Chưa có tài khoản nào.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={`Sửa tài khoản: ${editing.login}`} onClose={() => setEditing(null)}>
          <form className="form" onSubmit={saveEdit} noValidate>
            <div className="field">
              <label htmlFor="e-name">Họ tên</label>
              <input id="e-name" value={editing.name} onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))} />
              {editing.role === 'driver' && <p className="muted small" style={{ margin: 0 }}>Đổi tên lái xe sẽ tự cập nhật các đơn đã giao cho người này.</p>}
            </div>
            <div className="field">
              <label htmlFor="e-role">Vai trò</label>
              <select id="e-role" value={editing.role} disabled={editing.self} onChange={(e) => setEditing((s) => ({ ...s, role: e.target.value }))}>
                {ROLE_OPTIONS.map((k) => <option key={k} value={k}>{roleLabel[k]}</option>)}
                <option value="none">Thu hồi quyền (không xem được gì)</option>
              </select>
              <p className="muted small" style={{ margin: '4px 0 0' }}>{roleDesc[editing.role]}.</p>
            </div>
            <div className="field">
              <label htmlFor="e-pass">Mật khẩu mới <span className="muted small" style={{ color: 'var(--muted)' }}>(để trống nếu không đổi)</span></label>
              <input id="e-pass" type="text" value={editing.password} autoComplete="new-password"
                onChange={(e) => setEditing((s) => ({ ...s, password: e.target.value }))} />
            </div>
            {editMsg && <p className={editMsg.ok ? 'ok-msg' : 'err'} role="alert">{editMsg.text}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>Huỷ</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
