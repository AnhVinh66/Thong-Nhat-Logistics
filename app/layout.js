import { Be_Vietnam_Pro } from 'next/font/google';
import './globals.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { site } from '../lib/site';

const font = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

export const metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} – Vận chuyển hàng hoá đường bộ toàn quốc`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  openGraph: {
    title: site.name,
    description: site.description,
    type: 'website',
    locale: 'vi_VN',
    siteName: site.name,
  },
};

export const viewport = { themeColor: '#0B2545' };

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: site.name,
  url: site.url,
  telephone: `+84${site.hotline.slice(1)}`,
  email: site.email,
  foundingDate: String(site.founded),
  address: { '@type': 'PostalAddress', addressLocality: 'Hà Nội', addressCountry: 'VN' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body className={font.className}>
        <a href="#main" className="skip">Bỏ qua đến nội dung chính</a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </body>
    </html>
  );
}
