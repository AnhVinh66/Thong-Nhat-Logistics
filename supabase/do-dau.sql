-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run.
-- Lần đổ dầu nhận diện từ cảm biến Vietmap, và phiếu chi nhiên liệu "chờ nhập tiền" ở trang Chi tiền.
-- CẦN CHẠY SAU: expenses.sql, roles.sql. Chạy nhiều lần không sao.
--
-- Mỗi lần đổ dầu là một dòng fuel_refills. Dòng cần phiếu chi mà chưa có phiếu = "Chờ nhập tiền".
-- Người dùng nhập số tiền -> tạo phiếu chi bình thường (expenses.fuel_refill_id trỏ về lần đổ), trạng thái Chờ duyệt.
-- Xoá phiếu chi đó thì lần đổ quay lại "Chờ nhập tiền".

-- Từ ngày này trở đi mỗi lần đổ dầu mới sinh phiếu chờ nhập tiền; trước đó chỉ ghi lại để đếm số lượt. Muốn đổi thì sửa ngày rồi chạy lại.
create or replace function public.fuel_voucher_from() returns date
language sql immutable set search_path = public as $$ select date '2026-11-25' $$;

create table if not exists public.fuel_refills (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  refilled_at timestamptz not null,
  litres numeric(7, 1) not null check (litres > 0 and litres <= 1000),
  address text,
  estimated boolean not null default false,       -- true: chỉ biết ngày và số lít, không rõ giờ đổ
  needs_voucher boolean not null default true,    -- false: đổ trước ngày bật tính năng, không sinh phiếu chi
  expense_id uuid references public.expenses (id) on delete set null,
  skipped_at timestamptz,                         -- bỏ qua, không lập phiếu chi (VD đã có phiếu nhập tay)
  skipped_by_name text
);
create index if not exists fuel_refills_vehicle_idx on public.fuel_refills (vehicle_id, refilled_at);
create index if not exists fuel_refills_expense_idx on public.fuel_refills (expense_id);

alter table public.expenses add column if not exists fuel_refill_id uuid;
create unique index if not exists expenses_fuel_refill_key on public.expenses (fuel_refill_id) where fuel_refill_id is not null;

-- Chỉ Admin, Kế toán, Điều phối xe xem được. Ghi chỉ qua các hàm bên dưới.
alter table public.fuel_refills enable row level security;
drop policy if exists "refill select" on public.fuel_refills;
create policy "refill select" on public.fuel_refills for select to authenticated using (public.sees_all());
revoke insert, update, delete, truncate on public.fuel_refills from anon, authenticated;

-- Ghi các lần đổ dầu mới. p_rows: [{ vehicle_id, refilled_at, litres, address, estimated }]. Lần đã ghi thì bỏ qua. Trả về số dòng thêm mới.
create or replace function public.record_fuel_refills(p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_day date;
  n int := 0;
begin
  if not public.sees_all() then
    raise exception 'Bạn không có quyền ghi lần đổ dầu.';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 200 then
    raise exception 'Danh sách lần đổ dầu không hợp lệ.';
  end if;
  perform pg_advisory_xact_lock(hashtext('record_fuel_refills')); -- hai người cùng mở trang thì không ghi trùng

  for r in
    select * from jsonb_to_recordset(p_rows)
      as x(vehicle_id uuid, refilled_at timestamptz, litres numeric, address text, estimated boolean)
    order by refilled_at
  loop
    if r.vehicle_id is null or r.litres is null or r.litres < 5 or r.litres > 1000
       or r.refilled_at is null or r.refilled_at > now() or r.refilled_at < now() - interval '400 days' then
      continue;
    end if;
    v_day := (r.refilled_at at time zone 'Asia/Ho_Chi_Minh')::date;
    if exists (
      select 1 from public.fuel_refills f
      where f.vehicle_id = r.vehicle_id
        and (
          f.refilled_at between r.refilled_at - interval '45 minutes' and r.refilled_at + interval '45 minutes'
          or ((f.estimated or coalesce(r.estimated, false)) and (f.refilled_at at time zone 'Asia/Ho_Chi_Minh')::date = v_day)
        )
    ) then
      continue;
    end if;
    insert into public.fuel_refills (vehicle_id, refilled_at, litres, address, estimated, needs_voucher)
    values (r.vehicle_id, r.refilled_at, round(r.litres, 1), left(r.address, 300), coalesce(r.estimated, false), v_day >= public.fuel_voucher_from());
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Bỏ qua / khôi phục một phiếu chờ nhập tiền: chỉ Admin và Kế toán
create or replace function public.skip_fuel_refill(p_id uuid, p_skip boolean, p_by text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_fin() then
    raise exception 'Chỉ Admin và Kế toán được bỏ qua phiếu đổ dầu.';
  end if;
  update public.fuel_refills
     set skipped_at = case when p_skip then now() end,
         skipped_by_name = case when p_skip then left(p_by, 100) end
   where id = p_id and expense_id is null;
end;
$$;

-- Phiếu chi gắn với lần đổ dầu: mỗi lần đổ chỉ một phiếu, đúng xe; không đổi liên kết về sau
create or replace function public.expenses_c_refill() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  f public.fuel_refills;
begin
  if tg_op = 'UPDATE' then
    new.fuel_refill_id := old.fuel_refill_id;
    return new;
  end if;
  if new.fuel_refill_id is null then return new; end if;
  if not public.sees_all() then
    raise exception 'Bạn không có quyền lập phiếu cho lần đổ dầu này.';
  end if;
  select * into f from public.fuel_refills where id = new.fuel_refill_id for update;
  if not found then
    raise exception 'Không tìm thấy lần đổ dầu này. Hãy tải lại trang.';
  end if;
  if f.expense_id is not null then
    raise exception 'Lần đổ dầu này đã có phiếu chi. Hãy tải lại trang.';
  end if;
  if new.type <> 'fuel' or new.vehicle_id is distinct from f.vehicle_id then
    raise exception 'Phiếu của lần đổ dầu phải là chi Nhiên liệu và đúng xe đã đổ.';
  end if;
  return new;
end;
$$;
drop trigger if exists expenses_c_refill on public.expenses;
create trigger expenses_c_refill before insert or update on public.expenses
  for each row execute function public.expenses_c_refill();

create or replace function public.expenses_refill_link() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.fuel_refills set expense_id = new.id, skipped_at = null, skipped_by_name = null where id = new.fuel_refill_id;
  return null;
end;
$$;
drop trigger if exists expenses_refill_link on public.expenses;
create trigger expenses_refill_link after insert on public.expenses
  for each row when (new.fuel_refill_id is not null) execute function public.expenses_refill_link();

revoke execute on function public.record_fuel_refills(jsonb) from public, anon;
revoke execute on function public.skip_fuel_refill(uuid, boolean, text) from public, anon;
revoke execute on function public.expenses_c_refill() from public, anon, authenticated;
revoke execute on function public.expenses_refill_link() from public, anon, authenticated;
grant execute on function public.record_fuel_refills(jsonb) to authenticated;
grant execute on function public.skip_fuel_refill(uuid, boolean, text) to authenticated;
