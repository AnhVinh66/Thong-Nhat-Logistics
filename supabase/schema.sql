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

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  plate text not null unique,
  volume_cbm numeric(8, 2) check (volume_cbm >= 0),
  payload_tons numeric(8, 2) check (payload_tons >= 0),
  length_m numeric(6, 2) check (length_m >= 0),
  width_m numeric(6, 2) check (width_m >= 0),
  height_m numeric(6, 2) check (height_m >= 0)
);

alter table public.vehicles enable row level security;

drop policy if exists "staff full access" on public.vehicles;
create policy "staff full access" on public.vehicles
  for all to authenticated using (true) with check (true);

-- Dữ liệu ban đầu
insert into public.vehicles (plate, volume_cbm, payload_tons, length_m, width_m, height_m) values
  ('29E-373.03', 14, 3.5, 4.31, 1.94, 1.85),
  ('29E-196.04', 14, 3.5, 4.31, 1.94, 1.85),
  ('29E-373.23', 25, 7.7, 6.30, 2.12, 2.05)
on conflict (plate) do nothing;
