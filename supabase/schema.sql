-- !!! Nếu đã chạy driver-role.sql: sau khi chạy file này PHẢI chạy lại driver-role.sql,
-- !!! nếu không lái xe sẽ xem được toàn bộ dữ liệu.
-- Chạy toàn bộ file này trong Supabase: SQL Editor -> New query -> Run.
-- QUAN TRỌNG: sau đó vào Authentication -> Sign In / Providers và TẮT "Allow new users to sign up",
-- nếu không bất kỳ ai cũng có thể tự đăng ký và xem dữ liệu. Tài khoản nhân viên do bạn tạo thủ công
-- tại Authentication -> Users -> Add user.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  phone text not null,
  email text,
  address text,
  company text,
  tax_code text,
  type text not null default 'le' check (type in ('le', 'doanh_nghiep', 'dai_ly')),
  note text
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no bigint generated always as identity,
  created_at timestamptz not null default now(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  pickup text not null,
  delivery text not null,
  cargo text,
  weight text,
  truck text,
  plate text,
  driver text,
  ship_date date,
  fee bigint not null default 0 check (fee >= 0),
  paid bigint not null default 0 check (paid >= 0),
  debt bigint generated always as (fee - paid) stored
);

create index if not exists orders_customer_idx on public.orders (customer_id);
create index if not exists orders_ship_date_idx on public.orders (ship_date desc);

alter table public.customers enable row level security;
alter table public.orders enable row level security;

-- Chỉ người đã đăng nhập (nhân viên) mới đọc/ghi được. Người chưa đăng nhập (anon) không có quyền nào.
drop policy if exists "staff full access" on public.customers;
create policy "staff full access" on public.customers
  for all to authenticated using (true) with check (true);

drop policy if exists "staff full access" on public.orders;
create policy "staff full access" on public.orders
  for all to authenticated using (true) with check (true);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  plate text not null unique,
  volume_cbm numeric(8, 2) check (volume_cbm >= 0),
  payload_tons numeric(8, 2) check (payload_tons >= 0),
  length_m numeric(6, 2) check (length_m >= 0),
  width_m numeric(6, 2) check (width_m >= 0),
  height_m numeric(6, 2) check (height_m >= 0)
);

alter table public.vehicles enable row level security;

drop policy if exists "staff full access" on public.vehicles;
create policy "staff full access" on public.vehicles
  for all to authenticated using (true) with check (true);

-- Dữ liệu ban đầu
insert into public.vehicles (plate, volume_cbm, payload_tons, length_m, width_m, height_m) values
  ('29E-373.03', 14, 3.5, 4.31, 1.94, 1.85),
  ('29E-196.04', 14, 3.5, 4.31, 1.94, 1.85),
  ('29E-373.23', 25, 7.7, 6.30, 2.12, 2.05)
on conflict (plate) do nothing;

-- ===== Đơn hàng trả hàng nhiều điểm =====

-- Đơn nhiều điểm không có một khách hàng / một điểm đến duy nhất
alter table public.orders alter column customer_id drop not null;
alter table public.orders alter column delivery drop not null;
alter table public.orders add column if not exists order_type text not null default 'single';

alter table public.orders drop constraint if exists orders_type_check;
alter table public.orders add constraint orders_type_check check (
  order_type in ('single', 'multi')
  and (order_type <> 'single' or (customer_id is not null and delivery is not null))
);

-- Các điểm trả hàng của đơn nhiều điểm (mỗi điểm có khách hàng, địa chỉ, hàng và cước riêng)
create table if not exists public.order_stops (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  position int not null default 0,
  customer_id uuid not null references public.customers (id) on delete restrict,
  address text not null,
  cargo text,
  weight text,
  fee bigint not null default 0 check (fee >= 0)
);

create index if not exists order_stops_order_idx on public.order_stops (order_id);
create index if not exists order_stops_customer_idx on public.order_stops (customer_id);

alter table public.order_stops enable row level security;

drop policy if exists "staff full access" on public.order_stops;
create policy "staff full access" on public.order_stops
  for all to authenticated using (true) with check (true);

-- ===== Điểm lấy hàng đã lưu =====

create table if not exists public.pickup_points (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  address text not null unique
);

alter table public.pickup_points enable row level security;

