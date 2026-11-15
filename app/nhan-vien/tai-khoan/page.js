'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { drivers } from '../../../lib/site';

const roleLabel = { staff: 'Văn phòng (toàn quyền)', driver: 'Lái xe' };

export default function Page() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ email: '', role: 'driver', driver: drivers[0] || '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    setMe(u?.user?.id || '');
    const { data, error } = await supabase.from('staff_roles').select('*').order('role').order('email');
    if (error) setErr('Chưa có bảng phân quyền. Hãy chạy supabase/driver-role.sql trên Supabase.');
    else {
      setErr('');
      setRows(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function assign(email, role, driver) {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc('assign_role', { p_email: email, p_role: role, p_driver: driver || null });
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: error.message || 'Không lưu được. Vui lòng thử lại.' });
      return false;
    }
    load();
    return true;
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.email.trim()) return setMsg({ ok: false, text: 'Vui lòng nhập email tài khoản.' });
    if (await assign(form.email, form.role, form.role === 'driver' ? form.driver : null)) {
      setMsg({ ok: true, text: `Đã phân quyền ${roleLabel[form.role]} cho ${form.email.trim()}.` });
      setForm((f) => ({ ...f, email: '' }));
    }
  }

  async function revoke(r) {
    if (!window.confirm(`Thu hồi quyền của ${r.email}? Tài khoản này sẽ không xem được gì nữa.`)) return;
    if (await assign(r.email, 'none')) setMsg({ ok: true, text: `Đã thu hồi quyền của ${r.email}.` });
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <h1 style={{ fontSize: '1.8rem' }}>Tài khoản & phân quyền</h1>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.15rem' }}>Thêm hoặc đổi quyền</h2>
        <ol className="muted small" style={{ paddingLeft: 18, listStyle: 'decimal', marginBottom: 14 }}>
          <li>Tạo tài khoản trong Supabase: Authentication → Users → Add user (tick “Auto Confirm User”).</li>
          <li>Nhập email đó dưới đây và chọn vai trò. Lái xe phải chọn đúng tên để thấy chuyến của mình.</li>
        </ol>
        <form className="form" onSubmit={onSubmit} noValidate>
          <div className="grid-3" style={{ gap: 12 }}>
            <div className="field">
              <label htmlFor="a-email">Email tài khoản *</label>
              <input id="a-email" type="email" value={form.email} onChange={set('email')} autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="a-role">Vai trò</label>
              <select id="a-role" value={form.role} onChange={set('role')}>
                <option value="driver">Lái xe</option>
                <option value="staff">Văn phòng (toàn quyền)</option>
              </select>
            </div>
            {form.role === 'driver' && (
              <div className="field">
                <label htmlFor="a-driver">Tên lái xe</label>
                <select id="a-driver" value={form.driver} onChange={set('driver')}>
                  {drivers.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}
          </div>
          {msg && <p className={msg.ok ? 'ok-msg' : 'err'} role="status">{msg.text}</p>}
          <div><button className="btn btn-primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu phân quyền'}</button></div>
        </form>
      </div>

      {err && <p className="err" role="alert">{err}</p>}
      <div className="table-wrap">
        <table className="fleet-table staff-table">
          <thead><tr><th>Email</th><th>Vai trò</th><th>Tên lái xe</th><th aria-label="Thao tác"></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id}>
                <td><strong>{r.email}</strong>{r.user_id === me && <span className="muted small"> (bạn)</span>}</td>
                <td>{roleLabel[r.role]}</td>
                <td>{r.driver_name}</td>
                <td className="actions">
                  {r.user_id !== me && <button className="btn btn-danger sm" onClick={() => revoke(r)}>Thu hồi quyền</button>}
                </td>
              </tr>
            ))}
            {loading && <tr><td colSpan={4} className="muted">Đang tải...</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
