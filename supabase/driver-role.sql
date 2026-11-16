-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run.
-- Vai trò "Lái xe": chỉ xem chuyến của mình và tải ảnh chứng từ. Chạy nhiều lần không sao.
-- CẦN CHẠY TRƯỚC: schema.sql (hoặc các file vehicles, multi-stop, pickup-points, delivery-photos).
--
-- Lần chạy đầu: mọi tài khoản đang có được gán vai trò "staff" (văn phòng, toàn quyền).
-- Tài khoản tạo MỚI sau này chưa có quyền gì cho tới khi được phân quyền ở trang Nhân viên -> Tài khoản.

-- ---------- Bảng vai trò ----------
create table if not exists public.staff_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null check (role in ('staff', 'driver')),
  driver_name text,
  created_at timestamptz not null default now(),
  check (role <> 'driver' or coalesce(trim(driver_name), '') <> '')
);

-- Lần chạy đầu: gán quyền văn phòng cho các tài khoản đang có.
-- Chỉ chạy khi CHƯA có ai là văn phòng, nên chạy lại file này không nâng quyền tài khoản mới (VD lái xe).
insert into public.staff_roles (user_id, email, role)
select id, lower(email), 'staff' from auth.users
where not exists (select 1 from public.staff_roles where role = 'staff')
on conflict (user_id) do nothing;

-- ---------- Hàm kiểm tra quyền (security definer để tránh vòng lặp RLS) ----------
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_roles where user_id = auth.uid() and role = 'staff');
$$;

create or replace function public.my_driver_name() returns text
language sql stable security definer set search_path = public as $$
  select driver_name from public.staff_roles where user_id = auth.uid() and role = 'driver';
$$;

create or replace function public.driver_owns_order(p_order text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders o
    where o.id::text = p_order and o.driver is not null and o.driver = public.my_driver_name()
  );
$$;

create or replace function public.driver_sees_customer(p_customer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orders o where o.customer_id = p_customer and o.driver = public.my_driver_name())
      or exists (
        select 1 from public.order_stops s join public.orders o on o.id = s.order_id
        where s.customer_id = p_customer and o.driver = public.my_driver_name()
      );
$$;

create or replace function public.driver_can_delete_file(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.delivery_photos p
    where p.path = p_path and p.uploaded_by = auth.uid() and public.driver_owns_order(p.order_id::text)
  );
$$;

-- Văn phòng phân quyền bằng email (tài khoản phải được tạo trước trong Authentication -> Users)
create or replace function public.assign_role(p_email text, p_role text, p_driver text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_staff() then
    raise exception 'Bạn không có quyền phân quyền tài khoản.';
  end if;
  if p_role not in ('staff', 'driver', 'none') then
    raise exception 'Vai trò không hợp lệ.';
  end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then
    raise exception 'Không tìm thấy tài khoản có email này. Hãy tạo tài khoản trong Supabase trước.';
  end if;
  if uid = auth.uid() and p_role <> 'staff' then
    raise exception 'Không thể tự đổi hoặc xoá quyền của chính mình.';
  end if;
  if p_role = 'none' then
    delete from public.staff_roles where user_id = uid;
    return;
  end if;
  if p_role = 'driver' and coalesce(trim(p_driver), '') = '' then
    raise exception 'Vui lòng chọn tên lái xe.';
  end if;
  insert into public.staff_roles (user_id, email, role, driver_name)
  values (uid, lower(trim(p_email)), p_role, case when p_role = 'driver' then trim(p_driver) end)
  on conflict (user_id) do update
    set email = excluded.email, role = excluded.role, driver_name = excluded.driver_name;
end;
$$;

revoke execute on function public.assign_role(text, text, text) from public, anon;
grant execute on function public.assign_role(text, text, text) to authenticated;

-- ---------- RLS bảng vai trò ----------
alter table public.staff_roles enable row level security;
drop policy if exists "read roles" on public.staff_roles;
create policy "read roles" on public.staff_roles
  for select to authenticated using (user_id = auth.uid() or public.is_staff());
-- Không cho ghi trực tiếp; chỉ ghi qua hàm assign_role

-- ---------- Văn phòng: toàn quyền trên mọi bảng (thay cho quyền cũ "mọi tài khoản đăng nhập") ----------
do $$
declare t text;
begin
  foreach t in array array['customers', 'orders', 'order_stops', 'vehicles', 'pickup_points', 'delivery_photos', 'collections', 'collection_items', 'collection_photos', 'bank_accounts', 'bank_transactions', 'expenses', 'expense_photos'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "staff full access" on public.%I', t);
      execute format('drop policy if exists "staff all" on public.%I', t);
      execute format(
        'create policy "staff all" on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t
      );
    end if;
  end loop;
end $$;

-- ---------- Lái xe: chỉ đọc chuyến của mình ----------
drop policy if exists "driver read own orders" on public.orders;
create policy "driver read own orders" on public.orders
  for select to authenticated using (driver is not null and driver = public.my_driver_name());

drop policy if exists "driver read own stops" on public.order_stops;
create policy "driver read own stops" on public.order_stops
  for select to authenticated using (public.driver_owns_order(order_id::text));

drop policy if exists "driver read own customers" on public.customers;
create policy "driver read own customers" on public.customers
  for select to authenticated using (public.driver_sees_customer(id));

-- Lái xe: xem / tải ảnh chứng từ của chuyến mình, chỉ xoá ảnh do mình tải
drop policy if exists "driver read photos" on public.delivery_photos;
create policy "driver read photos" on public.delivery_photos
  for select to authenticated using (public.driver_owns_order(order_id::text));

drop policy if exists "driver add photos" on public.delivery_photos;
create policy "driver add photos" on public.delivery_photos
  for insert to authenticated with check (
    public.driver_owns_order(order_id::text)
    and uploaded_by = auth.uid()
    and (stop_id is null or exists (select 1 from public.order_stops s where s.id = stop_id and s.order_id = delivery_photos.order_id))
  );

drop policy if exists "driver delete own photos" on public.delivery_photos;
create policy "driver delete own photos" on public.delivery_photos
  for delete to authenticated using (uploaded_by = auth.uid() and public.driver_owns_order(order_id::text));

-- ---------- Kho ảnh delivery-docs (đường dẫn file bắt đầu bằng mã đơn hàng) ----------
drop policy if exists "staff read delivery docs" on storage.objects;
drop policy if exists "staff upload delivery docs" on storage.objects;
drop policy if exists "staff delete delivery docs" on storage.objects;
drop policy if exists "delivery docs read" on storage.objects;
drop policy if exists "delivery docs upload" on storage.objects;
drop policy if exists "delivery docs delete" on storage.objects;

create policy "delivery docs read" on storage.objects
  for select to authenticated using (
    bucket_id = 'delivery-docs' and (public.is_staff() or public.driver_owns_order(split_part(name, '/', 1)))
  );

create policy "delivery docs upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'delivery-docs' and (public.is_staff() or public.driver_owns_order(split_part(name, '/', 1)))
  );

create policy "delivery docs delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'delivery-docs' and (public.is_staff() or public.driver_can_delete_file(name))
  );
