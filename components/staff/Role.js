'use client';

import { createContext, useContext } from 'react';

// Vai trò: staff = Admin, sales = Nhân viên kinh doanh, accountant = Kế toán, dispatcher = Điều phối xe, driver = Lái xe
export const roleLabel = {
  staff: 'Admin',
  sales: 'Nhân viên kinh doanh',
  accountant: 'Kế toán',
  dispatcher: 'Điều phối xe',
  driver: 'Lái xe',
};

export const roleDesc = {
  staff: 'Toàn quyền, tạo tài khoản và phân quyền',
  sales: 'Chỉ thấy khách hàng mình phụ trách cùng đơn hàng, phiếu Thu của các khách đó; chỉ thêm đơn hàng (không sửa, không xoá); không xoá khách; không sửa / xoá phiếu Thu',
  accountant: 'Xem tất cả; chỉ thêm khách hàng và đơn hàng; xem Thu; toàn quyền Chi tiền, Giao dịch ngân hàng, Danh sách xe',
  dispatcher: 'Xem tất cả; chỉ thêm khách hàng và đơn hàng; xem Thu; Chi tiền chỉ của mình; toàn quyền Danh sách xe',
  driver: 'Chỉ xem chuyến của mình trên điện thoại',
};

// Trang nào xem được (theo bảng phân quyền)
const VIEW = {
  '/nhan-vien': ['staff', 'sales', 'accountant', 'dispatcher'],
  '/nhan-vien/don-hang': ['staff', 'sales', 'accountant', 'dispatcher'],
  '/nhan-vien/khach-hang': ['staff', 'sales', 'accountant', 'dispatcher'],
  '/nhan-vien/thu-tien': ['staff', 'sales', 'accountant', 'dispatcher'],
  '/nhan-vien/chi-tien': ['staff', 'sales', 'accountant', 'dispatcher'],
  '/nhan-vien/ngan-hang': ['staff', 'accountant'],
  '/nhan-vien/xe': ['staff', 'accountant', 'dispatcher'],
  '/nhan-vien/tai-khoan': ['staff'],
};

export function canView(role, pathname) {
  const p = (pathname || '').replace(/\/+$/, '') || '/nhan-vien';
  const key = Object.keys(VIEW)
    .sort((a, b) => b.length - a.length)
    .find((k) => p === k || p.startsWith(k + '/'));
  return key ? VIEW[key].includes(role) : role === 'staff';
}

const is = (...roles) => (role) => roles.includes(role);

// Thao tác được phép (cơ sở dữ liệu cũng chặn theo đúng các quy tắc này)
function abilities(role) {
  return {
    role,
    isSales: role === 'sales',
    addCustomer: is('staff', 'sales', 'accountant', 'dispatcher')(role),
    editCustomer: is('staff', 'sales')(role), // kinh doanh chỉ sửa khách của mình (cơ sở dữ liệu lọc sẵn)
    deleteCustomer: role === 'staff',
    assignCustomer: role === 'staff', // chọn nhân viên kinh doanh phụ trách
    addOrder: is('staff', 'sales', 'accountant', 'dispatcher')(role),
    editOrder: role === 'staff',
    deleteOrder: role === 'staff',
    addCollection: is('staff', 'sales')(role),
    editCollection: role === 'staff', // sửa / xoá phiếu Thu
    addExpense: is('staff', 'sales', 'accountant', 'dispatcher')(role),
    manageAllExpenses: is('staff', 'accountant')(role), // duyệt, thanh toán, sửa / xoá lệnh Chi của mọi người
    editVehicle: is('staff', 'accountant', 'dispatcher')(role),
  };
}

const Ctx = createContext({ ...abilities('staff'), userId: null });

export function RoleProvider({ role, userId, children }) {
  return <Ctx.Provider value={{ ...abilities(role), userId }}>{children}</Ctx.Provider>;
}

export const useRole = () => useContext(Ctx);
