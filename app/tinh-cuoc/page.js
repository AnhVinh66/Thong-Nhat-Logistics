import PageHero from '../../components/PageHero';
import FareCalculator from '../../components/FareCalculator';

export const metadata = {
  title: 'Tính cước vận chuyển tham khảo',
  description: 'Ước tính nhanh cước vận chuyển hàng hoá đường bộ theo địa chỉ lấy hàng, giao hàng và loại xe.',
};

export default function Page() {
  return (
    <>
      <PageHero title="Tính cước tham khảo" text="Nhập địa chỉ điểm đi, điểm đến để tính quãng đường và ước tính cước." crumb="Tính cước" />
      <section className="section">
        <div className="container">
          <FareCalculator />
        </div>
      </section>
    </>
  );
}
