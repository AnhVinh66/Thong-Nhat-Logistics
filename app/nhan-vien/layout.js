import StaffShell from '../../components/staff/StaffShell';

export const metadata = {
  // Mỗi mục có file layout.js riêng đặt tiêu đề: "<Tên mục> | Thống Nhất CMS". Mục mới: thêm layout.js tương tự.
  title: { absolute: 'Tổng quan | Thống Nhất CMS', template: '%s | Thống Nhất CMS' },
  robots: { index: false, follow: false },
  // App cài lên màn hình chính điện thoại (PWA) – chỉ cho khu vực nhân viên
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Thống Nhất', statusBarStyle: 'black' },
  // Logo Thống Nhất trên tab trình duyệt và màn hình chính điện thoại
  icons: {
    icon: [{ url: '/icons/tn-icon-192.png', sizes: '192x192', type: 'image/png' }],
    shortcut: '/icons/tn-icon-192.png',
    apple: '/icons/tn-apple-touch-icon.png',
  },
};

export default function Layout({ children }) {
  return <StaffShell>{children}</StaffShell>;
}
