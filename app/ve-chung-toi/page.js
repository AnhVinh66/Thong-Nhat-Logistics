import Link from 'next/link';
import PageHero from '../../components/PageHero';
import Icon from '../../components/Icon';
import { site, whyUs } from '../../lib/site';

export const metadata = {
  title: 'Về chúng tôi',
  description: `${site.name} thành lập năm ${site.founded}, chuyên vận chuyển hàng hoá nội địa đường bộ bằng xe tải.`,
};

export default function Page() {
  return (
    <>
      <PageHero title="Về Thống Nhất Logistic" text={`Thành lập năm ${site.founded}, trụ sở tại ${site.address}.`} crumb="Về chúng tôi" />
      <section className="section">
        <div className="container split">
          <div>
            <p className="eyebrow">Câu chuyện</p>
            <h2>Kết nối hàng hoá trên khắp mọi miền</h2>
            <p>
              {site.name} là doanh nghiệp vận tải đường bộ trẻ, hoạt động từ năm {site.founded}. Chúng tôi tập trung
              vào một việc: đưa hàng hoá của khách hàng đến đích đúng hẹn, nguyên vẹn và với chi phí minh bạch.
            </p>
            <p>
              Với đội xe tải đa dạng tải trọng cùng đội ngũ điều phối làm việc 24/7, chúng tôi phục vụ cả
              doanh nghiệp sản xuất, thương mại lẫn khách hàng cá nhân có nhu cầu vận chuyển liên tỉnh.
            </p>
            <h3>Giá trị cốt lõi</h3>
            <ul className="check-list">
              <li><Icon name="check" size={18} /> <span><strong>Tin cậy:</strong> nói được làm được, đúng cam kết về thời gian và giá.</span></li>
              <li><Icon name="check" size={18} /> <span><strong>An toàn:</strong> hàng hoá và con người luôn được đặt lên hàng đầu.</span></li>
              <li><Icon name="check" size={18} /> <span><strong>Minh bạch:</strong> báo giá rõ ràng, thông tin chuyến hàng cập nhật chủ động.</span></li>
              <li><Icon name="check" size={18} /> <span><strong>Đồng hành:</strong> lắng nghe và điều chỉnh theo nhu cầu của khách hàng.</span></li>
            </ul>
          </div>
          <div className="aside-box">
            <h3>Thông tin doanh nghiệp</h3>
            <ul className="contact-list">
              <li><Icon name="pin" size={18} /> {site.address}</li>
              <li><Icon name="phone" size={18} /> <a href={`tel:${site.hotline}`}>{site.hotlineDisplay}</a></li>
              <li><Icon name="mail" size={18} /> <a href={`mailto:${site.email}`}>{site.email}</a></li>
              <li><Icon name="clock" size={18} /> {site.workingHours}</li>
            </ul>
            <Link href="/lien-he/" className="btn btn-outline">Liên hệ</Link>
          </div>
        </div>
      </section>
      <section className="section soft">
        <div className="container">
          <div className="section-head center"><h2>Vì sao khách hàng chọn chúng tôi</h2></div>
          <div className="grid-4">
            {whyUs.map((w) => (
              <div className="card" key={w.title}>
                <div className="icon-box"><Icon name={w.icon} /></div>
                <h3>{w.title}</h3>
                <p>{w.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
