import Link from 'next/link';
import PageHero from '../../components/PageHero';
import { getAllPosts, formatDate } from '../../lib/posts';

export const metadata = {
  title: 'Tin tức & kinh nghiệm vận chuyển',
  description: 'Kinh nghiệm đóng gói, chọn xe, và tin tức mới nhất từ Thống Nhất Logistic.',
};

export default function Page() {
  const posts = getAllPosts();
  return (
    <>
      <PageHero title="Tin tức & kinh nghiệm" text="Kiến thức hữu ích về vận chuyển hàng hoá đường bộ." crumb="Tin tức" />
      <section className="section">
        <div className="container grid-3">
          {posts.map((p) => (
            <Link href={`/tin-tuc/${p.slug}/`} className="card" key={p.slug}>
              <div className="post-meta"><span className="tag">{p.category}</span> {formatDate(p.date)}</div>
              <h3>{p.title}</h3>
              <p>{p.excerpt}</p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
