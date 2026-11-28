-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run.
-- Lãi lỗ theo xe + bảng khấu hao và bảng lãi ngân hàng của xe, nhập theo tháng.
-- CẦN CHẠY SAU: vehicles.sql, expenses.sql, order-fees.sql, roles.sql. Chạy nhiều lần không sao.
--
-- Lãi lỗ của xe = Doanh thu (cước các đơn hàng của xe)
--               − (Nhiên liệu + Cầu đường BOT của các đơn hàng + Bảo dưỡng + Khấu hao + Lãi ngân hàng)

-- ===== Khấu hao xe theo tháng =====
create table if not exists public.vehicle_depreciation (
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  year smallint not null check (year between 2000 and 2100),
  month smallint not null check (month between 1 and 12),
  amount bigint not null check (amount >= 0),
  updated_at timestamptz not null default now(),
  updated_by_name text,
  primary key (vehicle_id, year, month)
);

alter table public.vehicle_depreciation enable row level security;

-- Chỉ Admin và Kế toán được xem và nhập khấu hao
drop policy if exists "fin all" on public.vehicle_depreciation;
create policy "fin all" on public.vehicle_depreciation
  for all to authenticated using (public.is_fin()) with check (public.is_fin());

-- ===== Lãi ngân hàng (khoản vay mua xe) theo tháng =====
-- Nhập tay hoặc import từ file Excel lịch trả nợ của ngân hàng (chỉ lấy cột tiền lãi, không tính tiền gốc).
create table if not exists public.vehicle_loan_interest (
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  year smallint not null check (year between 2000 and 2100),
  month smallint not null check (month between 1 and 12),
  amount bigint not null check (amount >= 0),
  updated_at timestamptz not null default now(),
  updated_by_name text,
  primary key (vehicle_id, year, month)
);

alter table public.vehicle_loan_interest enable row level security;

drop policy if exists "fin all" on public.vehicle_loan_interest;
create policy "fin all" on public.vehicle_loan_interest
  for all to authenticated using (public.is_fin()) with check (public.is_fin());

-- ===== Lãi lỗ theo xe, chia theo từng tháng =====
-- Trả về mỗi xe × mỗi tháng nằm trong [p_from, p_to] một dòng (tối đa 5 năm).
--   * Doanh thu, cầu đường: theo NGÀY VẬN CHUYỂN của đơn hàng (orders.fee, orders.toll_fee).
--   * Nhiên liệu, bảo dưỡng: theo NGÀY CHI của phiếu chi gắn với xe.
--     p_include_pending = false: chỉ phiếu đã duyệt / đã thanh toán.
--   * Khấu hao, lãi ngân hàng: số đã nhập cho tháng đó (người không phải Admin / Kế toán thấy 0).
drop function if exists public.vehicle_profit(date, date, boolean);  -- bản cũ chưa có cột lãi ngân hàng
create or replace function public.vehicle_profit(
  p_from date, p_to date, p_include_pending boolean default false
) returns table (
  vehicle_id uuid, plate text, month date, order_count bigint, revenue bigint,
  toll_cost bigint, fuel_cost bigint, maintenance_cost bigint, depreciation bigint, interest bigint
)
language sql stable security invoker set search_path = public as $$
  with m as (
    select g::date as m_start,
           greatest(g::date, p_from) as d_from,
           least((g + interval '1 month - 1 day')::date, p_to) as d_to
    from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') g
    where p_from is not null and p_to is not null and p_to >= p_from and p_to <= p_from + 1830
  )
  select v.id,
         v.plate,
         m.m_start,
         coalesce(o.cnt, 0)::bigint,
         coalesce(o.rev, 0)::bigint,
         coalesce(o.toll, 0)::bigint,
         coalesce(e.fuel, 0)::bigint,
         coalesce(e.maint, 0)::bigint,
         coalesce(d.amount, 0)::bigint,
         coalesce(i.amount, 0)::bigint
  from public.vehicles v
  cross join m
  left join lateral (
    select count(*) as cnt, sum(x.fee) as rev, sum(x.toll_fee) as toll
    from public.orders x
    where x.plate = v.plate and x.ship_date between m.d_from and m.d_to
  ) o on true
  left join lateral (
    select sum(y.amount) filter (where y.type = 'fuel') as fuel,
           sum(y.amount) filter (where y.type = 'maintenance') as maint
    from public.expenses y
    where y.vehicle_id = v.id
      and y.type in ('fuel', 'maintenance')
      and y.expense_date between m.d_from and m.d_to
      and (p_include_pending or y.status in ('approved', 'paid'))
  ) e on true
  left join public.vehicle_depreciation d
    on d.vehicle_id = v.id and d.year = extract(year from m.m_start) and d.month = extract(month from m.m_start)
  left join public.vehicle_loan_interest i
    on i.vehicle_id = v.id and i.year = extract(year from m.m_start) and i.month = extract(month from m.m_start)
  order by v.plate, m.m_start;
$$;

revoke execute on function public.vehicle_profit(date, date, boolean) from public, anon;
grant execute on function public.vehicle_profit(date, date, boolean) to authenticated;
