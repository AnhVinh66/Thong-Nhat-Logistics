-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run.
-- Trạng thái đơn hàng: Chưa hoàn thành / Hoàn thành. Chạy nhiều lần không sao.
-- CẦN CHẠY SAU delivery-photos.sql và multi-stop.sql (schema.sql bản mới đã có đủ).
--
-- Quy tắc: chỉ chuyển sang "Hoàn thành" khi đã có biên bản giao nhận HOẶC bill thanh toán:
--   - đơn 1 điểm: đơn có ít nhất 1 ảnh chứng từ;
--   - đơn nhiều điểm: MỖI điểm trả có ít nhất 1 ảnh chứng từ.
-- Quy tắc nằm ở cơ sở dữ liệu nên không cách nào qua mặt được. Chuyển ngược về "Chưa hoàn thành" thì không cần điều kiện.

alter table public.orders add column if not exists status text not null default 'incomplete';
alter table public.orders add column if not exists completed_at timestamptz;
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in ('incomplete', 'done'));
create index if not exists orders_status_idx on public.orders (status);

create or replace function public.orders_check_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare ok boolean; was_done boolean := false;
begin
  if tg_op = 'UPDATE' then was_done := (old.status = 'done'); end if;
  if new.status = 'done' and not was_done then
    if coalesce(new.order_type, 'single') = 'multi' then
      ok := exists (select 1 from public.order_stops s where s.order_id = new.id)
        and not exists (
          select 1 from public.order_stops s
          where s.order_id = new.id and not exists (select 1 from public.delivery_photos p where p.stop_id = s.id)
        );
    else
      ok := exists (select 1 from public.delivery_photos p where p.order_id = new.id);
    end if;
    if tg_op = 'INSERT' or not coalesce(ok, false) then
      raise exception 'Chỉ được chuyển sang Hoàn thành khi đã có biên bản giao nhận hoặc bill thanh toán (với đơn nhiều điểm: mỗi điểm trả đều phải có).';
    end if;
    new.completed_at := now();
  elsif new.status = 'incomplete' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_status_check on public.orders;
create trigger orders_status_check before insert or update of status on public.orders
  for each row execute function public.orders_check_status();

-- Đổi trạng thái: Admin và Điều phối xe (Điều phối không sửa được đơn nên đi qua hàm này, chỉ đổi đúng cột trạng thái)
create or replace function public.set_order_status(p_order uuid, p_done boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  select role into v_role from public.staff_roles where user_id = auth.uid();
  if v_role is null or v_role not in ('staff', 'dispatcher') then
    raise exception 'Chỉ Admin hoặc Điều phối xe mới được đổi trạng thái đơn hàng.';
  end if;
  update public.orders set status = case when p_done then 'done' else 'incomplete' end where id = p_order;
  if not found then
    raise exception 'Không tìm thấy đơn hàng.';
  end if;
end;
$$;
revoke execute on function public.set_order_status(uuid, boolean) from public, anon;
grant execute on function public.set_order_status(uuid, boolean) to authenticated;
