-- Bảng chấm công & tính lương lái xe (trang /nhan-vien/cham-cong/).
-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run. Chạy lại nhiều lần vẫn an toàn.
-- Chỉ Admin và Kế toán xem / sửa được. File tự tạo hàm public.is_fin() nếu database chưa có
-- (cần bảng staff_roles, có trong schema.sql). Nếu sau này chạy roles.sql thì hàm được ghi đè bằng bản y hệt.

create or replace function public.is_fin() returns boolean     -- Admin + Kế toán
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.staff_roles where user_id = auth.uid()) in ('staff', 'accountant'), false);
$$;

-- Chấm công từng ngày. Ngày không có dòng nào: trang tự coi là đi làm nếu lái xe có chạy đơn trong ngày đó.
--   full = đi làm cả ngày (1 công) · half = nửa ngày (0,5) · leave = nghỉ phép có lương (1 công) · off = nghỉ không lương (0)
create table if not exists public.attendance (
  driver_name text not null,
  work_date date not null,
  status text not null check (status in ('full', 'half', 'leave', 'off')),
  note text,
  updated_at timestamptz not null default now(),
  primary key (driver_name, work_date)
);

-- Lương cơ bản của từng lái xe: lương tháng chia cho số ngày công chuẩn = lương 1 ngày công
create table if not exists public.driver_pay (
  driver_name text primary key,
  monthly_salary bigint not null default 0 check (monthly_salary >= 0),
  std_days numeric(4, 1) not null default 26 check (std_days > 0),
  updated_at timestamptz not null default now()
);

-- Các khoản cộng / trừ theo từng tháng khi chốt lương
create table if not exists public.payroll_month (
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  driver_name text not null,
  allowance bigint not null default 0,     -- phụ cấp / thưởng khác (cộng)
  advance bigint not null default 0,       -- đã tạm ứng (trừ)
  deduction bigint not null default 0,     -- khấu trừ khác: phạt, bảo hiểm... (trừ)
  note text,
  updated_at timestamptz not null default now(),
  primary key (month, driver_name)
);

alter table public.attendance enable row level security;
alter table public.driver_pay enable row level security;
alter table public.payroll_month enable row level security;

drop policy if exists "fin all" on public.attendance;
drop policy if exists "fin all" on public.driver_pay;
drop policy if exists "fin all" on public.payroll_month;
create policy "fin all" on public.attendance for all to authenticated using (public.is_fin()) with check (public.is_fin());
create policy "fin all" on public.driver_pay for all to authenticated using (public.is_fin()) with check (public.is_fin());
create policy "fin all" on public.payroll_month for all to authenticated using (public.is_fin()) with check (public.is_fin());
