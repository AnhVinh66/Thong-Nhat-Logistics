// Sinh bộ màu giao diện TỐI cho khu vực Thống Nhất CMS từ app/globals.css -> app/theme-dark.css
// Chạy lại mỗi khi sửa màu trong globals.css:  node scripts/gen-dark-css.mjs
//
// Nguyên tắc (để các phần thông tin không lẫn vào nhau):
//  - Nền sáng -> nền tối (giữ sắc màu, giảm độ đậm), nền màu nổi bật (nút cam, nhãn màu) giữ nguyên.
//  - Chữ tối -> chữ sáng; chữ sáng (trên nền đậm) giữ nguyên.
//  - Viền sáng -> viền tối vừa phải để vẫn thấy ranh giới các ô.
//  - Thanh menu bên trái vốn đã tối nên không đổi.
// Mọi quy tắc chỉ áp dụng khi <html data-theme="dark"> và nằm trong .admin (trang đăng nhập, website, app lái xe không đổi).
import fs from 'node:fs';

const SRC = 'app/globals.css';
const OUT = 'app/theme-dark.css';
const P = 'html[data-theme="dark"]';
const NAVY_BG = '#22406b'; // thay cho nền var(--navy) (đầu bảng, nút đang chọn)

// ---------- màu ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
function parseColor(s) {
  s = s.trim().toLowerCase();
  if (s === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (s === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  return null;
}
function toHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}
function hslStr({ h, s, l }, a = 1) {
  const H = Math.round(h), S = Math.round(clamp(s) * 100), L = Math.round(clamp(l) * 100);
  return a < 1 ? `hsla(${H}, ${S}%, ${L}%, ${+a.toFixed(3)})` : `hsl(${H}, ${S}%, ${L}%)`;
}
function mapBg(c) {
  const x = toHsl(c);
  if (c.a < 0.35) return null; // lớp phủ mờ: giữ
  if (x.s > 0.55 && x.l > 0.3 && x.l < 0.75) return null; // nền màu nổi bật (nút cam, nhãn đậm): giữ
  if (x.l <= 0.5) return null; // nền vốn đã tối: giữ
  // màu xám trung tính -> xám ánh xanh cho đồng bộ với nền tối
  const neutral = x.s < 0.06;
  return hslStr({ h: neutral ? 220 : x.h, s: neutral ? 0.3 : Math.min(x.s, 0.45), l: 0.135 + (1 - x.l) * 0.9 }, c.a);
}
function mapText(c) {
  const x = toHsl(c);
  if (x.l >= 0.6) return null; // chữ sáng: giữ
  return hslStr({ h: x.h, s: Math.min(x.s, 0.9), l: 0.95 - x.l * 0.55 }, c.a);
}
function mapBorder(c) {
  const x = toHsl(c);
  if (x.s > 0.55 && x.l > 0.3 && x.l < 0.75) return null;
  if (x.l <= 0.6) return null;
  const neutral = x.s < 0.06;
  return hslStr({ h: neutral ? 220 : x.h, s: neutral ? 0.25 : Math.min(x.s, 0.35), l: 0.24 + (1 - x.l) * 0.5 }, c.a);
}

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\bwhite\b/g;
function transformValue(value, kind) {
  if (kind === 'bg' && /var\(--navy\)/.test(value)) return value.replace(/var\(--navy\)/g, NAVY_BG);
  if (kind === 'text' && /var\(--navy-[23]\)/.test(value)) return value.replace(/var\(--navy-[23]\)/g, '#c7d6ee');
  let changed = false;
  const out = value.replace(COLOR_RE, (m) => {
    const c = parseColor(m);
    if (!c) return m;
    const r = kind === 'bg' ? mapBg(c) : kind === 'text' ? mapText(c) : mapBorder(c);
    if (r) { changed = true; return r; }
    return m;
  });
  return changed ? out : null;
}
const kindOf = (prop) => {
  if (prop === 'background' || prop === 'background-color' || prop === 'background-image') return 'bg';
  if (prop === 'color' || prop === 'fill' || prop === 'caret-color') return 'text';
  if (/^border(-(top|right|bottom|left))?(-color)?$/.test(prop) || prop === 'outline' || prop === 'outline-color') return 'border';
  return null;
};

// ---------- tách quy tắc CSS (hỗ trợ @media một cấp) ----------
function rules(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  let i = 0;
  const readBlock = (start) => { // trả về [nội dung, vị trí sau dấu }]
    let depth = 1, j = start;
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    return [css.slice(start, j - 1), j];
  };
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const head = css.slice(i, open).trim();
    const [body, next] = readBlock(open + 1);
    if (head.startsWith('@media')) {
      let k = 0;
      while (k < body.length) {
        const o2 = body.indexOf('{', k);
        if (o2 < 0) break;
        const sel = body.slice(k, o2).trim();
        const c2 = body.indexOf('}', o2);
        out.push({ media: head, sel, decl: body.slice(o2 + 1, c2) });
        k = c2 + 1;
      }
    } else if (!head.startsWith('@')) {
      out.push({ media: null, sel: head, decl: body });
    }
    i = next;
  }
  return out;
}

