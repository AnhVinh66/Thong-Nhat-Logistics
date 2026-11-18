-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run.
-- Tạo / đổi mật khẩu / xoá tài khoản ngay trên website (trang Nhân viên -> Tài khoản), không cần email.
-- CẦN CHẠY TRƯỚC: driver-role.sql. Chạy nhiều lần không sao.

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
  if p_role not in ('staff', 'sales', 'accountant', 'dispatcher', 'driver') then
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
  if p_role not in ('staff', 'sales', 'accountant', 'dispatcher', 'driver', 'none') then
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
