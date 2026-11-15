'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase, vnd } from '../../lib/supabase';

export default function Page() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const [c, o] = await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('orders').select('fee, paid, debt'),
      ]);
      if (c.error || o.error) {
        setErr('Không tải được dữ liệu. Kiểm tra đã chạy supabase/schema.sql chưa.');
        return;
      }
      const rows = o.data || [];
      setS({
        customers: c.count || 0,
        orders: rows.length,
        fee: rows.reduce((a, r) => a + Number(r.fee), 0),
        paid: rows.reduce((a, r) => a + Number(r.paid), 0),
        debt: rows.reduce((a, r) => a + Number(r.debt), 0),
      });
    })();
  }, []);

  return (
    <>
      <h1 style={{ fontSize: '1.8rem' }}>Tổng quan</h1>
      {err && <p className="err">{err}</p>}
      <div className="grid-4" style={{ marginBottom: 28 }}>
        {[
          ['Khách hàng', s?.customers],
          ['Đơn hàng', s?.orders],
          ['Tổng cước', s && vnd(s.fee)],
          ['Công nợ còn lại', s && vnd(s.debt)],
        ].map(([label, val]) => (
          <div className="card" key={label}>
            <p className="muted small" style={{ margin: 0 }}>{label}</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--navy)', margin: 0 }}>{val ?? '—'}</p>
          </div>
        ))}
      </div>
      <div className="hero-cta">
        <Link href="/nhan-vien/khach-hang/" className="btn btn-primary">Quản lý khách hàng</Link>
        <Link href="/nhan-vien/don-hang/" className="btn btn-outline">Quản lý đơn hàng</Link>
      </div>
    </>
  );
}
