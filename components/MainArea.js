'use client';

import { usePathname } from 'next/navigation';

// Gắn class "site" cho các trang công khai để kiểu dáng website không ảnh hưởng Thống Nhất CMS
export default function MainArea({ children }) {
  const pathname = usePathname() || '';
  const staff = pathname.startsWith('/nhan-vien');
  return <main id="main" className={staff ? undefined : 'site'}>{children}</main>;
}
