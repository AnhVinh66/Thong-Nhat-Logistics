import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

const dir = path.join(process.cwd(), 'content', 'posts');

export function getAllPosts() {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const slug = file.replace(/\.md$/, '');
      const { data, content } = matter(fs.readFileSync(path.join(dir, file), 'utf8'));
      return {
        slug,
        title: data.title || slug,
        date: data.date ? new Date(data.date).toISOString().slice(0, 10) : '',
        excerpt: data.excerpt || '',
        category: data.category || 'Tin tức',
        content,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPost(slug) {
  const post = getAllPosts().find((p) => p.slug === slug);
  if (!post) return null;
  return { ...post, html: marked.parse(post.content) };
}

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
