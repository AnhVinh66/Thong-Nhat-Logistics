'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// Đăng ký service worker (cần để Android cho phép cài app và để có trang báo mất mạng)
export function useServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/nhan-vien/' }).catch(() => {});
  }, []);
}

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// Nút "Cài app": Android/Chrome hiện hộp thoại cài; iPhone hiện hướng dẫn ngắn. Đã cài thì không hiện gì.
export default function InstallApp({ compact = false }) {
  const [deferred, setDeferred] = useState(null);
  const [mode, setMode] = useState('hidden'); // hidden | prompt | ios | other
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    setMode(isIOS() ? 'ios' : 'other');
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
      setMode('prompt');
    };
    const onInstalled = () => {
      setDone(true);
      setMode('hidden');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (done) return <p className="ok-msg" role="status">Đã cài app. Lần sau mở bằng biểu tượng Thống Nhất trên màn hình chính.</p>;
  if (mode === 'hidden') return null;

  if (mode === 'prompt') {
    return (
      <div className={`install ${compact ? 'compact' : ''}`}>
        <button
          type="button"
          className="btn btn-outline install-btn"
          onClick={async () => {
            deferred.prompt();
            const { outcome } = await deferred.userChoice;
            if (outcome === 'accepted') setDone(true);
            setDeferred(null);
            setMode('other');
          }}
        >
          <img src="/icons/tn-icon-192.png" alt="" width="24" height="24" /> Cài app vào điện thoại
        </button>
      </div>
    );
  }

  if (mode === 'ios') {
    return (
      <div className={`install ${compact ? 'compact' : ''}`}>
        <p className="install-hint">
          <strong>Cài app trên iPhone:</strong> mở trang này bằng <strong>Safari</strong>, bấm nút{' '}
          <span className="ios-share" aria-label="Chia sẻ">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>
          </span>{' '}
          (Chia sẻ) rồi chọn <strong>“Thêm vào MH chính”</strong>.
        </p>
        <Link href="/cai-app/" className="small">Xem hướng dẫn có hình</Link>
      </div>
    );
  }

  // Trình duyệt chưa hỗ trợ hộp thoại cài (hoặc chưa sẵn sàng): chỉ đưa link hướng dẫn
  return (
    <div className={`install ${compact ? 'compact' : ''}`}>
      <Link href="/cai-app/" className="small">Hướng dẫn cài app lên điện thoại</Link>
    </div>
  );
}