const scope = (sel) => sel.split(',').map((s) => s.trim()).filter((s) => {
  if (!s || /^(html|body|:root)\b/.test(s)) return false;
  if (/^\.side(?![\w])|^\.side-/.test(s)) return false; // menu trái giữ nguyên
  return true;
}).map((s) => (/^\.admin(?![\w-])/.test(s) ? `${P} ${s}` : `${P} .admin ${s}`)).join(',\n');

const css = fs.readFileSync(SRC, 'utf8');
let out = `/* TỰ SINH bởi scripts/gen-dark-css.mjs từ app/globals.css — đừng sửa tay; sửa trong script rồi chạy lại. */

${P} .admin {
  --bg: #0a111d;
  --soft: #0a111d;
  --line: #2a3a54;
  --text: #e2e8f0;
  --muted: #9aaac0;
  --navy: #dbe6f7;
  --ok: #4ade80;
  --err: #f87171;
  --orange-d: #fb923c;
  --gold: #fbbf24;
  --chart-1: #3987e5; /* màu biểu đồ cho nền tối (bộ màu đã kiểm tra) */
  --chart-2: #d95926;
  --shadow: 0 10px 30px rgba(0, 0, 0, .45);
  color-scheme: dark;
  color: var(--text); /* chữ kế thừa từ body vẫn là màu tối -> đặt lại */
}
${P} body { background: #0a111d; }
`;
const byMedia = {};
for (const r of rules(css)) {
  const sel = scope(r.sel);
  if (!sel) continue;
  const decls = [];
  // Quy tắc có nền màu nổi bật được giữ nguyên (VD nút cam) thì giữ luôn màu chữ của nó để chữ vẫn đọc được
  const keepsBg = r.decl.split(';').some((d) => {
    const idx = d.indexOf(':');
    if (idx < 0 || kindOf(d.slice(0, idx).trim().toLowerCase()) !== 'bg') return false;
    if (/var\(--(orange|ok|err)/.test(d)) return true;
    const m = d.slice(idx + 1).match(COLOR_RE);
    return !!m && m.some((x) => { const c = parseColor(x); if (!c) return false; const h = toHsl(c); return c.a >= 0.35 && h.s > 0.55 && h.l > 0.3 && h.l < 0.75; });
  });
  for (const d of r.decl.split(';')) {
    const idx = d.indexOf(':');
    if (idx < 0) continue;
    const prop = d.slice(0, idx).trim().toLowerCase();
    const val = d.slice(idx + 1).trim();
    const kind = kindOf(prop);
    if (!kind) continue;
    if (kind === 'text' && keepsBg) continue;
    const nv = transformValue(val.replace(/\s*!important\s*$/, ''), kind);
    if (nv) decls.push(`${prop}: ${nv}${/!important\s*$/.test(val) ? ' !important' : ''}`);
  }
  if (!decls.length) continue;
  const block = `${sel} { ${decls.join('; ')}; }\n`;
  (byMedia[r.media || ''] = byMedia[r.media || ''] || []).push(block);
}
out += (byMedia[''] || []).join('');
for (const [m, blocks] of Object.entries(byMedia)) if (m) out += `${m} {\n${blocks.join('')}}\n`;
out += fs.existsSync('scripts/dark-extra.css') ? `\n/* ----- chỉnh tay thêm (scripts/dark-extra.css) ----- */\n${fs.readFileSync('scripts/dark-extra.css', 'utf8')}` : '';
fs.writeFileSync(OUT, out);
console.log(`Đã tạo ${OUT} (${out.split('\n').length} dòng)`);
