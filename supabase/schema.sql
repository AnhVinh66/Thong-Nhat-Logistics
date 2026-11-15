-- Chạy toàn bộ file này trong Supabase: SQL Editor -> New query -> Run.
-- QUAN TRỌNG: sau đó vào Authentication -> Sign In / Providers và TẮT "Allow new users to sign up",
-- nếu không bất kỳ ai cũng có thể tự đăng ký và xem dữ liệu. Tài khoản nhân viên do bạn tạo thủ công
-- tại Authentication -> Users -> Add user.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  phone text not null,
  email text,
  address text,
  company text,
  tax_code text,
  type text not null default 'le' check (type in ('le', 'doanh_nghiep', 'dai_ly')),
  note text
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no bigint generated always as identity,
  created_at timestamptz not null default now(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  pickup text not null,
  delivery text not null,
  cargo text,
  weight text,
  truck text,
  plate text,
  driver text,
  ship_date date,
  fee bigint not null default 0 check (fee >= 0),
  paid bigint not null default 0 check (paid >= 0),
  debt bigint generated always as (fee - paid) stored
);

create index if not exists orders_customer_idx on public.orders (customer_id);
create index if not exists orders_ship_date_idx on public.orders (ship_date desc);

alter table public.customers enable row level security;
alter table public.orders enable row level security;

-- Chỉ người đã đăng nhập (nhân viên) mới đọc/ghi được. Người chưa đăng nhập (anon) không có quyền nào.
drop policy if exists "staff full access" on public.customers;
create policy "staff full access" on public.customers
  for all to authenticated using (true) with check (true);

drop policy if exists "staff full access" on public.orders;
create policy "staff full access" on public.orders
  for all to authenticated using (true) with check (true);
