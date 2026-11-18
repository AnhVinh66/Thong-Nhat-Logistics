-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run.
-- Phân quyền theo 5 vai trò (bảng phân quyền của công ty). Chạy nhiều lần không sao.
-- CẦN CHẠY SAU driver-role.sql và simple-users.sql; luôn chạy file này CUỐI CÙNG
-- (chạy lại bất kỳ file SQL nào khác thì chạy lại roles.sql sau đó).
--
--   staff       = Admin: toàn quyền, tạo tài khoản, phân quyền
--   sales       = Nhân viên kinh doanh: chỉ thấy khách hàng mình phụ trách và đơn / phiếu Thu của các khách đó;
--                 chỉ THÊM đơn hàng (không sửa, không xoá), không xoá khách hàng, không sửa / xoá phiếu Thu; không xem Ngân hàng, Danh sách xe
--   accountant  = Kế toán: xem tất cả; chỉ THÊM khách hàng và đơn hàng (không sửa / xoá); xem Thu (không thao tác);
--                 Chi tiền, Ngân hàng, Danh sách xe: toàn quyền
--   dispatcher  = Điều phối xe: xem tất cả; chỉ THÊM khách hàng và đơn hàng; xem Thu (không thao tác);
--                 Chi tiền: chỉ lệnh Chi của mình; Danh sách xe: toàn quyền; không xem Ngân hàng
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
    check (role in ('staff', 'sales', 'accountant', 'dispatcher', 'driver'));
end $$;

-- ---------- Khách hàng thuộc nhân viên kinh doanh nào; người tạo đơn ----------
alter table public.customers add column if not exists sales_user_id uuid references auth.users (id) on delete set null;
create index if not exists customers_sales_idx on public.customers (sales_user_id);
alter table public.orders add column if not exists created_by uuid default auth.uid();

-- ---------- Hàm kiểm tra quyền ----------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.staff_roles where user_id = auth.uid();
$$;
create or replace function public.is_office() returns boolean   -- Admin, Kinh doanh, Kế toán, Điều phối
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('staff', 'sales', 'accountant', 'dispatcher'), false);
$$;
create or replace function public.sees_all() returns boolean    -- xem toàn bộ khách / đơn / phiếu Thu
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('staff', 'accountant', 'dispatcher'), false);
$$;
create or replace function public.is_sales() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'sales', false);
$$;
create or replace function public.is_fin() returns boolean     -- Admin + Kế toán
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('staff', 'accountant'), false);
$$;

