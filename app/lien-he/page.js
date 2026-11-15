import PageHero from '../../components/PageHero';
import QuoteForm from '../../components/QuoteForm';
import Icon from '../../components/Icon';
import { site } from '../../lib/site';

export const metadata = {
  title: 'Liên hệ',
  description: `Liên hệ ${site.name}: hotline ${site.hotlineDisplay}, email ${site.email}, ${site.address}.`,
};

export default function Page() {
  return (
    <>
      <PageHero title="Liên hệ" text="Chúng tôi luôn sẵn sàng hỗ trợ bạn." />
      <section className="section">
        <div className="container split">
          <div>
            <h2>Gửi tin nhắn cho chúng tôi</h2>
            <QuoteForm />
          </div>
          <aside className="aside-box">
            <h3>Thông tin liên hệ</h3>
            <ul className="contact-list">
              <li><Icon name="phone" size={18} /> <a href={`tel:${site.hotline}`}>{site.hotlineDisplay}</a></li>
              <li><Icon name="mail" size={18} /> <a href={`mailto:${site.email}`}>{site.email}</a></li>
              <li><Icon name="pin" size={18} /> {site.address}</li>
              <li><Icon name="clock" size={18} /> {site.workingHours}</li>
            </ul>
            <a href={`https://zalo.me/${site.zalo}`} className="btn btn-outline" target="_blank" rel="noopener noreferrer">Chat Zalo</a>
          </aside>
        </div>
      </section>
    </>
  );
}
