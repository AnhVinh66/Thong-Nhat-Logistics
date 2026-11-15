-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run.
-- Lưu các điểm lấy hàng để gợi ý khi tạo đơn hàng mới. Chạy nhiều lần không sao.

create table if not exists public.pickup_points (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  address text not null unique
);

alter table public.pickup_points enable row level security;

drop policy if exists "staff full access" on public.pickup_points;
create policy "staff full access" on public.pickup_points
  for all to authenticated using (true) with check (true);
