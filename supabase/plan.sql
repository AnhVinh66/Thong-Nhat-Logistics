-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run.
-- Kế hoạch chạy xe theo tuần: buổi (Sáng / Chiều / Tối) và thứ tự các chuyến của một xe trong một ngày. Chạy nhiều lần không sao.
-- CẦN CHẠY SAU schema.sql (hoặc vehicles.sql + driver-role.sql). Không phụ thuộc roles.sql.
--
-- Mỗi đơn hàng là một chuyến: xe (plate), tài xế (driver), ngày (ship_date) đã có sẵn trên đơn.
-- Cột mới: trip_period = buổi chạy ('am' = Sáng, 'pm' = Chiều, 'eve' = Tối, rỗng = chưa chọn buổi);
--          trip_seq = số thứ tự chuyến trong ngày của xe đó (1, 2, 3...), xếp theo Sáng -> Chiều -> Tối -> chưa chọn buổi.
-- Chỉ Admin (staff) và Điều phối xe (dispatcher) được xếp / đổi xe, ngày, buổi, tài xế, thứ tự — qua các hàm dưới đây.

alter table public.orders add column if not exists trip_seq int check (trip_seq > 0);
alter table public.orders add column if not exists trip_period text;
alter table public.orders drop constraint if exists orders_trip_period_check;
alter table public.orders add constraint orders_trip_period_check check (trip_period in ('am', 'pm', 'eve'));
create index if not exists orders_plan_idx on public.orders (plate, ship_date, trip_seq);

-- Đánh lại số thứ tự 1..n cho các chuyến của một xe trong một ngày theo thứ tự Sáng -> Chiều -> chưa chọn buổi,
-- đưa chuyến p_order vào vị trí p_pos (đếm trong cùng buổi; null = cuối buổi)
create or replace function public.plan_resequence(p_plate text, p_date date, p_order uuid, p_pos int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_period text;
  ids uuid[] := '{}';
  band uuid[];
  b text;
begin
  if p_order is not null then
    select trip_period into v_period from public.orders where id = p_order;
  end if;
  foreach b in array array['am', 'pm', 'eve', ''] loop
    select coalesce(array_agg(id order by trip_seq nulls last, order_no), '{}') into band
    from public.orders
    where plate = p_plate and ship_date = p_date and (p_order is null or id <> p_order)
      and coalesce(trip_period, '') = b;
    if p_order is not null and coalesce(v_period, '') = b then
      if p_pos is null or p_pos > coalesce(array_length(band, 1), 0) then
        band := band || p_order;
      else
        band := band[1:greatest(p_pos, 1) - 1] || p_order || band[greatest(p_pos, 1):];
      end if;
    end if;
    ids := ids || band;
  end loop;
  update public.orders o set trip_seq = t.n from unnest(ids) with ordinality as t(id, n) where o.id = t.id;
end;
$$;
revoke execute on function public.plan_resequence(text, date, uuid, int) from public, anon, authenticated;

-- Xếp một đơn vào xe + ngày + buổi + vị trí; p_plate rỗng = bỏ xếp lịch (đơn quay về danh sách chưa xếp)
drop function if exists public.plan_assign(uuid, text, text, date, int);
create or replace function public.plan_assign(p_order uuid, p_plate text, p_driver text, p_date date, p_pos int default null, p_period text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  old_plate text;
  old_date date;
  v_tons numeric;
  v_period text := nullif(trim(coalesce(p_period, '')), '');
begin
  select role into v_role from public.staff_roles where user_id = auth.uid();
  if v_role is null or v_role not in ('staff', 'dispatcher') then
    raise exception 'Chỉ Admin hoặc Điều phối xe mới được sửa kế hoạch chạy xe.';
  end if;
  if v_period is not null and v_period not in ('am', 'pm', 'eve') then
    raise exception 'Buổi chạy không hợp lệ (chỉ Sáng, Chiều hoặc Tối).';
  end if;
  select plate, ship_date into old_plate, old_date from public.orders where id = p_order;
  if not found then
    raise exception 'Không tìm thấy đơn hàng.';
  end if;

  if coalesce(trim(p_plate), '') = '' then
    update public.orders set plate = null, trip_seq = null, trip_period = null, driver = nullif(trim(coalesce(p_driver, '')), '') where id = p_order;
  else
    if p_date is null then
      raise exception 'Vui lòng chọn ngày chạy.';
    end if;
    select payload_tons into v_tons from public.vehicles where plate = p_plate;
    if not found then
      raise exception 'Xe % không có trong Danh sách xe.', p_plate;
    end if;
    update public.orders
       set plate = p_plate, ship_date = p_date, driver = nullif(trim(coalesce(p_driver, '')), ''),
           truck = case when v_tons is null then truck else 'Xe ' || v_tons::float8::text || ' tấn' end,
           trip_period = v_period, trip_seq = null
     where id = p_order;
    perform public.plan_resequence(p_plate, p_date, p_order, p_pos);
  end if;

  -- Dồn lại số thứ tự ở ô cũ (xe + ngày cũ) nếu chuyến đã rời đi
  if old_plate is not null and old_date is not null and (old_plate is distinct from nullif(trim(coalesce(p_plate, '')), '') or old_date is distinct from p_date) then
    perform public.plan_resequence(old_plate, old_date, null, null);
  end if;
end;
$$;
revoke execute on function public.plan_assign(uuid, text, text, date, int, text) from public, anon;
grant execute on function public.plan_assign(uuid, text, text, date, int, text) to authenticated;

-- Đổi thứ tự các chuyến trong một ô (xe + ngày): truyền danh sách mã đơn theo thứ tự mới
create or replace function public.plan_reorder(p_orders uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  select role into v_role from public.staff_roles where user_id = auth.uid();
  if v_role is null or v_role not in ('staff', 'dispatcher') then
    raise exception 'Chỉ Admin hoặc Điều phối xe mới được sửa kế hoạch chạy xe.';
  end if;
  update public.orders o set trip_seq = t.n from unnest(p_orders) with ordinality as t(id, n) where o.id = t.id;
end;
$$;
revoke execute on function public.plan_reorder(uuid[]) from public, anon;
grant execute on function public.plan_reorder(uuid[]) to authenticated;
