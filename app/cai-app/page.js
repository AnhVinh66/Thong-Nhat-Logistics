import Link from 'next/link';
import PageHero from '../../components/PageHero';
import { site } from '../../lib/site';
import LoginUrl from './LoginUrl';

export const metadata = {
  title: 'Cài app cho nhân viên & lái xe',
  description: 'Hướng dẫn cài app Thống Nhất Logistic lên điện thoại Android và iPhone.',
  robots: { index: false, follow: false },
};

const ShareIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
  </svg>
);
const DotsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
  </svg>
);

// Minh hoạ màn hình điện thoại (vẽ bằng CSS, không phải ảnh chụp thật)
function Phone({ children, label }) {
  return (
    <figure className="phone" aria-label={label}>
      <div className="phone-screen">{children}</div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export default function Page() {
  const loginUrl = `${site.url}/nhan-vien/`;
  return (
    <>
      <PageHero
        title="Cài app lên điện thoại"
        text="Dành cho nhân viên và lái xe. Cài một lần, sau đó mở bằng biểu tượng trên màn hình chính như app bình thường. Miễn phí, không cần CH Play hay App Store."
        crumb="Cài app"
      />

      <section className="section">
        <div className="container">
          <div className="install-intro card">
            <img src="/icons/icon-192.png" alt="Biểu tượng app Thống Nhất" width="72" height="72" />
            <div>
              <p style={{ margin: 0 }}>Địa chỉ trang đăng nhập:</p>
              <p style={{ margin: '2px 0 10px', fontWeight: 800, wordBreak: 'break-all' }}><LoginUrl fallback={loginUrl} /></p>
              <Link href="/nhan-vien/" className="btn btn-primary">Mở trang đăng nhập</Link>
            </div>
          </div>

          <div className="guide-grid">
            <article className="guide card">
              <h2>Điện thoại Android</h2>
              <p className="muted">Dùng trình duyệt <strong>Chrome</strong>.</p>
              <ol className="guide-steps">
                <li>Mở <strong><LoginUrl fallback={loginUrl} /></strong> bằng Chrome.</li>
                <li>
                  Bấm nút <strong>“Cài app vào điện thoại”</strong> dưới ô đăng nhập. Nếu không thấy nút: bấm{' '}
                  <span className="kbd"><DotsIcon /></span> ở góc trên bên phải, chọn <strong>“Cài đặt ứng dụng”</strong>{' '}
                  (hoặc “Thêm vào màn hình chính”).
                </li>
                <li>Bấm <strong>Cài đặt</strong>. Biểu tượng <strong>Thống Nhất</strong> xuất hiện trên màn hình chính.</li>
              </ol>
              <div className="phones">
                <Phone label="Bước 2: menu ⋮ của Chrome">
                  <div className="ph-bar"><span className="ph-url">thongnhat.../nhan-vien</span><span className="ph-dots"><DotsIcon /></span></div>
                  <div className="ph-menu">
                    <span>Thẻ mới</span>
                    <span>Dấu trang</span>
                    <span className="hl">Cài đặt ứng dụng</span>
                    <span>Chia sẻ...</span>
                  </div>
                </Phone>
                <Phone label="Bước 3: bấm Cài đặt">
                  <div className="ph-dialog">
                    <img src="/icons/icon-192.png" alt="" width="40" height="40" />
                    <strong>Cài đặt ứng dụng?</strong>
                    <span>Thống Nhất</span>
                    <div className="ph-dialog-btns"><span>Huỷ</span><span className="hl">Cài đặt</span></div>
                  </div>
                </Phone>
              </div>
            </article>

            <article className="guide card">
              <h2>iPhone</h2>
              <p className="muted">Bắt buộc dùng <strong>Safari</strong> (không dùng Chrome hay Zalo trên iPhone).</p>
              <ol className="guide-steps">
                <li>Mở <strong><LoginUrl fallback={loginUrl} /></strong> bằng Safari. Nếu nhận link qua Zalo, bấm ⋯ rồi chọn “Mở bằng trình duyệt”.</li>
                <li>Bấm nút <span className="kbd"><ShareIcon /></span> <strong>Chia sẻ</strong> ở thanh dưới cùng.</li>
                <li>Kéo xuống, chọn <strong>“Thêm vào MH chính”</strong>, rồi bấm <strong>Thêm</strong>.</li>
              </ol>
              <div className="phones">
                <Phone label="Bước 2: nút Chia sẻ">
                  <div className="ph-page" />
                  <div className="ph-bottom"><span>‹</span><span>›</span><span className="hl-icon"><ShareIcon /></span><span>□</span><span>⧉</span></div>
                </Phone>
                <Phone label="Bước 3: Thêm vào MH chính">
                  <div className="ph-sheet">
                    <span>Sao chép</span>
                    <span>Thêm vào danh sách đọc</span>
                    <span className="hl">Thêm vào MH chính</span>
                    <span>Đánh dấu</span>
                  </div>
                </Phone>
              </div>
            </article>
          </div>

          <div className="card" style={{ marginTop: 22 }}>
            <h2 style={{ fontSize: '1.2rem' }}>Lưu ý</h2>
            <ul className="check-list">
              <li>App cần mạng (4G hoặc Wi-Fi) để xem chuyến và gửi ảnh.</li>
              <li>Đăng nhập một lần, lần sau mở app là vào thẳng, không cần nhập lại.</li>
              <li>Lần đầu bấm “Chụp biên bản”, điện thoại sẽ hỏi quyền dùng camera: chọn <strong>Cho phép</strong>.</li>
              <li>Quên mật khẩu? Liên hệ văn phòng: <a href={`tel:${site.hotline}`}>{site.hotlineDisplay}</a>.</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
