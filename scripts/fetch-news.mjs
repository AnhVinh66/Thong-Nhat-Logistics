// Tự động chọn 1 tin nóng về logistics / vận tải đường bộ (ưu tiên miền Bắc) từ RSS các báo và tạo bài trong content/posts.
// Chạy bằng GitHub Actions (.github/workflows/news.yml) mỗi 2 ngày; chạy tay: node scripts/fetch-news.mjs
//   FORCE=1  : bỏ qua giới hạn "2 ngày 1 tin"
//   DRY=1    : chỉ in tin được chọn, không ghi file
//
// Bài tạo ra chỉ gồm tiêu đề + đoạn tóm lược do chính tờ báo công bố trong RSS + liên kết và ghi nguồn rõ ràng;
// KHÔNG sao chép toàn văn bài báo. Không cần thư viện ngoài (Node 20+).

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const postsDir = path.join(root, 'content', 'posts');
const logFile = path.join(root, 'content', 'news-log.json');
const DAYS_BETWEEN_POSTS = 2;
const MAX_AGE_DAYS = 4; // chỉ lấy tin trong 4 ngày gần nhất (không có thì mở rộng tới 10 ngày)

const FEEDS = [
  { source: 'VnExpress', url: 'https://vnexpress.net/rss/kinh-doanh.rss' },
  { source: 'VnExpress', url: 'https://vnexpress.net/rss/thoi-su.rss' },
  { source: 'VnExpress', url: 'https://vnexpress.net/rss/oto-xe-may.rss' },
  { source: 'Thanh Niên', url: 'https://thanhnien.vn/rss/kinh-te.rss' },
  { source: 'Dân trí', url: 'https://dantri.com.vn/rss/kinh-doanh.rss' },
  { source: 'VnEconomy', url: 'https://vneconomy.vn/kinh-te-so.rss' },
  { source: 'Báo Xây dựng', url: 'https://baoxaydung.vn/rss/giao-thong.rss' },
  { source: 'Báo Xây dựng', url: 'https://baoxaydung.vn/rss/home.rss' },
];

// Từ khoá chính: tin phải nói về vận tải / logistics đường bộ / nhiên liệu / hạ tầng giao thông
const CORE = [
  'logistics', 'vận tải', 'vận chuyển', 'xe tải', 'xe container', 'container', 'cao tốc', 'quốc lộ', 'trạm thu phí', 'thu phí không dừng',
  'giá xăng', 'giá dầu', 'xăng dầu', 'dầu diesel', 'cước vận', 'kho bãi', 'chuỗi cung ứng', 'cảng biển', 'cảng hải phòng', 'cảng cạn',
  'cửa khẩu', 'tải trọng',
];
// Từ khoá phụ (điểm thấp)
const WEAK = ['hàng hóa', 'hàng hoá', 'đường bộ', 'giao thông', 'phạt nguội', 'bến xe', 'hạ tầng'];
// Tin về lĩnh vực không liên quan thì loại
const BLOCK = ['chứng khoán', 'cổ phiếu', 'bất động sản', 'vàng', 'bitcoin', 'tiền ảo', 'giải trí', 'bóng đá', 'ngân hàng', 'lãi suất',
  // tin tai nạn / hình sự không phải tin ngành
  'tử vong', 'tai nạn', 'va chạm', 'đấu đầu', 'cháy', 'khởi tố', 'bắt giữ', 'nổ ', 'thiệt mạng', 'bị thương', 'trộm'];
