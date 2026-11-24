# Thống Nhất Logistic

Website công ty vận tải hàng hoá đường bộ nội địa, kèm khu vực quản trị nội bộ "Thống Nhất CMS" (`/nhan-vien/`).
Next.js 15 (App Router) + React 19, JavaScript thuần (không TypeScript, không Tailwind), xuất tĩnh (`output: 'export'`), dữ liệu và đăng nhập dùng Supabase.
Giao diện và nội dung đều bằng tiếng Việt.

## Lệnh

```bash
npm run dev     # http://localhost:3000 (launch.json ở thư mục cha có cấu hình "web")
npm run build   # xuất tĩnh vào out/
node scripts/gen-dark-css.mjs   # chạy lại mỗi khi sửa màu trong app/globals.css
```

Không có test hay lint. Kiểm tra bằng cách chạy `npm run build` và mở trang trong trình duyệt.

## Quy tắc của chủ dự án

- **Chỉ làm và kiểm tra giao diện máy tính (desktop).** Không thêm hay kiểm tra giao diện điện thoại, nhưng cũng không xoá các style mobile đang có. Ngoại lệ: `components/staff/DriverApp.js` là app lái xe chỉ dùng trên điện thoại, cần hỏi trước khi bỏ qua bước kiểm tra trên điện thoại.
- Chữ trên giao diện và thông báo commit viết bằng tiếng Việt.
- Push lên `main` sẽ tự deploy lên Hostinger, nên chỉ commit và push khi được yêu cầu.

## Cấu trúc

- `app/` — website công khai: `page.js` (trang chủ), `dich-vu`, `tinh-cuoc`, `bao-gia`, `ve-chung-toi`, `tin-tuc`, `tuyen-dung`, `lien-he`, `cai-app`.
- `app/nhan-vien/` — CMS nội bộ, mỗi mục là một thư mục (`page.js` có `'use client'` và `layout.js` đặt tiêu đề):
  `don-hang` (đơn hàng), `khach-hang`, `thu-tien`, `chi-tien`, `ngan-hang` (sao kê), `xe`, `ke-hoach` (lịch chạy xe), `lai-xe`, `tai-khoan`, `ca-nhan`.
- `components/staff/` — thành phần của CMS. Khung chung và menu trái nằm trong `StaffShell.js`; phân quyền (`roleLabel`, `canView`, `useRole`) nằm trong `Role.js`. Các thành phần dùng lại nhiều: `Modal`, `RowActions` (nút ⋯ / thùng rác), `MoneyInput`, `DateInput`, `DropZone`.
- `components/` — thành phần của website công khai (`Header`, `Footer`, `PageHero`, `FareCalculator`, `QuoteForm`, `TripTicket`…).
- `lib/site.js` — thông tin công ty, dịch vụ, đội xe, bảng giá cước. `lib/supabase.js` — client Supabase (khoá công khai mặc định) và các nhãn danh mục.
- `content/posts/*.md` — bài tin tức (frontmatter: title, date, category, excerpt). Workflow `news.yml` tự thêm tin từ RSS (`scripts/fetch-news.mjs`).
- `supabase/*.sql` — các bước thay đổi database. Người dùng tự chạy chúng trong Supabase SQL Editor; thứ tự chạy ghi trong README.md, mục 3b–3t.

## Phân quyền

5 vai trò: `staff` = Admin, `sales` = Nhân viên kinh doanh, `accountant` = Kế toán, `dispatcher` = Điều phối xe, `driver` = Lái xe.
Quyền được kiểm tra ở 2 nơi: giao diện (`components/staff/Role.js`) và RLS trong database (`supabase/roles.sql`). Khi thêm hay sửa quyền, sửa cả hai nơi.

## Database

- Bảng mới luôn phải bật RLS và có policy. Không bao giờ dùng khoá `service_role` / `sb_secret_`.
- Khi đổi schema: tạo một file `supabase/<ten>.sql` mới, viết sao cho chạy lại nhiều lần vẫn an toàn (`if not exists`…). Cập nhật cả `schema.sql`, thêm một mục vào README, rồi báo người dùng tự chạy file đó.
- Nếu chạy lại file SQL cũ, `roles.sql` phải được chạy lại cuối cùng.

## CSS

- Toàn bộ style nằm trong `app/globals.css` (~96 KB). Dùng Grep tìm đúng selector rồi đọc theo khoảng dòng, không đọc cả file.
- Khu vực CMS nằm trong `.admin`. `app/theme-dark.css` là file được SINH ra, không sửa tay.

## Tiết kiệm token

- Không đọc hay tìm trong `node_modules/`, `.next/`, `out/`, `package-lock.json` (file build rất lớn).
- Các file lớn (`app/nhan-vien/don-hang/page.js` ~38 KB, `globals.css`): dùng Grep trước rồi đọc theo khoảng dòng.
