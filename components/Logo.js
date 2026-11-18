// Logo Thống Nhất (ảnh gốc của công ty). light = đặt trên nền tối: logo nằm trong khung trắng bo góc.
export default function Logo({ light = false }) {
  return (
    <span className={`logo ${light ? 'logo-light' : ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="logo-img" src="/logo.png" alt="Thống Nhất Việt Nam" width="340" height="244" />
    </span>
  );
}
