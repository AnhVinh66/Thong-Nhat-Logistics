// Xuất file Excel: danh sách khách hàng + công nợ, nhóm theo nhân viên phụ trách, và bảng tổng hợp theo nhân viên.
import { customerCode, customerTypes, fmtDate } from './supabase';

const NONE = 'Chưa giao cho ai';
const HEAD = { fontWeight: 'bold', backgroundColor: '#0B2545', color: '#FFFFFF', wrap: true };
const SUB = { fontWeight: 'bold', backgroundColor: '#EEF3FA' };
const TOTAL = { fontWeight: 'bold', backgroundColor: '#FFE8D1' };
const money = (v, style = {}) => ({ value: Number(v || 0), type: Number, format: '#,##0', ...style });
const text = (v, style = {}) => ({ value: v == null ? '' : String(v), type: String, ...style });

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// rows: khách hàng (đã lọc); debts: { [customerId]: { fee, paid, debt, orders:Set } }
// staffOf(row) -> { name, role } | null
export async function exportCustomersExcel({ rows, debts, staffOf, filterLabel }) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');

  // Nhóm theo nhân viên phụ trách
  const groups = {};
  rows.forEach((r) => {
    const s = staffOf(r);
    const key = s ? s.name : NONE;
    (groups[key] = groups[key] || { name: key, role: s?.role || '', list: [] }).list.push(r);
  });
  const ordered = Object.values(groups).sort((a, b) => (a.name === NONE) - (b.name === NONE) || a.name.localeCompare(b.name, 'vi'));
  const d = (r) => debts[r.id] || { fee: 0, paid: 0, debt: 0, orders: new Set() };

  // ----- Sheet 1: danh sách khách hàng -----
  const heads = ['Nhân viên phụ trách', 'Mã KH', 'Tên khách hàng', 'Phân loại', 'Số điện thoại', 'Email', 'Công ty', 'Mã số thuế', 'Địa chỉ', 'Ngày tạo', 'Số đơn', 'Tổng cước', 'Đã thu', 'Công nợ'];
  const sheet1 = [heads.map((h) => text(h, HEAD))];
  const grand = { n: 0, orders: 0, fee: 0, paid: 0, debt: 0 };
  ordered.forEach((g) => {
    const sum = { orders: 0, fee: 0, paid: 0, debt: 0 };
    [...g.list].sort((a, b) => d(b).debt - d(a).debt || a.name.localeCompare(b.name, 'vi')).forEach((r) => {
      const x = d(r);
      sum.orders += x.orders.size; sum.fee += x.fee; sum.paid += x.paid; sum.debt += x.debt;
      sheet1.push([
        text(g.name), text(customerCode(r.customer_no)), text(r.name), text(customerTypes[r.type] || ''), text(r.phone), text(r.email),
        text(r.company), text(r.tax_code), text(r.address), text(fmtDate(r.created_at)),
        { value: x.orders.size, type: Number }, money(x.fee), money(x.paid), money(x.debt, x.debt > 0 ? { color: '#B91C1C' } : {}),
      ]);
    });
    sheet1.push([
      text(`Tổng – ${g.name} (${g.list.length} khách)`, SUB), ...Array(9).fill(null).map(() => text('', SUB)),
      { value: sum.orders, type: Number, ...SUB }, money(sum.fee, SUB), money(sum.paid, SUB), money(sum.debt, SUB),
    ]);
    grand.n += g.list.length; grand.orders += sum.orders; grand.fee += sum.fee; grand.paid += sum.paid; grand.debt += sum.debt;
  });
  sheet1.push([
    text(`TỔNG CỘNG (${grand.n} khách hàng)`, TOTAL), ...Array(9).fill(null).map(() => text('', TOTAL)),
    { value: grand.orders, type: Number, ...TOTAL }, money(grand.fee, TOTAL), money(grand.paid, TOTAL), money(grand.debt, TOTAL),
  ]);

  // ----- Sheet 2: tổng hợp theo nhân viên -----
  const sheet2 = [['Nhân viên phụ trách', 'Vai trò', 'Số khách hàng', 'Số khách còn nợ', 'Tổng cước', 'Đã thu', 'Công nợ'].map((h) => text(h, HEAD))];
  ordered.forEach((g) => {
    const xs = g.list.map(d);
    sheet2.push([
      text(g.name), text(g.role), { value: g.list.length, type: Number }, { value: xs.filter((x) => x.debt > 0).length, type: Number },
      money(xs.reduce((a, x) => a + x.fee, 0)), money(xs.reduce((a, x) => a + x.paid, 0)), money(xs.reduce((a, x) => a + x.debt, 0)),
    ]);
  });
  sheet2.push([
    text('TỔNG CỘNG', TOTAL), text('', TOTAL), { value: grand.n, type: Number, ...TOTAL },
    { value: rows.filter((r) => d(r).debt > 0).length, type: Number, ...TOTAL }, money(grand.fee, TOTAL), money(grand.paid, TOTAL), money(grand.debt, TOTAL),
  ]);

  const today = new Date();
  const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const fileName = `cong-no-khach-hang_${slug(filterLabel || 'tat-ca')}_${stamp}.xlsx`;
  await writeExcelFile([
    {
      data: sheet1, sheet: 'Khách hàng & công nợ', stickyRowsCount: 1,
      columns: [{ width: 24 }, { width: 10 }, { width: 30 }, { width: 13 }, { width: 14 }, { width: 24 }, { width: 26 }, { width: 14 }, { width: 34 }, { width: 12 }, { width: 8 }, { width: 15 }, { width: 15 }, { width: 15 }],
    },
    {
      data: sheet2, sheet: 'Tổng hợp theo nhân viên', stickyRowsCount: 1,
      columns: [{ width: 26 }, { width: 22 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }],
    },
  ], { fontFamily: 'Arial', fontSize: 11 }).toFile(fileName);
  return fileName;
}
