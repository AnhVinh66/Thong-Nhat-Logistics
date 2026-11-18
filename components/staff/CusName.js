import { customerCode } from '../../lib/supabase';

// Hiển thị khách hàng: [KH0001] Tên khách
export default function CusName({ c, strong = false }) {
  if (!c) return null;
  return (
    <span className="cus-name">
      {c.customer_no != null && <span className="cus-code">{customerCode(c.customer_no)}</span>}
      {strong ? <strong>{c.name}</strong> : <span>{c.name}</span>}
    </span>
  );
}
