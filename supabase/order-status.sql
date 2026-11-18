-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run.
-- Trạng thái đơn hàng TỰ ĐỘNG theo chứng từ: Chưa hoàn thành / Hoàn thành. Chạy nhiều lần không sao.
-- CẦN CHẠY SAU delivery-photos.sql và multi-stop.sql (schema.sql bản mới đã có đủ).
--
-- Quy tắc (không ai sửa tay được, cơ sở dữ liệu tự tính):
--   - Đơn 1 điểm: có chứng từ (biên bản giao nhận hoặc bill) -> Hoàn thành; xoá hết chứng từ -> Chưa hoàn thành.
--   - Đơn nhiều điểm: MỖI điểm trả (đơn con) có chứng từ thì điểm đó Hoàn thành.
--     Đơn cha Hoàn thành khi tất cả các điểm trả đều Hoàn thành.

alter table public.orders add column if not exists status text not null default 'incomplete';
alter table public.orders add column if not exists completed_at timestamptz;
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in ('incomplete', 'done'));
create index if not exists orders_status_idx on public.orders (status);

alter table public.order_stops add column if not exists status text not null default 'incomplete';
alter table public.order_stops add column if not exists completed_at timestamptz;
alter table public.order_stops drop constraint if exists order_stops_status_check;
alter table public.order_stops add constraint order_stops_status_check check (status in ('incomplete', 'done'));

-- Bản cũ (đổi trạng thái thủ công) không còn dùng
drop function if exists public.set_order_status(uuid, boolean);
drop trigger if exists orders_status_check on public.orders;
drop function if exists public.orders_check_status();

-- Điểm trả có chứng từ chưa?
create or replace function public.stop_is_done(p_stop uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.delivery_photos p where p.stop_id = p_stop);
$$;

-- Đơn đã hoàn thành chưa? (1 điểm: có chứng từ; nhiều điểm: mọi điểm trả đều có chứng từ)
create or replace function public.order_is_done(p_order uuid, p_type text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when coalesce(p_type, 'single') = 'multi' then
      exists (select 1 from public.order_stops s where s.order_id = p_order)
      and not exists (select 1 from public.order_stops s where s.order_id = p_order and not public.stop_is_done(s.id))
    else exists (select 1 from public.delivery_photos p where p.order_id = p_order)
  end;
$$;

-- Trước khi ghi đơn / điểm trả: luôn đặt lại trạng thái theo chứng từ
create or replace function public.orders_force_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare was_done boolean := false;
begin
  if tg_op = 'UPDATE' then was_done := (old.status = 'done'); end if;
  if public.order_is_done(new.id, new.order_type) then
    new.status := 'done';
    if not was_done or new.completed_at is null then new.completed_at := now(); else new.completed_at := old.completed_at; end if;
  else
    new.status := 'incomplete';
    new.completed_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists orders_force_status on public.orders;
create trigger orders_force_status before insert or update on public.orders
  for each row execute function public.orders_force_status();

create or replace function public.order_stops_force_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare was_done boolean := false;
begin
  if tg_op = 'UPDATE' then was_done := (old.status = 'done'); end if;
  if public.stop_is_done(new.id) then
    new.status := 'done';
    if not was_done or new.completed_at is null then new.completed_at := now(); else new.completed_at := old.completed_at; end if;
  else
    new.status := 'incomplete';
    new.completed_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists order_stops_force_status on public.order_stops;
create trigger order_stops_force_status before insert or update on public.order_stops
  for each row execute function public.order_stops_force_status();

-- Thêm / xoá chứng từ -> tính lại điểm trả và đơn
create or replace function public.delivery_photos_refresh_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_order uuid; v_stop uuid;
begin
  if tg_op = 'DELETE' then v_order := old.order_id; v_stop := old.stop_id;
  else v_order := new.order_id; v_stop := new.stop_id; end if;
  if v_stop is not null then
    update public.order_stops set status = status where id = v_stop;
  end if;
  update public.orders set status = status where id = v_order;
  return null;
end;
$$;
drop trigger if exists delivery_photos_status on public.delivery_photos;
create trigger delivery_photos_status after insert or delete on public.delivery_photos
  for each row execute function public.delivery_photos_refresh_status();

-- Thêm / bớt điểm trả -> tính lại đơn cha
create or replace function public.order_stops_refresh_order() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    update public.orders set status = status where id = old.order_id;
  else
    update public.orders set status = status where id = new.order_id;
  end if;
  return null;
end;
$$;
drop trigger if exists order_stops_refresh on public.order_stops;
create trigger order_stops_refresh after insert or delete on public.order_stops
  for each row execute function public.order_stops_refresh_order();

-- Tính lại cho dữ liệu đã có (đơn cũ đã có chứng từ sẽ tự thành Hoàn thành)
update public.order_stops set status = status;
update public.orders set status = status;
