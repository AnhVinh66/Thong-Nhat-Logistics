import Link from 'next/link';
import Icon from '../components/Icon';
import TripTicket from '../components/TripTicket';
import { site, stats, services, whyUs, steps, fleet } from '../lib/site';
import { getAllPosts, formatDate } from '../lib/posts';

export default function Home() {
  const posts = getAllPosts().slice(0, 3);
  return (
    <>
      <section className={`hero${site.heroPhoto ? ' has-photo' : ''}`}>
        {site.heroPhoto && <img className="hero-photo" src={site.heroPhoto} alt="Xe tải Thống Nhất Logistic" />}
        <div className="container hero-in">
          <div className="hero-text">
            <p className="eyebrow">Vận tải hàng hoá đường bộ</p>
            <h1>Thuê xe tải 1,5 – 7 tấn, giao đúng hẹn, có biên bản từng chuyến</h1>
            <p className="lead">
              {site.name} nhận chở hàng nguyên chuyến và ghép hàng từ Hà Nội đi các tỉnh.
              Gửi điểm lấy, điểm giao và loại hàng, chúng tôi báo giá trọn gói.
            </p>
            <div className="hero-cta">
              <Link href="/bao-gia/" className="btn btn-primary btn-lg">
                Yêu cầu báo giá <Icon name="arrow" size={18} />
              </Link>
              <a href={`tel:${site.hotline}`} className="btn btn-ghost btn-lg">
                <Icon name="phone" size={18} /> {site.hotlineDisplay}
              </a>
            </div>
          </div>
          <TripTicket />
        </div>
      </section>

      <section className="facts" aria-label="Thông tin chính">
        <div className="container facts-in">
          {stats.map((s) => (
            <div className="fact" key={s.value}>
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
            <h2>Nguyên chuyến, ghép hàng, hàng lạnh và hàng cồng kềnh</h2>
            <p className="muted">Từ lô hàng lẻ đến nguyên chuyến, chúng tôi đề xuất phương án phù hợp nhất với ngân sách và thời gian của bạn.</p>
          </div>
          <div className="svc-list">
            {services.map((s) => (
              <Link href="/dich-vu/" className="svc" key={s.title}>
                <Icon name={s.icon} size={20} />
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section soft">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Vì sao chọn chúng tôi</p>
            <h2>Cam kết của Thống Nhất Logistic</h2>
          </div>
          <div className="why-list">
            {whyUs.map((w) => (
              <div className="why" key={w.title}>
                <Icon name={w.icon} size={20} />
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
            <h2>Từ cuộc gọi đến biên bản giao nhận</h2>
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
            <h2>Ba cỡ xe cho hàng nhẹ đến hàng pallet</h2>
          </div>
          <div className="table-wrap">
            <table className="fleet-table">
              <thead>
                <tr><th>Loại xe</th><th>Tải trọng</th><th>Khối lượng</th><th>Kích thước thùng</th><th>Phù hợp với</th></tr>
              </thead>
              <tbody>
                {fleet.map((f) => (
                  <tr key={f.id}>
                    <td>{f.name}</td>
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
              <h2>Kiến thức và tin tức vận tải</h2>
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
              <p>Gọi hotline hoặc gửi yêu cầu, điều phối viên báo giá trọn gói cho chuyến của bạn.</p>
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
