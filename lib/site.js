// ============================================================
// FILE CẤU HÌNH TRUNG TÂM – sửa thông tin công ty tại đây.
// Các mục đánh dấu [MẪU] là nội dung giả định, hãy thay bằng số liệu thật.
// ============================================================

export const site = {
  name: 'Thống Nhất Logistic',
  shortName: 'Thong Nhat Logistic',
  slogan: 'Đúng hẹn trên mọi nẻo đường',
  description:
    'Thống Nhất Logistic – vận chuyển hàng hoá nội địa đường bộ bằng xe tải trên toàn quốc. Báo giá nhanh, giao đúng hẹn, hàng hoá an toàn.',
  url: process.env.NEXT_PUBLIC_SITE_URL || 'https://thongnhatlogistic.vn', // [MẪU] đổi sang tên miền thật
  hotline: '0965328200',
  hotlineDisplay: '0965 328 200',
  zalo: '0965328200',
  email: 'vinh@tranhoangvietnam.com',
  address: 'Hà Nội',
  founded: 2025,
  workingHours: 'Điều phối 24/7 – Văn phòng 8:00–18:00 (T2–T7)', // [MẪU]
  // Formspree: tạo form tại https://formspree.io rồi điền ID (ví dụ "xyzabcde") vào biến môi trường
  // NEXT_PUBLIC_FORMSPREE_ID. Nếu để trống, form sẽ mở email có sẵn nội dung.
  formspreeId: process.env.NEXT_PUBLIC_FORMSPREE_ID || '',
};

export const nav = [
  { href: '/', label: 'Trang chủ' },
  { href: '/dich-vu/', label: 'Dịch vụ' },
  { href: '/tinh-cuoc/', label: 'Tính cước' },
  { href: '/ve-chung-toi/', label: 'Về chúng tôi' },
  { href: '/tin-tuc/', label: 'Tin tức' },
  { href: '/tuyen-dung/', label: 'Tuyển dụng' },
  { href: '/lien-he/', label: 'Liên hệ' },
];

// [MẪU] Số liệu nổi bật – cập nhật theo thực tế
export const stats = [
  { value: '2025', label: 'Năm thành lập' },
  { value: '63', label: 'Tỉnh thành nhận & giao hàng' },
  { value: '24/7', label: 'Điều phối & hỗ trợ' },
  { value: '100%', label: 'Hàng hoá được theo dõi hành trình' },
];

export const services = [
  {
    icon: 'truck',
    title: 'Vận chuyển nguyên chuyến (FTL)',
    text: 'Thuê trọn xe tải từ 1,5 tấn đến 15 tấn, chạy thẳng điểm lấy – điểm giao, phù hợp hàng số lượng lớn và lịch giao gấp.',
  },
  {
    icon: 'box',
    title: 'Ghép hàng (LTL)',
    text: 'Chỉ trả cước theo khối lượng và thể tích thực tế. Tiết kiệm chi phí cho lô hàng nhỏ, gửi đều đặn hằng tuần.',
  },
  {
    icon: 'snow',
    title: 'Vận chuyển hàng lạnh',
    text: 'Xe thùng kín, xe có thiết bị làm lạnh cho thực phẩm, nông sản, dược phẩm cần kiểm soát nhiệt độ.',
  },
  {
    icon: 'route',
    title: 'Hàng cồng kềnh – siêu trường',
    text: 'Tư vấn phương án xếp dỡ, chằng buộc và lộ trình cho máy móc, thiết bị, vật liệu xây dựng kích thước lớn.',
  },
  {
    icon: 'warehouse',
    title: 'Kho bãi & bốc xếp',
    text: 'Lưu kho ngắn hạn, bốc xếp tại điểm đi và điểm đến, đóng gói pallet theo yêu cầu của khách hàng.',
  },
  {
    icon: 'shield',
    title: 'Bảo hiểm hàng hoá',
    text: 'Hỗ trợ mua bảo hiểm hàng hoá vận chuyển, minh bạch quy trình bồi thường khi có sự cố.',
  },
];

export const whyUs = [
  { icon: 'clock', title: 'Giao đúng hẹn', text: 'Lịch trình rõ ràng, cập nhật trạng thái chuyến hàng chủ động cho khách.' },
  { icon: 'shield', title: 'An toàn hàng hoá', text: 'Quy trình xếp dỡ, chằng buộc chuẩn; tài xế được đào tạo và giám sát.' },
  { icon: 'price', title: 'Giá minh bạch', text: 'Báo giá trọn gói, không phát sinh ẩn. Có công cụ tính cước tham khảo ngay trên web.' },
  { icon: 'phone', title: 'Hỗ trợ 24/7', text: 'Đường dây nóng và điều phối viên luôn sẵn sàng xử lý mọi tình huống.' },
];

