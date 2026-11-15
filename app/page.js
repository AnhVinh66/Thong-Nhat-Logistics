import Link from 'next/link';
import Icon from '../components/Icon';
import HeroArt from '../components/HeroArt';
import { site, stats, services, whyUs, steps, fleet } from '../lib/site';
import { getAllPosts, formatDate } from '../lib/posts';

export default function Home() {
  const posts = getAllPosts().slice(0, 3);
  return (
    <>
      <section className="hero">
        <div className="container hero-in">
          <div>
            <p className="eyebrow" style={{ color: '#ffa45c' }}>Vận tải đường bộ toàn quốc</p>
            <h1>
              Hàng đến <em>đúng hẹn</em>,<br />an toàn trên mọi nẻo đường
            </h1>
            <p className="lead">
              {site.name} cung cấp dịch vụ vận chuyển hàng hoá nội địa bằng xe tải từ 1,5 đến 7 tấn.
              Báo giá nhanh, lộ trình rõ ràng, điều phối hỗ trợ 24/7.
            </p>
            <div className="hero-cta">
              <Link href="/bao-gia/" className="btn btn-primary btn-lg">
                Yêu cầu báo giá <Icon name="arrow" size={18} />
              </Link>
              <a href={`tel:${site.hotline}`} className="btn btn-ghost btn-lg">
                <Icon name="phone" size={18} /> {site.hotlineDisplay}
              </a>
            </div>
            <ul className="badge-row">
              <li><Icon name="check" size={16} /> Giá trọn gói minh bạch</li>
              <li><Icon name="check" size={16} /> Theo dõi hành trình</li>
              <li><Icon name="check" size={16} /> Hỗ trợ bảo hiểm hàng hoá</li>
            </ul>
          </div>
          <HeroArt />
        </div>
      </section>

      <section className="stats" aria-label="Số liệu nổi bật">
        <div className="container stats-in">
          {stats.map((s) => (
            <div className="stat" key={s.label}>
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Dịch vụ</p>
            <h2>Giải pháp vận chuyển cho mọi loại hàng</h2>
            <p className="muted">Từ lô hàng lẻ đến nguyên chuyến, chúng tôi đề xuất phương án phù hợp nhất với ngân sách và thời gian của bạn.</p>
          </div>
          <div className="grid-3">
            {services.map((s) => (
              <Link href="/dich-vu/" className="card" key={s.title}>
                <div className="icon-box"><Icon name={s.icon} /></div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section soft">
        <div className="container">
          <div className="section-head center">
            <p className="eyebrow">Vì sao chọn chúng tôi</p>
            <h2>Cam kết của Thống Nhất Logistic</h2>
          </div>
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

      <section className="section">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Quy trình</p>
            <h2>4 bước đơn giản để vận chuyển hàng</h2>
          </div>
          <ol className="steps">
            {steps.map((s) => (
              <li className="step" key={s.title}>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section soft">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Đội xe</p>
            <h2>Đa dạng tải trọng, đáp ứng mọi nhu cầu</h2>
          </div>
          <div className="table-wrap">
            <table className="fleet-table">
              <thead>
                <tr><th>Loại xe</th><th>Tải trọng</th><th>Khối lượng</th><th>Kích thước thùng</th><th>Phù hợp với</th></tr>
              </thead>
              <tbody>
                {fleet.map((f) => (
                  <tr key={f.id}>
                    <td><strong>{f.name}</strong></td>
                    <td>{f.load}</td>
                    <td>{f.volume}</td>
                    <td>{f.size}</td>
                    <td>{f.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {posts.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-head">
              <p className="eyebrow">Tin tức</p>
              <h2>Kiến thức & tin tức mới nhất</h2>
            </div>
            <div className="grid-3">
              {posts.map((p) => (
                <Link href={`/tin-tuc/${p.slug}/`} className="card" key={p.slug}>
                  <div className="post-meta"><span className="tag">{p.category}</span> {formatDate(p.date)}</div>
                  <h3>{p.title}</h3>
                  <p>{p.excerpt}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="cta-band">
            <div>
              <h2>Cần vận chuyển hàng hôm nay?</h2>
              <p>Gọi ngay hoặc gửi yêu cầu, chúng tôi phản hồi báo giá nhanh chóng.</p>
            </div>
            <div className="hero-cta" style={{ marginTop: 0 }}>
              <Link href="/bao-gia/" className="btn btn-primary btn-lg">Nhận báo giá</Link>
              <a href={`tel:${site.hotline}`} className="btn btn-ghost btn-lg">{site.hotlineDisplay}</a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
