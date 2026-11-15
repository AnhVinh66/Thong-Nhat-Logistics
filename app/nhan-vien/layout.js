import StaffShell from '../../components/staff/StaffShell';

export const metadata = {
  title: 'Khu vực nhân viên',
  robots: { index: false, follow: false },
  // App cài lên màn hình chính điện thoại (PWA) – chỉ cho khu vực nhân viên
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Thống Nhất', statusBarStyle: 'black' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export default function Layout({ children }) {
  return <StaffShell>{children}</StaffShell>;
}