export const steps = [
  { title: 'Gửi yêu cầu', text: 'Điền form báo giá hoặc gọi hotline, cho chúng tôi biết điểm đi, điểm đến và loại hàng.' },
  { title: 'Nhận báo giá', text: 'Nhân viên liên hệ xác nhận chi tiết và gửi báo giá trọn gói trong thời gian ngắn.' },
  { title: 'Lấy hàng & vận chuyển', text: 'Xe đến đúng giờ, bốc xếp an toàn và vận chuyển theo lộ trình đã thống nhất.' },
  { title: 'Giao hàng & đối soát', text: 'Giao tận nơi, ký nhận chứng từ, thanh toán và đối soát rõ ràng.' },
];

// [MẪU] Đội xe – cập nhật tải trọng/kích thước thực tế
export const fleet = [
  { id: 't15', name: 'Xe tải 1,5 tấn', load: '1,5 tấn', size: 'Thùng ~3,2 m', use: 'Hàng nhẹ, giao nội thành & liên tỉnh gần', rate: 12000, min: 600000 },
  { id: 't35', name: 'Xe tải 3,5 tấn', load: '3,5 tấn', size: 'Thùng ~4,3 m', use: 'Hàng tiêu dùng, nội thất, hàng thương mại', rate: 15000, min: 900000 },
  { id: 't5', name: 'Xe tải 5 tấn', load: '5 tấn', size: 'Thùng ~6 m', use: 'Hàng pallet, vật tư, hàng công nghiệp', rate: 18000, min: 1200000 },
  { id: 't8', name: 'Xe tải 8 tấn', load: '8 tấn', size: 'Thùng ~7 m', use: 'Hàng khối lượng lớn đường dài', rate: 22000, min: 1800000 },
  { id: 't15x', name: 'Xe tải 15 tấn', load: '15 tấn', size: 'Thùng ~9,5 m', use: 'Hàng nặng, vận chuyển Bắc – Nam', rate: 30000, min: 3000000 },
];

// Khoảng cách tham khảo (km) giữa các thành phố lớn – dùng cho công cụ tính cước
export const cities = [
  'Hà Nội', 'Hải Phòng', 'Quảng Ninh', 'Thái Nguyên', 'Lạng Sơn', 'Lào Cai', 'Thanh Hoá', 'Vinh',
  'Hà Tĩnh', 'Đồng Hới', 'Huế', 'Đà Nẵng', 'Quy Nhơn', 'Nha Trang', 'Buôn Ma Thuột', 'Đà Lạt',
  'Biên Hoà', 'TP. Hồ Chí Minh', 'Cần Thơ',
];
// Quãng đường theo trục quốc lộ 1A tính từ Hà Nội (km) – giá trị gần đúng
export const kmFromHanoi = {
  'Hà Nội': 0, 'Hải Phòng': 120, 'Quảng Ninh': 155, 'Thái Nguyên': 80, 'Lạng Sơn': 155, 'Lào Cai': 330,
  'Thanh Hoá': 155, 'Vinh': 295, 'Hà Tĩnh': 340, 'Đồng Hới': 490, 'Huế': 660, 'Đà Nẵng': 765,
  'Quy Nhơn': 1060, 'Nha Trang': 1280, 'Buôn Ma Thuột': 1370, 'Đà Lạt': 1480, 'Biên Hoà': 1700,
  'TP. Hồ Chí Minh': 1730, 'Cần Thơ': 1900,
};
// Các nhánh không nằm trên trục 1A: dùng để trừ khi cả hai điểm cùng phía
export const branchOffAxis = ['Hải Phòng', 'Quảng Ninh', 'Thái Nguyên', 'Lạng Sơn', 'Lào Cai'];

export const cargoTypes = [
  { id: 'normal', label: 'Hàng thông thường', factor: 1 },
  { id: 'fragile', label: 'Hàng dễ vỡ / giá trị cao', factor: 1.1 },
  { id: 'bulky', label: 'Hàng cồng kềnh', factor: 1.15 },
  { id: 'cold', label: 'Hàng lạnh / kiểm soát nhiệt độ', factor: 1.3 },
];

export const jobs = [
  {
    title: 'Tài xế xe tải (hạng C / FC)',
    location: 'Hà Nội',
    type: 'Toàn thời gian',
    desc: 'Lái xe tải 5–15 tấn tuyến liên tỉnh. Có kinh nghiệm từ 2 năm, sức khoẻ tốt, tác phong an toàn.',
  },
  {
    title: 'Nhân viên điều phối vận tải',
    location: 'Hà Nội',
    type: 'Toàn thời gian',
    desc: 'Sắp xếp xe – chuyến, theo dõi hành trình, làm việc với khách hàng và tài xế. Ưu tiên có kinh nghiệm logistics.',
  },
  {
    title: 'Nhân viên kinh doanh vận tải',
    location: 'Hà Nội',
    type: 'Toàn thời gian',
    desc: 'Tìm kiếm khách hàng doanh nghiệp, tư vấn và báo giá dịch vụ vận chuyển. Lương cứng + hoa hồng hấp dẫn.',
  },
];
