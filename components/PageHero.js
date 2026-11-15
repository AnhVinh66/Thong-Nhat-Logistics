import Link from 'next/link';

export default function PageHero({ title, text, crumb }) {
  return (
    <section className="page-hero">
      <div className="container">
        <p className="crumbs">
          <Link href="/">Trang chủ</Link> / {crumb || title}
        </p>
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
    </section>
  );
}
