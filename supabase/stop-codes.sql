-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run.
-- Mã đơn con cho từng điểm trả của đơn nhiều điểm: DH0004-1, DH0004-2, DH0004-3...
-- Số hiệu (stop_no) do database cấp, CỐ ĐỊNH cho từng điểm trả và KHÔNG BAO GIỜ dùng lại,
-- kể cả khi điểm đó bị xoá (mã đã in trên chứng từ không đổi nghĩa).
-- CẦN CHẠY SAU multi-stop.sql. Chạy nhiều lần không sao.

alter table public.order_stops add column if not exists stop_no integer;
alter table public.orders add column if not exists last_stop_no integer not null default 0;

-- Đánh số cho các điểm trả đã có (theo thứ tự trong đơn)
update public.order_stops s
   set stop_no = r.rn
  from (
    select id, row_number() over (partition by order_id order by position, id) as rn
    from public.order_stops
    where stop_no is null
  ) r
 where s.id = r.id and s.stop_no is null
   and not exists (select 1 from public.order_stops x where x.order_id = s.order_id and x.stop_no is not null);

-- Đơn đã có số hiệu lẫn điểm chưa có số: đánh tiếp sau số lớn nhất
do $$
declare
  o record;
  s record;
  n integer;
begin
  for o in select distinct order_id from public.order_stops where stop_no is null loop
    select coalesce(max(stop_no), 0) into n from public.order_stops where order_id = o.order_id;
    for s in select id from public.order_stops where order_id = o.order_id and stop_no is null order by position, id loop
      n := n + 1;
      update public.order_stops set stop_no = n where id = s.id;
    end loop;
  end loop;
end $$;

-- Bộ đếm của đơn = số hiệu lớn nhất đã cấp
update public.orders o
   set last_stop_no = greatest(o.last_stop_no, coalesce((select max(s.stop_no) from public.order_stops s where s.order_id = o.id), 0));

alter table public.order_stops alter column stop_no set not null;
create unique index if not exists order_stops_order_stopno_key on public.order_stops (order_id, stop_no);

-- Cấp số hiệu khi thêm điểm trả: tăng bộ đếm của đơn (khoá dòng đơn nên không trùng khi nhiều người cùng thêm)
create or replace function public.order_stops_assign_no() returns trigger
language plpgsql as $$
begin
  if new.stop_no is null then
    update public.orders set last_stop_no = last_stop_no + 1 where id = new.order_id returning last_stop_no into new.stop_no;
  else
    update public.orders set last_stop_no = greatest(last_stop_no, new.stop_no) where id = new.order_id;
  end if;
  return new;
end;
$$;

drop trigger if exists order_stops_assign on public.order_stops;
create trigger order_stops_assign before insert on public.order_stops
  for each row execute function public.order_stops_assign_no();

-- Số hiệu không đổi sau khi đã cấp
create or replace function public.order_stops_keep_no() returns trigger
language plpgsql as $$
begin
  if new.stop_no is distinct from old.stop_no then
    raise exception 'Không được đổi số hiệu của điểm trả (mã đơn con đã cấp).';
  end if;
  return new;
end;
$$;

drop trigger if exists order_stops_keep on public.order_stops;
create trigger order_stops_keep before update on public.order_stops
  for each row execute function public.order_stops_keep_no();
