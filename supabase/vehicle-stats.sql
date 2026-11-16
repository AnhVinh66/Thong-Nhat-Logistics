-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run.
-- Thống kê theo xe: số đơn hàng, doanh thu, chi phí nhiên liệu / bảo dưỡng, theo khoảng ngày bất kỳ.
-- CẦN CHẠY SAU: vehicles.sql, expenses.sql. Chạy nhiều lần không sao.

create index if not exists orders_plate_idx on public.orders (plate);
create index if not exists expenses_vehicle_idx on public.expenses (vehicle_id);

-- p_from / p_to: khoảng ngày (gồm cả hai đầu); để trống = tất cả thời gian.
--   * Đơn hàng tính theo NGÀY VẬN CHUYỂN (đơn chưa có ngày vận chuyển chỉ nằm trong "tất cả thời gian").
--   * Chi phí tính theo NGÀY CHI của phiếu chi loại nhiên liệu / bảo dưỡng gắn với xe.
-- p_include_pending: false = chỉ tính phiếu chi đã duyệt hoặc đã thanh toán; true = tính cả phiếu chờ duyệt.
create or replace function public.vehicle_stats(
  p_from date default null, p_to date default null, p_include_pending boolean default false
) returns table (vehicle_id uuid, plate text, order_count bigint, revenue bigint, fuel_cost bigint, maintenance_cost bigint)
language sql stable security invoker set search_path = public as $$
  select v.id,
         v.plate,
         coalesce(o.cnt, 0)::bigint,
         coalesce(o.rev, 0)::bigint,
         coalesce(e.fuel, 0)::bigint,
         coalesce(e.maint, 0)::bigint
  from public.vehicles v
  left join lateral (
    select count(*) as cnt, sum(x.fee) as rev
    from public.orders x
    where x.plate = v.plate
      and (p_from is null or x.ship_date >= p_from)
      and (p_to is null or x.ship_date <= p_to)
  ) o on true
  left join lateral (
    select sum(y.amount) filter (where y.type = 'fuel') as fuel,
           sum(y.amount) filter (where y.type = 'maintenance') as maint
    from public.expenses y
    where y.vehicle_id = v.id
      and y.type in ('fuel', 'maintenance')
      and (p_from is null or y.expense_date >= p_from)
      and (p_to is null or y.expense_date <= p_to)
      and (p_include_pending or y.status in ('approved', 'paid'))
  ) e on true
  order by v.plate;
$$;

revoke execute on function public.vehicle_stats(date, date, boolean) from public, anon;
grant execute on function public.vehicle_stats(date, date, boolean) to authenticated;