create or replace function public.sales_owns_customer(p_customer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_customer is not null and exists (select 1 from public.customers where id = p_customer and sales_user_id = auth.uid());
$$;
create or replace function public.sales_sees_order(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orders o where o.id = p_order and (o.created_by = auth.uid() or public.sales_owns_customer(o.customer_id)))
      or exists (select 1 from public.order_stops s where s.order_id = p_order and public.sales_owns_customer(s.customer_id));
$$;
create or replace function public.can_see_order(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.sees_all() or (public.is_sales() and public.sales_sees_order(p_order));
$$;
create or replace function public.can_see_order_text(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then public.can_see_order(p::uuid) else false end;
$$;
create or replace function public.sales_owns_collection(p_collection uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.collections c where c.id = p_collection and public.sales_owns_customer(c.customer_id));
$$;
create or replace function public.can_see_expense(p_expense uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_fin() or exists (select 1 from public.expenses e where e.id = p_expense and e.created_by = auth.uid());
$$;

-- Nhân viên phụ trách (sales_user_id) mặc định là NGƯỜI TẠO khách hàng (mọi vai trò); chỉ Admin được đổi / giao lại
create or replace function public.customers_set_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_staff() or new.sales_user_id is null then new.sales_user_id := auth.uid(); end if;
  elsif not public.is_staff() then
    new.sales_user_id := old.sales_user_id;
  end if;
  return new;
end;
$$;
drop trigger if exists customers_owner on public.customers;
create trigger customers_owner before insert or update on public.customers
  for each row execute function public.customers_set_owner();

-- Các hàm trigger (đối soát sao kê, cấp mã điểm trả...) phải chạy được khi người thao tác không có quyền sửa bảng liên quan
do $$
declare s text;
begin
  foreach s in array array[
    'public.collections_match_before()', 'public.try_match_txn(uuid)', 'public.bank_txn_after_insert()',
    'public.collections_after_change()', 'public.expenses_b_match()', 'public.try_match_txn_out(uuid)',
    'public.expenses_after_change()', 'public.expenses_a_guard()', 'public.order_stops_assign_no()',
    'public.order_stops_keep_no()', 'public.check_collection_item()'
  ] loop
    if to_regprocedure(s) is not null then
      execute format('alter function %s security definer set search_path = public', s);
    end if;
  end loop;
end $$;

-- ---------- Xoá chính sách cũ (giữ nguyên chính sách của lái xe) ----------
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('customers', 'orders', 'order_stops', 'vehicles', 'pickup_points', 'delivery_photos', 'collections',
                        'collection_items', 'collection_photos', 'bank_accounts', 'bank_transactions', 'expenses', 'expense_photos')
      and (policyname in ('staff all', 'staff full access', 'office read', 'dispatcher read') or policyname like 'rbac %')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

drop policy if exists "read roles" on public.staff_roles;
create policy "read roles" on public.staff_roles
  for select to authenticated using (user_id = auth.uid() or public.is_office());

-- ---------- Khách hàng ----------
create policy "rbac select" on public.customers for select to authenticated
  using (public.sees_all() or (public.is_sales() and sales_user_id = auth.uid()));
create policy "rbac insert" on public.customers for insert to authenticated with check (public.is_office());
create policy "rbac update" on public.customers for update to authenticated
  using (public.is_staff() or (public.is_sales() and sales_user_id = auth.uid()))
  with check (public.is_staff() or (public.is_sales() and sales_user_id = auth.uid()));
create policy "rbac delete" on public.customers for delete to authenticated using (public.is_staff());

-- ---------- Đơn hàng ----------
create policy "rbac select" on public.orders for select to authenticated
  using (public.sees_all() or (public.is_sales() and (created_by = auth.uid() or public.sales_sees_order(id))));
create policy "rbac insert" on public.orders for insert to authenticated
  with check (
    public.is_staff() or public.my_role() in ('accountant', 'dispatcher')
    or (public.is_sales() and (customer_id is null or public.sales_owns_customer(customer_id)))
  );
create policy "rbac update" on public.orders for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "rbac delete" on public.orders for delete to authenticated using (public.is_staff());

create policy "rbac select" on public.order_stops for select to authenticated
  using (public.sees_all() or (public.is_sales() and (public.sales_owns_customer(customer_id) or public.sales_sees_order(order_id))));
create policy "rbac insert" on public.order_stops for insert to authenticated
  with check (public.is_staff() or public.my_role() in ('accountant', 'dispatcher') or (public.is_sales() and public.sales_owns_customer(customer_id)));
create policy "rbac update" on public.order_stops for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "rbac delete" on public.order_stops for delete to authenticated using (public.is_staff());

-- Ảnh chứng từ giao hàng: ai thấy đơn thì xem / tải / xoá được ảnh của đơn đó
create policy "rbac all" on public.delivery_photos for all to authenticated
  using (public.can_see_order(order_id)) with check (public.can_see_order(order_id));

-- Điểm lấy hàng đã lưu: mọi vai trò văn phòng
create policy "rbac all" on public.pickup_points for all to authenticated
  using (public.is_office()) with check (public.is_office());

-- ---------- Danh sách xe / Ngân hàng ----------
-- Mọi vai trò văn phòng đọc được danh sách xe và tài khoản ngân hàng để CHỌN trong form đơn / Thu / Chi (không có menu riêng)
create policy "rbac select" on public.vehicles for select to authenticated using (public.is_office());
create policy "rbac write" on public.vehicles for all to authenticated
  using (public.my_role() in ('staff', 'accountant', 'dispatcher')) with check (public.my_role() in ('staff', 'accountant', 'dispatcher'));

create policy "rbac select" on public.bank_accounts for select to authenticated using (public.is_office());
create policy "rbac write" on public.bank_accounts for all to authenticated using (public.is_fin()) with check (public.is_fin());
create policy "rbac all" on public.bank_transactions for all to authenticated using (public.is_fin()) with check (public.is_fin());

-- ---------- Thu tiền ----------
create policy "rbac select" on public.collections for select to authenticated
  using (public.sees_all() or (public.is_sales() and public.sales_owns_customer(customer_id)));
create policy "rbac insert" on public.collections for insert to authenticated
  with check (public.is_staff() or (public.is_sales() and public.sales_owns_customer(customer_id)));
create policy "rbac update" on public.collections for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "rbac delete" on public.collections for delete to authenticated using (public.is_staff());

create policy "rbac select" on public.collection_items for select to authenticated
  using (public.sees_all() or (public.is_sales() and public.sales_owns_collection(collection_id)));
create policy "rbac insert" on public.collection_items for insert to authenticated
  with check (public.is_staff() or (public.is_sales() and public.sales_owns_collection(collection_id)));
create policy "rbac update" on public.collection_items for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "rbac delete" on public.collection_items for delete to authenticated using (public.is_staff());

create policy "rbac select" on public.collection_photos for select to authenticated
  using (public.sees_all() or (public.is_sales() and public.sales_owns_collection(collection_id)));
create policy "rbac insert" on public.collection_photos for insert to authenticated
  with check (public.is_staff() or (public.is_sales() and public.sales_owns_collection(collection_id)));
create policy "rbac update" on public.collection_photos for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "rbac delete" on public.collection_photos for delete to authenticated using (public.is_staff());

-- ---------- Chi tiền: Admin + Kế toán thấy và làm tất cả; vai trò khác chỉ thấy / làm với lệnh Chi của chính mình ----------
create policy "rbac select" on public.expenses for select to authenticated
  using (public.is_fin() or (public.is_office() and created_by = auth.uid()));
create policy "rbac insert" on public.expenses for insert to authenticated
  with check (public.is_office() and created_by = auth.uid());
create policy "rbac update" on public.expenses for update to authenticated
  using (public.is_fin() or (public.is_office() and created_by = auth.uid() and status = 'pending'))
  with check (public.is_fin() or (public.is_office() and created_by = auth.uid() and status = 'pending'));
create policy "rbac delete" on public.expenses for delete to authenticated
  using (public.is_fin() or (public.is_office() and created_by = auth.uid() and status = 'pending'));

create policy "rbac all" on public.expense_photos for all to authenticated
  using (public.is_office() and public.can_see_expense(expense_id)) with check (public.is_office() and public.can_see_expense(expense_id));

-- ---------- Kho ảnh ----------
drop policy if exists "delivery docs read" on storage.objects;
drop policy if exists "delivery docs upload" on storage.objects;
drop policy if exists "delivery docs delete" on storage.objects;
create policy "delivery docs read" on storage.objects
  for select to authenticated using (
    bucket_id = 'delivery-docs' and (public.can_see_order_text(split_part(name, '/', 1)) or public.driver_owns_order(split_part(name, '/', 1)))
  );
create policy "delivery docs upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'delivery-docs' and (public.can_see_order_text(split_part(name, '/', 1)) or public.driver_owns_order(split_part(name, '/', 1)))
  );
create policy "delivery docs delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'delivery-docs' and (public.can_see_order_text(split_part(name, '/', 1)) or public.driver_can_delete_file(name))
  );

drop policy if exists "collection bills select" on storage.objects;
drop policy if exists "collection bills insert" on storage.objects;
drop policy if exists "collection bills delete" on storage.objects;
create policy "collection bills select" on storage.objects for select to authenticated
  using (bucket_id = 'collection-bills' and public.my_role() in ('staff', 'accountant', 'dispatcher', 'sales'));
create policy "collection bills insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'collection-bills' and public.my_role() in ('staff', 'sales'));
create policy "collection bills delete" on storage.objects for delete to authenticated
  using (bucket_id = 'collection-bills' and public.is_staff());

drop policy if exists "expense docs select" on storage.objects;
drop policy if exists "expense docs insert" on storage.objects;
drop policy if exists "expense docs delete" on storage.objects;
create policy "expense docs select" on storage.objects for select to authenticated using (bucket_id = 'expense-docs' and public.is_office());
create policy "expense docs insert" on storage.objects for insert to authenticated with check (bucket_id = 'expense-docs' and public.is_office());
create policy "expense docs delete" on storage.objects for delete to authenticated using (bucket_id = 'expense-docs' and public.is_office());
