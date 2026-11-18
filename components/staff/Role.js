'use client';

import { createContext, useContext } from 'react';

// Vai trò văn phòng: staff = Quản trị (toàn quyền), dispatcher = Điều phối / Kinh doanh, accountant = Kế toán
export const roleLabel = {
  staff: 'Quản trị',
  dispatcher: 'Điều phối / Kinh doanh',
  accountant: 'Kế toán',
  driver: 'Lái xe',
};

export const roleDesc = {
  staff: 'Toàn quyền, tạo tài khoản và phân quyền',
  dispatcher: 'Khách hàng, Đơn hàng, Danh sách xe; xem công nợ',
  accountant: 'Thu tiền, Chi tiền, Ngân hàng; chỉ xem Khách hàng, Đơn hàng, Xe',
  driver: 'Chỉ xem chuyến của mình trên điện thoại',
};

// Trang nào xem được, và ai được sửa dữ liệu
const VIEW = {
  '/nhan-vien': ['staff', 'dispatcher', 'accountant'],
  '/nhan-vien/don-hang': ['staff', 'dispatcher', 'accountant'],
  '/nhan-vien/khach-hang': ['staff', 'dispatcher', 'accountant'],
  '/nhan-vien/xe': ['staff', 'dispatcher', 'accountant'],
  '/nhan-vien/thu-tien': ['staff', 'accountant'],
  '/nhan-vien/chi-tien': ['staff', 'accountant'],
  '/nhan-vien/ngan-hang': ['staff', 'accountant'],
  '/nhan-vien/tai-khoan': ['staff'],
};
const EDIT = {
  ops: ['staff', 'dispatcher'], // Khách hàng, Đơn hàng, Xe
  fin: ['staff', 'accountant'], // Thu, Chi, Ngân hàng
};

export function canView(role, pathname) {
  const p = (pathname || '').replace(/\/+$/, '') || '/nhan-vien';
  const key = Object.keys(VIEW)
    .sort((a, b) => b.length - a.length)
    .find((k) => p === k || p.startsWith(k + '/'));
  return key ? VIEW[key].includes(role) : role === 'staff';
}

const Ctx = createContext({ role: 'staff', canEditOps: true, canEditFin: true });

export function RoleProvider({ role, children }) {
  const value = { role, canEditOps: EDIT.ops.includes(role), canEditFin: EDIT.fin.includes(role) };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useRole = () => useContext(Ctx);