drop policy if exists "staff full access" on public.pickup_points;
create policy "staff full access" on public.pickup_points
  for all to authenticated using (true) with check (true);

-- ===== Ảnh chứng từ giao hàng =====

-- Kho ảnh riêng tư (không công khai), tối đa 10 MB/ảnh, chỉ nhận file ảnh
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-docs', 'delivery-docs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Chỉ nhân viên đã đăng nhập mới xem / tải lên / xoá ảnh trong kho này
drop policy if exists "staff read delivery docs" on storage.objects;
create policy "staff read delivery docs" on storage.objects
  for select to authenticated using (bucket_id = 'delivery-docs');

drop policy if exists "staff upload delivery docs" on storage.objects;
create policy "staff upload delivery docs" on storage.objects
  for insert to authenticated with check (bucket_id = 'delivery-docs');

drop policy if exists "staff delete delivery docs" on storage.objects;
create policy "staff delete delivery docs" on storage.objects
  for delete to authenticated using (bucket_id = 'delivery-docs');

-- Danh sách ảnh: thuộc đơn nào, điểm trả nào (để trống = đơn 1 điểm), loại ảnh gì
create table if not exists public.delivery_photos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.orders (id) on delete cascade,
  stop_id uuid references public.order_stops (id) on delete cascade,
  kind text not null check (kind in ('bien_ban', 'bill')),
  path text not null unique,
  uploaded_by uuid default auth.uid()
);

create index if not exists delivery_photos_order_idx on public.delivery_photos (order_id);
create index if not exists delivery_photos_stop_idx on public.delivery_photos (stop_id);

alter table public.delivery_photos enable row level security;

drop policy if exists "staff full access" on public.delivery_photos;
create policy "staff full access" on public.delivery_photos
  for all to authenticated using (true) with check (true);

-- ===== Vai trò lái xe (giữ ở CUỐI file) =====
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
  foreach t in array array['customers', 'orders', 'order_stops', 'vehicles', 'pickup_points', 'delivery_photos'] loop
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

-- ===== Tạo tài khoản trên website (giữ SAU phần vai trò lái xe) =====

create extension if not exists pgcrypto with schema extensions;

alter table public.staff_roles add column if not exists username text;
alter table public.staff_roles add column if not exists full_name text;

-- Tên miền nội bộ cho tài khoản không có email (người dùng chỉ cần gõ tên đăng nhập)
create or replace function public.login_domain() returns text
language sql immutable as $$ select 'thongnhat.local' $$;

