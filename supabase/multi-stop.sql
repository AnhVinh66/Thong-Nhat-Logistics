-- !!! Nếu đã chạy driver-role.sql: sau khi chạy file này PHẢI chạy lại driver-role.sql,
-- !!! nếu không lái xe sẽ xem được toàn bộ dữ liệu.
-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run.
-- Thêm tính năng "Đơn hàng trả hàng nhiều điểm". Chạy nhiều lần không sao.

-- Đơn nhiều điểm không có một khách hàng / một điểm đến duy nhất
alter table public.orders alter column customer_id drop not null;
alter table public.orders alter column delivery drop not null;
alter table public.orders add column if not exists order_type text not null default 'single';

alter table public.orders drop constraint if exists orders_type_check;
alter table public.orders add constraint orders_type_check check (
  order_type in ('single', 'multi')
  and (order_type <> 'single' or (customer_id is not null and delivery is not null))
);

-- Các điểm trả hàng của đơn nhiều điểm (mỗi điểm có khách hàng, địa chỉ, hàng và cước riêng)
create table if not exists public.order_stops (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  position int not null default 0,
  customer_id uuid not null references public.customers (id) on delete restrict,
  address text not null,
  cargo text,
  weight text,
  fee bigint not null default 0 check (fee >= 0)
);

create index if not exists order_stops_order_idx on public.order_stops (order_id);
create index if not exists order_stops_customer_idx on public.order_stops (customer_id);

alter table public.order_stops enable row level security;

drop policy if exists "staff full access" on public.order_stops;
create policy "staff full access" on public.order_stops
  for all to authenticated using (true) with check (true);
