-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run.
-- Phân quyền theo 4 vai trò. Chạy nhiều lần không sao.
-- CẦN CHẠY SAU driver-role.sql và simple-users.sql; luôn chạy file này CUỐI CÙNG
-- (driver-role.sql chạy lại sẽ đặt lại quyền, khi đó chạy lại roles.sql).
--
--   staff       = Quản trị: toàn quyền, tạo tài khoản, phân quyền
--   dispatcher  = Điều phối / Kinh doanh: Khách hàng, Đơn hàng, Danh sách xe (thêm/sửa/xoá); xem công nợ
--   accountant  = Kế toán: Thu tiền, Chi tiền, Ngân hàng (thêm/sửa/xoá); chỉ xem Khách hàng, Đơn hàng, Xe
--   driver      = Lái xe: chỉ thấy chuyến của mình (không đổi)

-- ---------- Cho phép giá trị vai trò mới ----------
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.staff_roles'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%ARRAY%'
  loop
    execute format('alter table public.staff_roles drop constraint %I', c);
  end loop;
  alter table public.staff_roles add constraint staff_roles_role_check
    check (role in ('staff', 'dispatcher', 'accountant', 'driver'));
end $$;

-- ---------- Hàm kiểm tra quyền (is_staff() giữ nguyên nghĩa: Quản trị) ----------
create or replace function public.can_ops() returns boolean   -- sửa Khách hàng / Đơn hàng / Xe
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_roles where user_id = auth.uid() and role in ('staff', 'dispatcher'));
$$;
create or replace function public.can_fin() returns boolean   -- sửa Thu / Chi / Ngân hàng
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_roles where user_id = auth.uid() and role in ('staff', 'accountant'));
$$;
create or replace function public.is_office() returns boolean -- mọi vai trò văn phòng (không gồm lái xe)
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_roles where user_id = auth.uid() and role in ('staff', 'dispatcher', 'accountant'));
$$;

-- Điều phối cần danh sách lái xe để chọn khi tạo đơn
drop policy if exists "read roles" on public.staff_roles;
create policy "read roles" on public.staff_roles
  for select to authenticated using (user_id = auth.uid() or public.is_office());

-- ---------- Bảng nghiệp vụ vận chuyển: Quản trị + Điều phối sửa; Kế toán chỉ xem ----------
do $$
declare t text;
begin
  foreach t in array array['customers', 'orders', 'order_stops', 'vehicles', 'pickup_points', 'delivery_photos'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "staff all" on public.%I', t);
      execute format('drop policy if exists "office read" on public.%I', t);
      execute format('create policy "staff all" on public.%I for all to authenticated using (public.can_ops()) with check (public.can_ops())', t);
      execute format('create policy "office read" on public.%I for select to authenticated using (public.is_office())', t);
    end if;
  end loop;

  -- ---------- Bảng tài chính: Quản trị + Kế toán sửa; Điều phối chỉ xem phiếu Thu (để biết công nợ) ----------
  foreach t in array array['collections', 'collection_items', 'collection_photos', 'bank_accounts', 'bank_transactions', 'expenses', 'expense_photos'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "staff all" on public.%I', t);
      execute format('drop policy if exists "dispatcher read" on public.%I', t);
      execute format('create policy "staff all" on public.%I for all to authenticated using (public.can_fin()) with check (public.can_fin())', t);
    end if;
  end loop;
  foreach t in array array['collections', 'collection_items'] loop
    if to_regclass('public.' || t) is not null then
      execute format('create policy "dispatcher read" on public.%I for select to authenticated using (public.can_ops())', t);
    end if;
  end loop;
end $$;

-- ---------- Kho ảnh ----------
drop policy if exists "delivery docs read" on storage.objects;
drop policy if exists "delivery docs upload" on storage.objects;
drop policy if exists "delivery docs delete" on storage.objects;
create policy "delivery docs read" on storage.objects
  for select to authenticated using (
    bucket_id = 'delivery-docs' and (public.is_office() or public.driver_owns_order(split_part(name, '/', 1)))
  );
create policy "delivery docs upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'delivery-docs' and (public.can_ops() or public.driver_owns_order(split_part(name, '/', 1)))
  );
create policy "delivery docs delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'delivery-docs' and (public.can_ops() or public.driver_can_delete_file(name))
  );

drop policy if exists "collection bills select" on storage.objects;
drop policy if exists "collection bills insert" on storage.objects;
drop policy if exists "collection bills delete" on storage.objects;
create policy "collection bills select" on storage.objects for select to authenticated using (bucket_id = 'collection-bills' and public.can_fin());
create policy "collection bills insert" on storage.objects for insert to authenticated with check (bucket_id = 'collection-bills' and public.can_fin());
create policy "collection bills delete" on storage.objects for delete to authenticated using (bucket_id = 'collection-bills' and public.can_fin());

drop policy if exists "expense docs select" on storage.objects;
drop policy if exists "expense docs insert" on storage.objects;
drop policy if exists "expense docs delete" on storage.objects;
create policy "expense docs select" on storage.objects for select to authenticated using (bucket_id = 'expense-docs' and public.can_fin());
create policy "expense docs insert" on storage.objects for insert to authenticated with check (bucket_id = 'expense-docs' and public.can_fin());
create policy "expense docs delete" on storage.objects for delete to authenticated using (bucket_id = 'expense-docs' and public.can_fin());
