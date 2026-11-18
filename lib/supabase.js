import { createClient } from '@supabase/supabase-js';

// URL và anon key là thông tin công khai theo thiết kế của Supabase; dữ liệu được bảo vệ bởi
// Row Level Security (xem supabase/schema.sql) và việc tắt đăng ký công khai.
// Giá trị mặc định dưới đây là khoá CÔNG KHAI (URL dự án + publishable/anon key). Chúng vốn nằm trong mã web gửi tới
// mọi trình duyệt, nên để trong mã nguồn không làm lộ thêm gì; dữ liệu được bảo vệ bởi RLS và tắt đăng ký công khai.
// Việc có sẵn mặc định giúp website không bao giờ mất kết nối database chỉ vì thiếu biến trong GitHub Variables.
// Có thể ghi đè bằng biến môi trường NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (ví dụ khi đổi dự án).
// TUYỆT ĐỐI không đặt khoá service_role / sb_secret_ vào đây.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://msigzqpnccabtkbuxtvc.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_ON50LzjQGDzVmhS1CA0F8A_CqrjjDau';

export const supabase = url && key ? createClient(url, key) : null;

export const customerTypes = {
  le: 'Khách lẻ',
  doanh_nghiep: 'Doanh nghiệp',
  dai_ly: 'Đại lý',
};

export const vnd = (n) => new Intl.NumberFormat('vi-VN').format(Number(n || 0)) + ' đ';
export const orderCode = (n) => 'DH' + String(n).padStart(4, '0');

// Tài khoản tạo trên website không cần email: "trang" được lưu thành "trang@thongnhat.local"
// (phải khớp với hàm login_domain() trong supabase/simple-users.sql)
export const LOGIN_DOMAIN = 'thongnhat.local';
export const displayLogin = (email) => (email || '').replace(`@${LOGIN_DOMAIN}`, '');

// Thu tiền
export const customerCode = (n) => 'KH' + String(n ?? 0).padStart(4, '0');
// Tên khách hàng kèm mã KH, dùng ở mọi nơi hiển thị khách hàng: "KH0001 – Hoàng Mai"
export const cusName = (c) => (!c ? '' : c.customer_no != null ? `${customerCode(c.customer_no)} – ${c.name}` : c.name || '');
export const collectionCode = (n) => 'PT' + String(n ?? 0).padStart(4, '0');
export const methodLabel = { cash: 'Tiền mặt', transfer: 'Chuyển khoản' };
// 1234567 -> "1,234,567" (dùng cho ô nhập tiền)
export const commas = (n) => (n === '' || n === null || n === undefined ? '' : Number(n).toLocaleString('en-US'));
export const BILLS_BUCKET = 'collection-bills';

// Ảnh đại diện người dùng (kho công khai "avatars", mỗi người một thư mục theo user id)
export const AVATAR_BUCKET = 'avatars';
export const avatarUrl = (path) => (path && supabase ? supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl : null);

// Chi tiền
export const expenseCode = (n) => 'PC' + String(n ?? 0).padStart(4, '0');
export const EXPENSE_BUCKET = 'expense-docs';
export const expenseTypes = {
  salary: 'Chi lương nhân viên',
  maintenance: 'Chi phí bảo dưỡng xe',
  fuel: 'Chi phí nhiên liệu',
  advertising: 'Chi phí quảng cáo',
  utilities: 'Chi phí điện thoại, điện nước...',
  other: 'Chi phí khác',
  advance: 'Chi phí tạm ứng nhân viên',
};
export const needsVehicle = (type) => type === 'maintenance' || type === 'fuel';
export const expenseStatus = { pending: 'Chờ duyệt', approved: 'Đã duyệt', paid: 'Đã thanh toán' };

// Mã đơn con của điểm trả: DH0004-1, DH0004-2... (stopNo do database cấp, cố định, không dùng lại)
export const stopCode = (orderNo, stopNo) => `${orderCode(orderNo)}-${stopNo}`;

// Ngày giờ luôn hiển thị NGÀY/THÁNG/NĂM (giờ Việt Nam), năm đủ 4 chữ số
const _vn = (ts, withTime) => {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ts)).reduce((a, x) => ({ ...a, [x.type]: x.value }), {});
  return withTime ? `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}` : `${p.day}/${p.month}/${p.year}`;
};
export const fmtDateTime = (ts) => (ts ? _vn(ts, true) : '');
export const fmtDate = (ts) => (ts ? _vn(ts, false) : '');

// Gợi ý cho từng loại chi (hiện trong cửa sổ chọn loại chi)
export const expenseTypeHints = {
  salary: 'Lương, thưởng, phụ cấp cho nhân viên',
  maintenance: 'Sửa chữa, thay lốp, thay nhớt, đăng kiểm xe',
  fuel: 'Đổ dầu, xăng cho xe',
  advertising: 'Chạy quảng cáo, in ấn, banner, biển hiệu',
  utilities: 'Tiền điện thoại, điện, nước, internet',
  other: 'Các khoản chi không thuộc nhóm nào ở trên',
  advance: 'Tạm ứng tiền cho nhân viên',
};
