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

## Tính km tự động (Google Maps)

Trang **Tính cước** cho khách chọn Tỉnh/Thành, Phường/Xã và nhập địa chỉ cụ thể (danh sách hành chính mới nằm ở `public/data/vn-admin.json`). Bấm **Xác nhận địa chỉ** để tìm vị trí và tính quãng đường lái xe bằng Google Maps, rồi ra cước theo bảng giá.

1. Vào https://console.cloud.google.com, tạo dự án và **bật thanh toán** (Google có hạn mức miễn phí hằng tháng).
2. Bật 3 API: **Maps JavaScript API**, **Geocoding API**, **Routes API**.
3. Tạo API key. **Bắt buộc hạn chế khoá**: *Application restrictions → Websites* chỉ cho tên miền của bạn (và `localhost` khi chạy thử); *API restrictions* chỉ 3 API trên. Khoá nằm trong mã web nên ai cũng xem được, hạn chế khoá để tránh bị dùng trộm.
4. Đặt khoá vào biến `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (file `.env.local` khi chạy thử, GitHub *Variables* khi deploy).

Nếu chưa có khoá, khách vẫn dùng được bằng cách nhập số km thủ công.

## Khu vực nhân viên (đăng nhập, Khách hàng, Đơn hàng)

Địa chỉ: `/nhan-vien/` (link nhỏ "Nhân viên" ở chân trang, không index trên Google). Dữ liệu và đăng nhập dùng **Supabase**.

1. Tạo dự án tại https://supabase.com (gói miễn phí).
2. **SQL Editor → New query**: dán toàn bộ `supabase/schema.sql` rồi Run (tạo bảng `customers`, `orders` và bật Row Level Security: chỉ người đã đăng nhập mới truy cập được).
3. **Authentication → Sign In / Providers → tắt "Allow new users to sign up"** (bắt buộc, nếu không ai cũng tự đăng ký được và xem dữ liệu).
3b. Nếu đã chạy `schema.sql` từ trước và cần thêm bảng **Danh sách xe**: chạy riêng file `supabase/vehicles.sql` trong SQL Editor (đã kèm 3 xe mẫu).
3c. Để dùng **đơn hàng trả hàng nhiều điểm**, chạy thêm file `supabase/multi-stop.sql` (nếu dựng mới bằng `schema.sql` bản hiện tại thì đã có sẵn).
3d. Để lưu và gợi ý **điểm lấy hàng**, chạy thêm file `supabase/pickup-points.sql` (đã có trong `schema.sql` bản hiện tại).
3e. Để tải **ảnh biên bản giao nhận và bill** cho từng điểm giao, chạy thêm file `supabase/delivery-photos.sql` (tạo kho ảnh riêng tư `delivery-docs`; đã có trong `schema.sql` bản hiện tại).
3f. **Vai trò Lái xe**: chạy `supabase/driver-role.sql` (chạy SAU tất cả các file trên). Từ đây phân quyền ở **Nhân viên → Tài khoản**: lái xe chỉ thấy chuyến của mình và chụp ảnh chứng từ. Nếu sau này chạy lại bất kỳ file SQL nào khác, phải chạy lại `driver-role.sql`.
3g. **Tạo tài khoản ngay trên website**: chạy `supabase/simple-users.sql` (sau `driver-role.sql`). Từ đó vào **Nhân viên → Tài khoản** nhập Họ tên, Tên đăng nhập, Mật khẩu, Vai trò là xong; không cần email. Đăng nhập bằng tên đăng nhập (VD `trang`).
3h. **Thu tiền** (nút Đề xuất Thu, bảng Thu, mã khách hàng KH0001...): chạy `supabase/collections.sql` (đã có trong `schema.sql` bản hiện tại). File này tự nhận vai trò nếu đã chạy `driver-role.sql`.
3i. **Giao dịch ngân hàng** (thêm tài khoản, tải sao kê .xlsx/.csv, chống trùng, mã Hash): chạy `supabase/bank.sql` (đã có trong `schema.sql` bản hiện tại). File này tự nhận vai trò nếu đã chạy `driver-role.sql`.
3j. **Đối soát lệnh Thu với sao kê** (chọn ngân hàng trong Đề xuất Thu, tích xanh / X đỏ, trạng thái Đã khớp của sao kê): chạy `supabase/reconcile.sql` SAU `collections.sql` và `bank.sql` (đã có trong `schema.sql` bản hiện tại).
3k. **Chi tiền** (Đề xuất Chi, duyệt Chờ duyệt → Đã duyệt → Đã thanh toán, ảnh hoá đơn, đối chiếu sao kê tiền ra): chạy `supabase/expenses.sql` SAU `vehicles.sql`, `bank.sql`, `reconcile.sql` (đã có trong `schema.sql` bản hiện tại). Nếu sau này chạy lại `reconcile.sql` thì phải chạy lại `expenses.sql`.
3l. **Mã đơn con cho điểm trả** (DH0004-1, DH0004-2...): chạy `supabase/stop-codes.sql` SAU `multi-stop.sql` (đã có trong `schema.sql` bản hiện tại). Số hiệu do database cấp, cố định và không bao giờ dùng lại.
3m. **Thống kê theo xe** (số đơn, doanh thu, chi phí nhiên liệu / bảo dưỡng theo ngày, tuần, tháng, năm ở trang Danh sách xe): chạy `supabase/vehicle-stats.sql` SAU `expenses.sql` (đã có trong `schema.sql` bản hiện tại).
4. **Authentication → Users → Add user** để tạo tài khoản cho từng nhân viên (email + mật khẩu). Mọi nhân viên có quyền như nhau.
5. **Project Settings → API**: copy *Project URL* và *anon public key* vào `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`.env.local` khi chạy thử, GitHub *Variables* khi deploy).

**Mặc định đã có sẵn trong mã** (`lib/supabase.js`): website luôn kết nối được dù GitHub Variables thiếu `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Hai biến này chỉ cần đặt khi muốn đổi sang dự án Supabase khác.

Lưu ý: anon key là khoá công khai theo thiết kế của Supabase, an toàn nhờ bước 2 và 3. **Không** dùng `service_role` key trong dự án này. Nên bật sao lưu dữ liệu trong Supabase khi dùng thật.

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
   - *Variables:* `NEXT_PUBLIC_SITE_URL` (ví dụ `https://tenmien.vn`), `NEXT_PUBLIC_FORMSPREE_ID`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Mỗi lần push lên nhánh `main`, workflow `.github/workflows/deploy.yml` sẽ build và upload thư mục `out/`.

**Deploy thủ công:** chạy `npm run build`, rồi upload toàn bộ nội dung thư mục `out/` vào `public_html` bằng File Manager.

File `public/.htaccess` đã bật ép HTTPS, nén và cache. Nếu dùng bản Hostinger không chạy Apache (LiteSpeed vẫn đọc được `.htaccess`) thì không cần chỉnh thêm.
