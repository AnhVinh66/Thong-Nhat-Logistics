import { createClient } from '@supabase/supabase-js';

// URL và anon key là thông tin công khai theo thiết kế của Supabase; dữ liệu được bảo vệ bởi
// Row Level Security (xem supabase/schema.sql) và việc tắt đăng ký công khai.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
