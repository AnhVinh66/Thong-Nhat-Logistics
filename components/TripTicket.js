import Icon from './Icon';

// Phiếu chuyến xe minh hoạ – giống phiếu Thống Nhất CMS tạo cho mỗi chuyến.
// Cước tính theo bảng giá xe 3,5 tấn trong lib/site.js (125 km x 25.000 đ/km).
export default function TripTicket() {
  return (
    <figure className="ticket" aria-label="Ví dụ phiếu chuyến xe">
      <div className="ticket-head">
        <span className="ticket-no">Chuyến DH0128 · Sáng</span>
        <span className="ticket-ok"><Icon name="check" size={14} /> Đã giao</span>
      </div>

      <div className="ticket-route">
        <svg className="ticket-line" viewBox="0 0 16 112" aria-hidden="true">
          <circle cx="8" cy="8" r="6" />
          <path d="M8 18 V94" />
          <circle cx="8" cy="104" r="6" className="end" />
        </svg>
        <ol>
          <li>
            <span className="ticket-label">Lấy hàng · 07:30</span>
            <strong>KCN Quang Minh, Mê Linh, Hà Nội</strong>
          </li>
          <li>
            <span className="ticket-label">Giao hàng · 10:45</span>
            <strong>KCN Đình Vũ, Hải An, Hải Phòng</strong>
          </li>
        </ol>
      </div>

      <dl className="ticket-grid">
        <div><dt>Xe</dt><dd>Tải 3,5 tấn, thùng kín</dd></div>
        <div><dt>Hàng</dt><dd>8 kiện · 2,1 tấn</dd></div>
        <div><dt>Quãng đường</dt><dd>125 km</dd></div>
        <div><dt>Cước trọn gói</dt><dd className="ticket-fee">3.125.000 đ</dd></div>
      </dl>

      <div className="ticket-doc">
        <Icon name="doc" size={16} />
        <span>Biên bản giao nhận · 2 ảnh</span>
        <span className="ticket-sign">Người nhận đã ký</span>
      </div>
      <figcaption className="ticket-cap">Ví dụ phiếu chuyến. Mỗi chuyến đều có phiếu và biên bản giao nhận như thế này.</figcaption>
    </figure>
  );
}
