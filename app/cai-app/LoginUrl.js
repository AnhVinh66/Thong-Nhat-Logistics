'use client';

import { useEffect, useState } from 'react';

// Hiện đúng địa chỉ trang đăng nhập theo tên miền đang mở (không phụ thuộc biến NEXT_PUBLIC_SITE_URL)
export default function LoginUrl({ fallback }) {
  const [url, setUrl] = useState(fallback);
  useEffect(() => {
    setUrl(`${window.location.origin}/nhan-vien/`);
  }, []);
  return url;
}
