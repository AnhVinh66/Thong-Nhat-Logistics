'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import Modal from './Modal';

// Người dùng tự đổi mật khẩu của chính mình: xác nhận mật khẩu hiện tại rồi đặt mật khẩu mới
export default function ChangePassword({ email, onClose }) {
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!cur || !pw || !pw2) return setErr('Vui lòng nhập đủ mật khẩu hiện tại và mật khẩu mới.');
    if (pw.length < 6) return setErr('Mật khẩu mới phải có ít nhất 6 ký tự.');
    if (pw !== pw2) return setErr('Hai lần nhập mật khẩu mới không giống nhau.');
    if (pw === cur) return setErr('Mật khẩu mới phải khác mật khẩu hiện tại.');
    setBusy(true);
    // Kiểm tra mật khẩu hiện tại để người khác cầm máy không tự đổi được
    const check = await supabase.auth.signInWithPassword({ email, password: cur });
    if (check.error) {
      setBusy(false);
      return setErr(check.error.status === 400 || check.error.status === 401 ? 'Mật khẩu hiện tại không đúng.' : 'Không kết nối được máy chủ. Vui lòng thử lại.');
    }
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      return setErr(/weak|short|length/i.test(error.message || '') ? 'Mật khẩu mới quá yếu, hãy dùng mật khẩu dài hơn.' : 'Không đổi được mật khẩu. Vui lòng thử lại.');
    }
    setDone(true);
  }

  return (
    <Modal title="Đổi mật khẩu" onClose={onClose} width={460}>
      {done ? (
        <div className="form">
          <p className="ok-msg" role="status" style={{ margin: 0 }}>Đã đổi mật khẩu. Lần đăng nhập sau hãy dùng mật khẩu mới.</p>
          <div className="modal-actions"><button className="btn btn-primary" onClick={onClose}>Xong</button></div>
        </div>
      ) : (
        <form className="form" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="cp-cur">Mật khẩu hiện tại</label>
            <input id="cp-cur" type={show ? 'text' : 'password'} autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="cp-new">Mật khẩu mới <span className="muted small">(ít nhất 6 ký tự)</span></label>
            <input id="cp-new" type={show ? 'text' : 'password'} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="cp-new2">Nhập lại mật khẩu mới</label>
            <input id="cp-new2" type={show ? 'text' : 'password'} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </div>
          <label className="check-inline"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Hiện mật khẩu</label>
          {err && <p className="err" role="alert" style={{ margin: 0 }}>{err}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={onClose}>Huỷ</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Đang đổi...' : 'Đổi mật khẩu'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
