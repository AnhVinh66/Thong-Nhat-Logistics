-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run.
-- Hồ sơ xe: hạn giấy tờ xe (đăng kiểm, bảo hiểm, phù hiệu...) và lịch bảo dưỡng theo km / tháng.
-- CẦN CHẠY SAU: schema.sql, expenses.sql, roles.sql. Chạy nhiều lần không sao.
-- Quyền: Admin, Kế toán, Điều phối xem và nhập (hàm sees_all trong roles.sql).

-- ===== Giấy tờ xe: mỗi lần gia hạn là một dòng mới, dòng có hạn xa nhất là giấy đang dùng =====
create table if not exists public.vehicle_docs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  kind text not null check (kind in ('registration', 'tnds', 'hull', 'badge', 'road_fee', 'city_permit')),
  doc_no text check (length(doc_no) <= 100),
  issued_on date,
  expires_on date not null,
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(),
  created_by_name text,
  check (issued_on is null or issued_on <= expires_on)
);
create index if not exists vehicle_docs_vehicle_kind on public.vehicle_docs (vehicle_id, kind, expires_on desc);
alter table public.vehicle_docs enable row level security;
drop policy if exists "ops all" on public.vehicle_docs;
create policy "ops all" on public.vehicle_docs for all to authenticated using (public.sees_all()) with check (public.sees_all());

-- ===== Hạng mục bảo dưỡng: chu kỳ theo km, theo tháng, hoặc cả hai (cái nào đến trước) =====
create table if not exists public.maint_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(name) between 1 and 100),
  every_km integer check (every_km > 0),
  every_months smallint check (every_months between 1 and 120),
  sort smallint not null default 0,
  check (every_km is not null or every_months is not null)
);
alter table public.maint_items enable row level security;
drop policy if exists "ops all" on public.maint_items;
create policy "ops all" on public.maint_items for all to authenticated using (public.sees_all()) with check (public.sees_all());

-- Mức thông dụng cho xe tải nhẹ, sửa lại trong CMS cho đúng sổ bảo dưỡng của hãng
insert into public.maint_items (name, every_km, every_months, sort) values
  ('Thay dầu máy', 10000, 6, 1),
  ('Lọc dầu, lọc gió', 20000, 12, 2),
  ('Lọc nhiên liệu', 30000, 12, 3),
  ('Má phanh', 40000, null, 4),
  ('Dầu hộp số, dầu cầu', 40000, 24, 5),
  ('Lốp xe', 80000, null, 6)
on conflict (name) do nothing;

-- ===== Các lần đã bảo dưỡng =====
create table if not exists public.maint_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  item_id uuid not null references public.maint_items (id) on delete cascade,
  done_on date not null,
  odo_km integer check (odo_km >= 0),
  note text check (length(note) <= 500),
  expense_id uuid references public.expenses (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by_name text
);
create index if not exists maint_logs_vehicle_item on public.maint_logs (vehicle_id, item_id, done_on desc);
alter table public.maint_logs enable row level security;
drop policy if exists "ops all" on public.maint_logs;
create policy "ops all" on public.maint_logs for all to authenticated using (public.sees_all()) with check (public.sees_all());
