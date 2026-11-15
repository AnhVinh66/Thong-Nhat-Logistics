import Link from 'next/link';
import PageHero from '../../components/PageHero';
import Icon from '../../components/Icon';
import { services, fleet } from '../../lib/site';

export const metadata = {
  title: 'Dịch vụ vận chuyển hàng hoá đường bộ',
  description: 'Vận chuyển nguyên chuyến, ghép hàng, hàng lạnh, hàng cồng kềnh, kho bãi và bảo hiểm hàng hoá trên toàn quốc.',
};

export default function Page() {
  return (
    <>
      <PageHero title="Dịch vụ vận chuyển" text="Giải pháp vận tải đường bộ linh hoạt cho doanh nghiệp và cá nhân trên toàn quốc." />
      <section className="section">
        <div className="container">
          <div className="grid-3">
            {services.map((s) => (
              <div className="card" key={s.title}>
                <div className="icon-box"><Icon name={s.icon} /></div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section soft">
        <div className="container split">
          <div>
            <p className="eyebrow">Đội xe</p>
            <h2>Chọn đúng xe, tối ưu chi phí</h2>
            <div className="table-wrap">
              <table className="fleet-table">
                <thead><tr><th>Loại xe</th><th>Tải trọng</th><th>Khối lượng</th><th>Thùng xe</th></tr></thead>
                <tbody>
                  {fleet.map((f) => (
                    <tr key={f.id}><td><strong>{f.name}</strong></td><td>{f.load}</td><td>{f.volume}</td><td>{f.size}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="aside-box">
            <h3>Cần tư vấn?</h3>
            <ul className="check-list">
              <li><Icon name="check" size={18} /> Tư vấn loại xe miễn phí</li>
              <li><Icon name="check" size={18} /> Báo giá trọn gói</li>
              <li><Icon name="check" size={18} /> Hỗ trợ bốc xếp, bảo hiểm</li>
            </ul>
            <Link href="/bao-gia/" className="btn btn-primary">Yêu cầu báo giá</Link>
          </div>
        </div>
      </section>
    </>
  );
}
