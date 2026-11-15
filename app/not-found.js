import Link from 'next/link';

export const metadata = { title: 'Không tìm thấy trang' };

export default function NotFound() {
  return (
    <section className="section">
      <div className="container" style={{ textAlign: 'center' }}>
        <p className="eyebrow">Lỗi 404</p>
        <h1>Trang bạn tìm không tồn tại</h1>
        <p className="muted">Có thể đường dẫn đã thay đổi. Hãy quay lại trang chủ hoặc gọi hotline để được hỗ trợ.</p>
        <Link href="/" className="btn btn-primary">Về trang chủ</Link>
      </div>
    </section>
  );
}
