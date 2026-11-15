import PageHero from '../../components/PageHero';
import Icon from '../../components/Icon';
import { jobs, site } from '../../lib/site';

export const metadata = {
  title: 'Tuyển dụng',
  description: 'Cơ hội việc làm tại Thống Nhất Logistic: tài xế, điều phối vận tải, kinh doanh.',
};

export default function Page() {
  return (
    <>
      <PageHero title="Tuyển dụng" text="Gia nhập đội ngũ Thống Nhất Logistic, cùng xây dựng dịch vụ vận tải đáng tin cậy." />
      <section className="section">
        <div className="container" style={{ display: 'grid', gap: 18 }}>
          {jobs.map((j) => (
            <div className="card job" key={j.title}>
              <div style={{ flex: '1 1 380px' }}>
                <h3>{j.title}</h3>
                <div className="post-meta">
                  <span className="tag">{j.type}</span>
                  <span><Icon name="pin" size={14} /> {j.location}</span>
                </div>
                <p>{j.desc}</p>
              </div>
              <a
                className="btn btn-outline"
                href={`mailto:${site.email}?subject=${encodeURIComponent('Ứng tuyển: ' + j.title)}`}
              >
                Ứng tuyển
              </a>
            </div>
          ))}
          <p className="muted">
            Gửi CV về <a href={`mailto:${site.email}`}>{site.email}</a> hoặc gọi {site.hotlineDisplay}.
          </p>
        </div>
      </section>
    </>
  );
}
