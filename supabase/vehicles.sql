-- !!! Nếu đã chạy driver-role.sql: sau khi chạy file này PHẢI chạy lại driver-role.sql,
-- !!! nếu không lái xe sẽ xem được toàn bộ dữ liệu.
-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run.
-- (Dành cho dự án đã chạy schema.sql trước đó. File schema.sql mới cũng đã gồm bảng này.)

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
  ('29E-378.23', 25, 7.7, 6.30, 2.12, 2.05)
on conflict (plate) do nothing;
