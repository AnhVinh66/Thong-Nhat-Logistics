# Thống Nhất Logistic – Website

Website công ty vận chuyển hàng hoá nội địa đường bộ. Next.js (xuất tĩnh), tiếng Việt, responsive.

**Trang:** Trang chủ · Dịch vụ · Tính cước · Về chúng tôi · Tin tức (Markdown) · Tuyển dụng · Liên hệ · Yêu cầu báo giá

## Chạy trên máy

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # tạo thư mục out/ (file tĩnh để upload)
```

## Chỉnh nội dung

- **Thông tin công ty, dịch vụ, đội xe, bảng giá tính cước, tuyển dụng:** `lib/site.js`.
  Các mục ghi `[MẪU]` là số liệu giả định, cần thay bằng số liệu thật (đặc biệt: đơn giá `rate`/`min` của từng loại xe, số liệu nổi bật, tên miền).
- **Bài viết:** thêm file `.md` vào `content/posts/` với phần đầu:
  ```
  ---
  title: Tiêu đề
  date: 2025-12-20
  category: Kinh nghiệm
  excerpt: Mô tả ngắn
  ---
  ```
- **Công cụ tính cước** chỉ cho giá ước tính, giá thật do công ty báo.

## Form báo giá (Formspree)

1. Đăng ký tại https://formspree.io, tạo form, nhận email `vinh@tranhoangvietnam.com`.
2. Lấy ID (đoạn sau `/f/` trong URL form) đặt vào biến `NEXT_PUBLIC_FORMSPREE_ID`.
3. Khi chưa có ID, form sẽ mở ứng dụng email có sẵn nội dung.

## Đẩy lên GitHub

```bash
git init
git add .
git commit -m "Khởi tạo website Thống Nhất Logistic"
git branch -M main
git remote add origin https://github.com/<tai-khoan>/thongnhat-logistic.git
git push -u origin main
```

## Deploy lên Hostinger (tự động qua GitHub Actions + FTP)

1. Trong hPanel Hostinger: **Websites → Files → FTP Accounts**, lấy `host`, `username`, đặt/ghi nhớ `password`.
2. Trên GitHub: **Settings → Secrets and variables → Actions**
   - *Secrets:* `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`, `FTP_DIR` (thường là `/public_html/`)
   - *Variables:* `NEXT_PUBLIC_SITE_URL` (ví dụ `https://tenmien.vn`), `NEXT_PUBLIC_FORMSPREE_ID`
3. Mỗi lần push lên nhánh `main`, workflow `.github/workflows/deploy.yml` sẽ build và upload thư mục `out/`.

**Deploy thủ công:** chạy `npm run build`, rồi upload toàn bộ nội dung thư mục `out/` vào `public_html` bằng File Manager.

File `public/.htaccess` đã bật ép HTTPS, nén và cache. Nếu dùng bản Hostinger không chạy Apache (LiteSpeed vẫn đọc được `.htaccess`) thì không cần chỉnh thêm.
