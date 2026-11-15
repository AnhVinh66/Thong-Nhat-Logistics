import { site, nav } from '../lib/site';
import { getAllPosts } from '../lib/posts';

export const dynamic = 'force-static';

export default function sitemap() {
  const pages = [...nav.map((n) => n.href), '/bao-gia/'];
  const posts = getAllPosts().map((p) => `/tin-tuc/${p.slug}/`);
  return [...pages, ...posts].map((p) => ({ url: `${site.url}${p}` }));
}
