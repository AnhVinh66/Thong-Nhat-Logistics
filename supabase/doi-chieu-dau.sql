-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run.
-- Đối chiếu dầu: số lít và đơn giá trên phiếu chi nhiên liệu, đánh dấu "đã kiểm tra".
-- CẦN CHẠY SAU: expenses.sql, roles.sql, do-dau.sql. Chạy nhiều lần không sao.

-- ===== Số lít và đơn giá trên phiếu chi nhiên liệu (chép từ ảnh màn hình cây xăng) =====
alter table public.expenses add column if not exists litres numeric(8, 2);
alter table public.expenses add column if not exists unit_price bigint;
alter table public.expenses drop constraint if exists expenses_litres_check;
alter table public.expenses add constraint expenses_litres_check check (
  (litres is null or litres > 0) and (unit_price is null or unit_price > 0)
  and ((litres is null and unit_price is null) or type = 'fuel')
);

-- ===== Dòng đối chiếu đã được kiểm tra (key: r:<lần đổ>, e:<phiếu chi>, d:<xe Vietmap>:<thời điểm>) =====
create table if not exists public.fuel_checks (
  key text primary key check (length(key) between 3 and 100),
  note text check (length(note) <= 500),
  checked_by_name text,
  checked_at timestamptz not null default now()
);
alter table public.fuel_checks enable row level security;
drop policy if exists "read" on public.fuel_checks;
create policy "read" on public.fuel_checks for select to authenticated using (public.sees_all());
drop policy if exists "fin write" on public.fuel_checks;
create policy "fin write" on public.fuel_checks for all to authenticated using (public.is_fin()) with check (public.is_fin());
