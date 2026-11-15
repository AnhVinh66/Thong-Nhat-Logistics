import PageHero from '../../components/PageHero';
import QuoteForm from '../../components/QuoteForm';
import Icon from '../../components/Icon';
import { site } from '../../lib/site';

export const metadata = {
  title: 'Yêu cầu báo giá vận chuyển',
  description: 'Gửi điểm đi, điểm đến và loại hàng để nhận báo giá vận chuyển trọn gói từ Thống Nhất Logistic.',
};

export default function Page() {
  return (
    <>
      <PageHero title="Yêu cầu báo giá" text="Điền thông tin lô hàng, chúng tôi sẽ liên hệ báo giá trọn gói trong thời gian sớm nhất." />
      <section className="section">
        <div className="container split">
          <QuoteForm />
          <aside className="aside-box">
            <h3>Cần báo giá gấp?</h3>
            <p>Gọi trực tiếp cho điều phối viên để được hỗ trợ ngay.</p>
            <a href={`tel:${site.hotline}`} className="btn btn-primary btn-lg"><Icon name="phone" size={18} /> {site.hotlineDisplay}</a>
            <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '22px 0' }} />
            <ul className="check-list">
              <li><Icon name="check" size={18} /> Phản hồi nhanh</li>
              <li><Icon name="check" size={18} /> Báo giá trọn gói, rõ ràng</li>
              <li><Icon name="check" size={18} /> Tư vấn loại xe phù hợp</li>
            </ul>
          </aside>
        </div>
      </section>
    </>
  );
}