const NORTH = [
  'hà nội', 'hải phòng', 'quảng ninh', 'bắc ninh', 'hải dương', 'hưng yên', 'hà nam', 'nam định', 'thái bình', 'ninh bình', 'vĩnh phúc',
  'phú thọ', 'thái nguyên', 'bắc giang', 'lạng sơn', 'lào cai', 'cao bằng', 'hòa bình', 'sơn la', 'điện biên', 'yên bái', 'tuyên quang', 'hà giang',
  'miền bắc', 'phía bắc', 'bắc bộ', 'đồng bằng sông hồng', 'tây bắc', 'đông bắc', 'nội bài', 'lạch huyện', 'cái lân', 'pháp vân',
  'vành đai 3', 'vành đai 4', 'bắc - nam', 'bắc – nam', 'bắc nam', 'hữu nghị', 'tân thanh', 'móng cái',
];

const decode = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');
const stripTags = (s) => decode(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const pick = (xml, tag) => { const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')); return m ? m[1] : ''; };
const norm = (s) => s.toLowerCase();

function parseItems(xml, source) {
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map((m) => {
    const it = m[0];
    const title = stripTags(pick(it, 'title'));
    let descRaw = decode(pick(it, 'description'));
    // VnExpress: <a><img></a></br>Tóm tắt  -> lấy phần chữ sau thẻ ảnh
    descRaw = descRaw.replace(/<a[^>]*>\s*<img[^>]*>\s*<\/a>/gi, ' ').replace(/<img[^>]*>/gi, ' ');
    // bỏ tiền tố kiểu '(Dân trí) - ' / 'VTV.vn - '
    const desc = stripTags(descRaw).replace(/^\(?[^)\n]{2,25}\)?\s+[-–—]\s+/, '');
    const link = stripTags(pick(it, 'link')) || stripTags(pick(it, 'guid'));
    const date = new Date(stripTags(pick(it, 'pubDate')));
    return { source, title, desc, link, date };
  }).filter((x) => x.title && x.link && !Number.isNaN(x.date.getTime()));
}

function score(item) {
  const t = norm(item.title);
  const d = norm(item.desc);
  const text = `${t} ${d}`;
  if (BLOCK.some((b) => t.includes(b))) return { score: 0, north: false };
  let s = 0;
  for (const k of CORE) {
    if (t.includes(k)) s += 3;
    else if (d.includes(k)) s += 1.5;
  }
  const north = NORTH.some((k) => text.includes(k));
  for (const k of WEAK) {
    if (t.includes(k)) s += 1;
    else if (d.includes(k)) s += 0.5;
  }
  if (s < 3) return { score: 0, north };
  return { score: s + (north ? 6 : 0), north };
}

const categoryOf = (item) => {
  const t = norm(`${item.title} ${item.desc}`);
  if (/(xăng|dầu|nhiên liệu)/.test(t)) return 'Giá nhiên liệu';
  if (/(cao tốc|quốc lộ|giao thông|tai nạn|ùn tắc|trạm thu phí|đường)/.test(t)) return 'Giao thông';
  return 'Thị trường';
};

const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '');
const pad = (n) => String(n).padStart(2, '0');
const vnDate = (d) => {
  const v = new Date(d.getTime() + 7 * 3600 * 1000); // giờ Việt Nam
  return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
};
const dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const q = (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

async function fetchFeed(f) {
  try {
    const res = await fetch(f.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ThongNhatNewsBot/1.0)', Accept: 'application/rss+xml, application/xml, text/xml' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseItems(await res.text(), f.source);
  } catch (e) {
    console.log(`  ! Bỏ qua ${f.url}: ${e.message}`);
    return [];
  }
}

function readLog() {
  try { return JSON.parse(fs.readFileSync(logFile, 'utf8')); } catch { return { used: [] }; }
}

function lastAutoDate() {
  if (!fs.existsSync(postsDir)) return null;
  let last = null;
  for (const file of fs.readdirSync(postsDir)) {
    if (!file.endsWith('.md')) continue;
    const txt = fs.readFileSync(path.join(postsDir, file), 'utf8');
    if (!/^auto:\s*true\s*$/m.test(txt)) continue;
    const m = txt.match(/^date:\s*(\d{4}-\d{2}-\d{2})/m);
    if (m && (!last || m[1] > last)) last = m[1];
  }
  return last;
}

async function main() {
  const today = vnDate(new Date());
  const last = lastAutoDate();
  if (!process.env.FORCE && last) {
    const days = Math.floor((Date.parse(today) - Date.parse(last)) / 86400000);
    if (days < DAYS_BETWEEN_POSTS) {
      console.log(`Tin tự động gần nhất ngày ${last}; chưa đủ ${DAYS_BETWEEN_POSTS} ngày, bỏ qua lần này.`);
      return;
    }
  }

  console.log('Đang đọc RSS...');
  const all = (await Promise.all(FEEDS.map(fetchFeed))).flat();
  console.log(`  ${all.length} tin từ ${FEEDS.length} nguồn.`);
  const log = readLog();
  const used = new Set(log.used.map((u) => u.url));
  const seenTitles = new Set();

  const candidates = (maxAgeDays) => all
    .filter((x) => Date.now() - x.date.getTime() <= maxAgeDays * 86400000 && Date.now() - x.date.getTime() >= -3600000)
    .filter((x) => !used.has(x.link))
    .map((x) => ({ ...x, ...score(x) }))
    .filter((x) => x.score > 0)
    .filter((x) => { const k = norm(x.title); if (seenTitles.has(k)) return false; seenTitles.add(k); return true; })
    .sort((a, b) => b.score - a.score || b.date - a.date);

  let list = candidates(MAX_AGE_DAYS);
  if (!list.length) { seenTitles.clear(); list = candidates(10); }
  if (!list.length) {
    console.log('Không có tin phù hợp, bỏ qua lần này (lần sau sẽ thử lại).');
    return;
  }
  const best = list[0];
  console.log(`Chọn: [${best.source}] ${best.title}  (điểm ${best.score}${best.north ? ', miền Bắc' : ''})`);
  if (process.env.DRY) { list.slice(0, 5).forEach((x) => console.log(`   - ${x.score} ${x.north ? 'B' : ' '} [${x.source}] ${x.title}`)); return; }

  const desc = best.desc.length > 600 ? `${best.desc.slice(0, 597).replace(/\s+\S*$/, '')}...` : best.desc;
  const excerpt = best.desc.length > 200 ? `${best.desc.slice(0, 197).replace(/\s+\S*$/, '')}...` : best.desc;
  const pubDay = vnDate(best.date);
  let slug = slugify(best.title) || 'tin-nong';
  if (fs.existsSync(path.join(postsDir, `${slug}.md`))) slug = `${slug}-${today}`;

  const md = `---
title: ${q(best.title)}
date: ${today}
category: Tin nóng
excerpt: ${q(excerpt || best.title)}
source: ${q(best.source)}
sourceUrl: ${q(best.link)}
auto: true
---

*Tin nóng tự động cập nhật ngày ${dmy(today)}. Dưới đây là phần tóm lược do ${best.source} công bố; Thống Nhất Logistic không sao chép toàn văn bài báo.*

> ${desc || best.title}

**Nguồn:** [${best.source}](${best.link}) · đăng ngày ${dmy(pubDay)}.

[Đọc bài đầy đủ tại ${best.source} →](${best.link})

---

Cần vận chuyển hàng đi các tuyến miền Bắc và toàn quốc? Gọi hotline **0965 328 200** hoặc [yêu cầu báo giá](/bao-gia/) để được tư vấn lịch trình và giá cước.
`;
  fs.mkdirSync(postsDir, { recursive: true });
  fs.writeFileSync(path.join(postsDir, `${slug}.md`), md);
  log.used.push({ url: best.link, title: best.title, date: today });
  log.used = log.used.slice(-300);
  fs.writeFileSync(logFile, JSON.stringify(log, null, 2) + '\n');
  console.log(`Đã tạo content/posts/${slug}.md`);
}

main().catch((e) => { console.error(e); process.exit(1); });
