import PageHero from '../../components/PageHero';
import FareCalculator from '../../components/FareCalculator';

export const metadata = {
  title: 'Tính cước vận chuyển tham khảo',
  description: 'Ước tính nhanh cước vận chuyển hàng hoá đường bộ theo tuyến và loại xe.',
};

export default function Page() {
  return (
    <>
      <PageHero title="Tính cước tham khảo" text="Chọn tuyến và loại xe để ước tính chi phí vận chuyển." crumb="Tính cước" />
      <section className="section">
        <div className="container">
          <FareCalculator />
        </div>
      </section>
    </>
  );
}
