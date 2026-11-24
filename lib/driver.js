// Thưởng doanh số lái xe theo NGÀY, tính trên tổng doanh thu các đơn đã Hoàn thành trong ngày đó:
//   2.000.000 – 2.999.999 đ  -> 100.000 đ
//   3.000.000 – 5.000.000 đ  -> 200.000 đ
//   trên 5.000.000 đ         -> 300.000 đ
export const BONUS_RULES = [
  { min: 5000001, bonus: 300000, label: 'Trên 5.000.000 đ' },
  { min: 3000000, bonus: 200000, label: '3.000.000 – 5.000.000 đ' },
  { min: 2000000, bonus: 100000, label: '2.000.000 – 2.999.999 đ' },
];

export function dailyBonus(revenue) {
  const r = Number(revenue || 0);
  const rule = BONUS_RULES.find((x) => r >= x.min);
  return rule ? rule.bonus : 0;
}

// Doanh thu của một đơn tính cho lái xe:
//  - total: cước của cả đơn (đơn nhiều điểm = tổng cước các điểm trả);
//  - done : phần đã Hoàn thành (đơn 1 điểm: cả đơn khi Hoàn thành; đơn nhiều điểm: cộng cước các điểm trả đã Hoàn thành).
export function orderRevenue(o) {
  if (o.order_type === 'multi') {
    const stops = o.order_stops || [];
    const total = stops.length ? stops.reduce((a, s) => a + Number(s.fee || 0), 0) : Number(o.fee || 0);
    const done = stops.filter((s) => s.status === 'done').reduce((a, s) => a + Number(s.fee || 0), 0);
    return { total, done };
  }
  const total = Number(o.fee || 0);
  return { total, done: o.status === 'done' ? total : 0 };
}

// Thưởng chạy buổi tối, tính theo từng chuyến (nhập tay ở trang Chấm công & lương):
//   xe 3,5 tấn -> 100.000 đ / chuyến · xe 7 tấn -> 150.000 đ / chuyến
export const NIGHT_RATES = { t35: 100000, t7: 150000 };