-- ---------- Danh sách mọi tài khoản (kể cả chưa phân quyền) ----------
create or replace function public.list_staff_users()
returns table (user_id uuid, email text, username text, full_name text, role text, driver_name text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_staff() then
    raise exception 'Bạn không có quyền xem danh sách tài khoản.';
  end if;
  return query
    select u.id, u.email::text, r.username,
           coalesce(r.full_name, u.raw_user_meta_data ->> 'full_name'),
           r.role, r.driver_name, u.created_at, u.last_sign_in_at
    from auth.users u
    left join public.staff_roles r on r.user_id = u.id
    order by r.role nulls first, coalesce(r.full_name, u.email);
end;
$$;

-- ---------- Tạo tài khoản ----------
create or replace function public.create_staff_user(p_username text, p_password text, p_role text, p_name text)
returns uuid
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  uid uuid := gen_random_uuid();
  v_user text := lower(trim(coalesce(p_username, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_email text;
begin
  if not public.is_staff() then
    raise exception 'Bạn không có quyền tạo tài khoản.';
  end if;
  if v_name = '' then
    raise exception 'Vui lòng nhập họ tên.';
  end if;
  if v_user !~ '^[a-z0-9._-]{2,30}$' then
    raise exception 'Tên đăng nhập chỉ gồm chữ không dấu, số, dấu chấm hoặc gạch (2–30 ký tự), ví dụ: trang';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'Mật khẩu cần ít nhất 6 ký tự.';
  end if;
  if p_role not in ('staff', 'driver') then
    raise exception 'Vai trò không hợp lệ.';
  end if;
  if p_role = 'driver' and exists (select 1 from public.staff_roles where role = 'driver' and lower(driver_name) = lower(v_name)) then
    raise exception 'Đã có lái xe tên "%". Hãy thêm chữ phân biệt, ví dụ "% (2)".', v_name, v_name;
  end if;

  v_email := v_user || '@' || public.login_domain();
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'Tên đăng nhập "%" đã có người dùng.', v_user;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
    email_change, reauthentication_token, phone_change, phone_change_token
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', v_name), now(), now(),
    '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text,
          jsonb_build_object('sub', uid::text, 'email', v_email, 'email_verified', true),
          'email', now(), now(), now());

  insert into public.staff_roles (user_id, email, username, full_name, role, driver_name)
  values (uid, v_email, v_user, v_name, p_role, case when p_role = 'driver' then v_name end);

  return uid;
end;
$$;

-- ---------- Đổi mật khẩu ----------
create or replace function public.set_staff_password(p_user_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if not public.is_staff() then
    raise exception 'Bạn không có quyền đổi mật khẩu.';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'Mật khẩu cần ít nhất 6 ký tự.';
  end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user_id;
  if not found then
    raise exception 'Không tìm thấy tài khoản.';
  end if;
end;
$$;

-- ---------- Đổi họ tên / vai trò (role 'none' = thu hồi quyền) ----------
create or replace function public.update_staff_user(p_user_id uuid, p_role text, p_name text)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  old_driver text;
  v_email text;
begin
  if not public.is_staff() then
    raise exception 'Bạn không có quyền sửa tài khoản.';
  end if;
  if p_user_id = auth.uid() and p_role <> 'staff' then
    raise exception 'Không thể tự đổi hoặc thu hồi quyền của chính mình.';
  end if;
  if p_role not in ('staff', 'driver', 'none') then
    raise exception 'Vai trò không hợp lệ.';
  end if;
  select email into v_email from auth.users where id = p_user_id;
  if v_email is null then
    raise exception 'Không tìm thấy tài khoản.';
  end if;
  if p_role = 'none' then
    delete from public.staff_roles where user_id = p_user_id;
    return;
  end if;
  if v_name = '' then
    raise exception 'Vui lòng nhập họ tên.';
  end if;
  if p_role = 'driver' and exists (
    select 1 from public.staff_roles where role = 'driver' and lower(driver_name) = lower(v_name) and user_id <> p_user_id
  ) then
    raise exception 'Đã có lái xe khác tên "%".', v_name;
  end if;

  select driver_name into old_driver from public.staff_roles where user_id = p_user_id and role = 'driver';

  insert into public.staff_roles (user_id, email, full_name, role, driver_name)
  values (p_user_id, lower(v_email), v_name, p_role, case when p_role = 'driver' then v_name end)
  on conflict (user_id) do update
    set full_name = excluded.full_name, role = excluded.role, driver_name = excluded.driver_name;

  -- Lái xe đổi tên: cập nhật luôn các đơn đã giao cho người này để họ vẫn thấy chuyến của mình
  if old_driver is not null and p_role = 'driver' and old_driver <> v_name then
    update public.orders set driver = v_name where driver = old_driver;
  end if;
end;
$$;

-- ---------- Xoá tài khoản ----------
create or replace function public.delete_staff_user(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_staff() then
    raise exception 'Bạn không có quyền xoá tài khoản.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Không thể tự xoá tài khoản của chính mình.';
  end if;
  delete from auth.users where id = p_user_id; -- staff_roles tự xoá theo
end;
$$;

-- Chỉ người đã đăng nhập mới gọi được (bên trong hàm còn kiểm tra quyền văn phòng)
revoke execute on function public.list_staff_users() from public, anon;
revoke execute on function public.create_staff_user(text, text, text, text) from public, anon;
revoke execute on function public.set_staff_password(uuid, text) from public, anon;
revoke execute on function public.update_staff_user(uuid, text, text) from public, anon;
revoke execute on function public.delete_staff_user(uuid) from public, anon;
grant execute on function public.list_staff_users() to authenticated;
grant execute on function public.create_staff_user(text, text, text, text) to authenticated;
grant execute on function public.set_staff_password(uuid, text) to authenticated;
grant execute on function public.update_staff_user(uuid, text, text) to authenticated;
grant execute on function public.delete_staff_user(uuid) to authenticated;
