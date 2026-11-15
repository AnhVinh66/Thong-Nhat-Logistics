import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHero from '../../../components/PageHero';
import { getAllPosts, getPost, formatDate } from '../../../lib/posts';

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = getPost(slug);
  return post ? { title: post.title, description: post.excerpt } : {};
}

export default async function Page({ params }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();
  return (
    <>
      <PageHero title={post.title} crumb="Tin tức" />
      <section className="section">
        <div className="container">
          <div className="post-meta" style={{ maxWidth: 760, marginInline: 'auto' }}>
            <span className="tag">{post.category}</span> {formatDate(post.date)}
          </div>
          <article className="prose" dangerouslySetInnerHTML={{ __html: post.html }} />
          <p style={{ textAlign: 'center', marginTop: 40 }}>
            <Link href="/tin-tuc/" className="btn btn-outline">Quay lại danh sách</Link>{' '}
            <Link href="/bao-gia/" className="btn btn-primary">Yêu cầu báo giá</Link>
          </p>
        </div>
      </section>
    </>
  );
}
