'use client';

import { usePathname } from 'next/navigation';

// Ẩn header/footer công khai trong khu vực nhân viên
export default function PublicOnly({ children }) {
  const pathname = usePathname() || '';
  if (pathname.startsWith('/nhan-vien')) return null;
  return children;
}
