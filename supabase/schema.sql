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

-- ===== Mã đơn con cho điểm trả =====

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

-- ===== Phí cầu đường và bến bãi =====

alter table public.orders add column if not exists toll_fee bigint not null default 0 check (toll_fee >= 0);
alter table public.orders add column if not exists parking_fee bigint not null default 0 check (parking_fee >= 0);
alter table public.order_stops add column if not exists toll_fee bigint not null default 0 check (toll_fee >= 0);
alter table public.order_stops add column if not exists parking_fee bigint not null default 0 check (parking_fee >= 0);

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

-- ===== Thu tiền =====

-- ---------- Mã khách hàng (khách cũ được đánh mã tự động) ----------
alter table public.customers add column if not exists customer_no bigint generated by default as identity;
create unique index if not exists customers_customer_no_key on public.customers (customer_no);

-- ---------- Phiếu Thu ----------
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  collection_no bigint generated always as identity,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_by_name text,
  customer_id uuid not null references public.customers (id) on delete restrict,
  amount bigint not null check (amount > 0),
  method text not null check (method in ('cash', 'transfer')),
  collected_on date not null,
  content text
);
create index if not exists collections_customer_idx on public.collections (customer_id);
create index if not exists collections_date_idx on public.collections (collected_on desc);

-- Phiếu Thu được phân bổ vào những đơn hàng nào, bao nhiêu tiền
create table if not exists public.collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete restrict,
  amount bigint not null check (amount > 0)
);
create index if not exists collection_items_collection_idx on public.collection_items (collection_id);
create index if not exists collection_items_order_idx on public.collection_items (order_id);

-- Ảnh bill thu tiền
create table if not exists public.collection_photos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  path text not null unique
);
create index if not exists collection_photos_collection_idx on public.collection_photos (collection_id);

-- ---------- Chặn thu quá số tiền của khách trong đơn ----------
create or replace function public.check_collection_item() returns trigger
language plpgsql as $$
declare
  cust uuid;
  fee_total bigint;
  paid_total bigint;
begin
  select customer_id into cust from public.collections where id = new.collection_id;
  -- Cước của khách trong đơn: đơn 1 điểm = cước đơn; đơn nhiều điểm = tổng cước các điểm trả của khách
  fee_total :=
    coalesce((select sum(s.fee) from public.order_stops s where s.order_id = new.order_id and s.customer_id = cust), 0)
    + coalesce((select o.fee from public.orders o where o.id = new.order_id and o.order_type = 'single' and o.customer_id = cust), 0);
  if fee_total = 0 then
    raise exception 'Đơn hàng này không thuộc khách hàng đã chọn.';
  end if;
  select coalesce(sum(i.amount), 0) into paid_total
  from public.collection_items i
  join public.collections c on c.id = i.collection_id
  where i.order_id = new.order_id and c.customer_id = cust and i.id <> new.id;
  if paid_total + new.amount > fee_total then
    raise exception 'Số tiền thu vượt quá số còn thiếu của đơn hàng (còn thiếu % đ).', (fee_total - paid_total);
  end if;
  return new;
end;
$$;

drop trigger if exists collection_items_check on public.collection_items;
create trigger collection_items_check before insert or update on public.collection_items
  for each row execute function public.check_collection_item();

-- ---------- Sửa phiếu Thu: chạy trọn vẹn trong một giao dịch (lỗi thì không thay đổi gì) ----------
alter table public.collections add column if not exists updated_at timestamptz;
alter table public.collections add column if not exists updated_by_name text;

create or replace function public.update_collection(
  p_id uuid, p_customer uuid, p_amount bigint, p_method text, p_date date, p_content text, p_items jsonb, p_by text
) returns void
language plpgsql as $fn$
begin
  update public.collections
     set customer_id = p_customer, amount = p_amount, method = p_method, collected_on = p_date,
         content = p_content, updated_at = now(), updated_by_name = p_by
   where id = p_id;
  if not found then
    raise exception 'Không tìm thấy phiếu Thu (có thể đã bị xoá hoặc bạn không có quyền).';
  end if;
  delete from public.collection_items where collection_id = p_id;
  insert into public.collection_items (collection_id, order_id, amount)
  select p_id, (x ->> 'order_id')::uuid, (x ->> 'amount')::bigint
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x;
end;
$fn$;

revoke execute on function public.update_collection(uuid, uuid, bigint, text, date, text, jsonb, text) from public, anon;
grant execute on function public.update_collection(uuid, uuid, bigint, text, date, text, jsonb, text) to authenticated;

-- ---------- Kho ảnh bill (riêng tư, 10 MB/ảnh, chỉ ảnh) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('collection-bills', 'collection-bills', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------- Quyền: chỉ văn phòng (nếu đã có hàm is_staff) hoặc mọi tài khoản đăng nhập (dự án chưa có vai trò) ----------
do $$
declare
  t text;
  cond text := case when to_regprocedure('public.is_staff()') is not null then 'public.is_staff()' else 'true' end;
  op text;
begin
  foreach t in array array['collections', 'collection_items', 'collection_photos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "staff full access" on public.%I', t);
    execute format('drop policy if exists "staff all" on public.%I', t);
    execute format('create policy "staff all" on public.%I for all to authenticated using (%s) with check (%s)', t, cond, cond);
  end loop;

  foreach op in array array['select', 'insert', 'delete'] loop
    execute format('drop policy if exists %I on storage.objects', 'collection bills ' || op);
  end loop;
  execute format('create policy "collection bills select" on storage.objects for select to authenticated using (bucket_id = ''collection-bills'' and %s)', cond);
  execute format('create policy "collection bills insert" on storage.objects for insert to authenticated with check (bucket_id = ''collection-bills'' and %s)', cond);
  execute format('create policy "collection bills delete" on storage.objects for delete to authenticated using (bucket_id = ''collection-bills'' and %s)', cond);
end $$;

-- ===== Giao dịch ngân hàng =====

-- ---------- Tài khoản ngân hàng ----------
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  bank_name text not null,
  account_number text not null,
  account_name text not null,
  note text,
  statement_mapping jsonb, -- cách đọc file sao kê của ngân hàng này (nhớ lại cho lần tải sau)
  unique (bank_name, account_number)
);

-- ---------- Giao dịch (mỗi dòng sao kê) ----------
-- amount > 0: tiền vào, amount < 0: tiền ra.
-- Chống trùng: cùng tài khoản + cùng ngày giờ phút giây + cùng số tiền thì chỉ lưu một lần.
-- seq chỉ dùng cho sao kê KHÔNG có giờ phút giây (chỉ có ngày): đánh số các giao dịch cùng ngày, cùng số tiền
-- để không bị coi là trùng; sao kê có giờ luôn có seq = 0.
create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  bank_account_id uuid not null references public.bank_accounts (id) on delete cascade,
  txn_time timestamptz not null,
  has_time boolean not null default true,
  seq integer not null default 0,
  amount bigint not null check (amount <> 0),
  balance bigint,
  description text,
  customer_id uuid references public.customers (id) on delete set null,
  uploaded_by_name text,
  source_file text,
  unique (bank_account_id, txn_time, amount, seq)
);
create index if not exists bank_txn_account_time_idx on public.bank_transactions (bank_account_id, txn_time desc);
create index if not exists bank_txn_customer_idx on public.bank_transactions (customer_id);

-- ---------- Khung nhìn có Mã Hash và hướng giao dịch ----------
-- Mã Hash dạng THU_20261116_21021998_83645000_STT_1 (THU/CHI, ngày, số tài khoản, số tiền, số thứ tự trong ngày cùng số tiền)
create or replace view public.bank_transactions_v with (security_invoker = true) as
select
  t.*,
  case when t.amount > 0 then 'in' else 'out' end as direction,
  (case when t.amount > 0 then 'THU' else 'CHI' end)
    || '_' || to_char(t.txn_time at time zone 'Asia/Ho_Chi_Minh', 'YYYYMMDD')
    || '_' || regexp_replace(a.account_number, '\D', '', 'g')
    || '_' || abs(t.amount)::text
    || '_STT_' || (row_number() over (
         partition by t.bank_account_id, (t.txn_time at time zone 'Asia/Ho_Chi_Minh')::date, t.amount
         order by t.txn_time, t.seq, t.created_at, t.id))::text as hash_code
from public.bank_transactions t
join public.bank_accounts a on a.id = t.bank_account_id;

revoke all on public.bank_transactions_v from anon;
grant select on public.bank_transactions_v to authenticated;

-- ---------- Tổng quan từng tài khoản ----------
create or replace function public.bank_overview()
returns table (bank_account_id uuid, txn_count bigint, total_in bigint, total_out bigint, last_time timestamptz, last_balance bigint)
language sql stable security invoker set search_path = public as $$
  select a.id,
         count(t.id),
         coalesce(sum(t.amount) filter (where t.amount > 0), 0)::bigint,
         coalesce(-sum(t.amount) filter (where t.amount < 0), 0)::bigint,
         max(t.txn_time),
         (select t2.balance from public.bank_transactions t2
           where t2.bank_account_id = a.id and t2.balance is not null
           order by t2.txn_time desc, t2.seq desc, t2.created_at desc limit 1)
  from public.bank_accounts a
  left join public.bank_transactions t on t.bank_account_id = a.id
  group by a.id;
$$;

-- ---------- Tổng tiền vào / ra theo bộ lọc của trang chi tiết ----------
create or replace function public.bank_totals(
  p_account uuid, p_from timestamptz default null, p_to timestamptz default null,
  p_q text default null, p_status text default 'all'
) returns table (txn_count bigint, total_in bigint, total_out bigint)
language sql stable security invoker set search_path = public as $$
  select count(*),
         coalesce(sum(amount) filter (where amount > 0), 0)::bigint,
         coalesce(-sum(amount) filter (where amount < 0), 0)::bigint
  from public.bank_transactions
  where bank_account_id = p_account
    and (p_from is null or txn_time >= p_from)
    and (p_to is null or txn_time < p_to)
    and (p_q is null or p_q = '' or description ilike '%' || p_q || '%')
    and (p_status = 'all' or (p_status = 'matched' and customer_id is not null) or (p_status = 'unmatched' and customer_id is null));
$$;

revoke execute on function public.bank_overview() from public, anon;
revoke execute on function public.bank_totals(uuid, timestamptz, timestamptz, text, text) from public, anon;
grant execute on function public.bank_overview() to authenticated;
grant execute on function public.bank_totals(uuid, timestamptz, timestamptz, text, text) to authenticated;

-- ---------- Quyền: chỉ văn phòng (nếu đã có hàm is_staff) hoặc mọi tài khoản đăng nhập ----------
do $$
declare
  t text;
  cond text := case when to_regprocedure('public.is_staff()') is not null then 'public.is_staff()' else 'true' end;
begin
  foreach t in array array['bank_accounts', 'bank_transactions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "staff full access" on public.%I', t);
    execute format('drop policy if exists "staff all" on public.%I', t);
    execute format('create policy "staff all" on public.%I for all to authenticated using (%s) with check (%s)', t, cond, cond);
  end loop;
end $$;

-- ===== Đối soát lệnh Thu với sao kê =====
-- Một lệnh Thu "khớp" khi có MỘT dòng sao kê TIỀN VÀO thoả cả 3 điều kiện:
--   1) đúng ngân hàng (tài khoản),  2) đúng tổng số tiền của lệnh Thu,  3) đúng ngày/tháng/năm (giờ Việt Nam).
-- Mỗi dòng sao kê chỉ gắn với tối đa một lệnh Thu (có chỉ mục duy nhất chặn gắn trùng).
-- Hệ thống tự đối soát lại khi tạo / sửa / xoá lệnh Thu và mỗi khi thêm dòng sao kê mới.

-- ---------- Cột liên kết ----------
-- Các cột này có thể chưa có nếu trước đây bạn chạy bản cũ của collections.sql
alter table public.collections add column if not exists updated_at timestamptz;
alter table public.collections add column if not exists updated_by_name text;
alter table public.collections add column if not exists bank_account_id uuid references public.bank_accounts (id) on delete set null;
alter table public.collections add column if not exists bank_transaction_id uuid references public.bank_transactions (id) on delete set null;
create unique index if not exists collections_bank_txn_key on public.collections (bank_transaction_id) where bank_transaction_id is not null;
create index if not exists collections_match_idx on public.collections (bank_account_id, amount) where bank_transaction_id is null;
create index if not exists bank_txn_match_idx on public.bank_transactions (bank_account_id, amount);

-- ---------- Trước khi lưu lệnh Thu: giữ liên kết nếu vẫn đúng, nếu không thì tìm dòng sao kê còn trống ----------
create or replace function public.collections_match_before() returns trigger
language plpgsql as $$
declare
  t uuid;
begin
  -- Tiền mặt (hoặc chưa chọn ngân hàng) thì không đối soát được với sao kê
  if new.method <> 'transfer' or new.bank_account_id is null then
    new.bank_transaction_id := null;
    return new;
  end if;

  if new.bank_transaction_id is not null then
    if exists (
      select 1 from public.bank_transactions b
      where b.id = new.bank_transaction_id
        and b.bank_account_id = new.bank_account_id
        and b.amount = new.amount
        and (b.txn_time at time zone 'Asia/Ho_Chi_Minh')::date = new.collected_on
    ) then
      return new; -- vẫn khớp đủ 3 điều kiện
    end if;
    new.bank_transaction_id := null; -- sửa làm mất khớp -> bỏ liên kết cũ
  end if;

  select b.id into t
  from public.bank_transactions b
  where b.bank_account_id = new.bank_account_id
    and b.amount = new.amount
    and (b.txn_time at time zone 'Asia/Ho_Chi_Minh')::date = new.collected_on
    and not exists (select 1 from public.collections x where x.bank_transaction_id = b.id and x.id <> new.id)
  order by (b.customer_id is not distinct from new.customer_id) desc, b.txn_time, b.seq, b.created_at
  limit 1;

  new.bank_transaction_id := t;
  return new;
end;
$$;

drop trigger if exists collections_match on public.collections;
create trigger collections_match before insert or update on public.collections
  for each row execute function public.collections_match_before();

-- ---------- Khi có dòng sao kê mới / dòng sao kê vừa được giải phóng: gắn cho lệnh Thu đang chờ ----------
create or replace function public.try_match_txn(p_txn uuid) returns void
language plpgsql as $$
declare
  b public.bank_transactions;
  cid uuid;
begin
  select * into b from public.bank_transactions where id = p_txn;
  if not found or b.amount <= 0 then return; end if;
  if exists (select 1 from public.collections where bank_transaction_id = p_txn) then return; end if;

  select c.id into cid
  from public.collections c
  where c.bank_transaction_id is null
    and c.method = 'transfer'
    and c.bank_account_id = b.bank_account_id
    and c.amount = b.amount
    and c.collected_on = (b.txn_time at time zone 'Asia/Ho_Chi_Minh')::date
  order by (c.customer_id is not distinct from b.customer_id) desc, c.created_at
  limit 1;

  if cid is not null then
    update public.collections set bank_transaction_id = p_txn where id = cid; -- trigger BEFORE xác nhận lại
  end if;
end;
$$;

create or replace function public.bank_txn_after_insert() returns trigger
language plpgsql as $$
begin
  perform public.try_match_txn(new.id);
  return new;
end;
$$;

drop trigger if exists bank_txn_match on public.bank_transactions;
create trigger bank_txn_match after insert on public.bank_transactions
  for each row execute function public.bank_txn_after_insert();

-- Lệnh Thu bị xoá hoặc đổi sang dòng sao kê khác: dòng sao kê cũ được giải phóng cho lệnh Thu khác
create or replace function public.collections_after_change() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.bank_transaction_id is not null then perform public.try_match_txn(old.bank_transaction_id); end if;
  elsif old.bank_transaction_id is not null and old.bank_transaction_id is distinct from new.bank_transaction_id then
    perform public.try_match_txn(old.bank_transaction_id);
  end if;
  return null;
end;
$$;

drop trigger if exists collections_after on public.collections;
create trigger collections_after after update or delete on public.collections
  for each row execute function public.collections_after_change();

-- ---------- Sửa phiếu Thu (thêm ngân hàng) ----------
drop function if exists public.update_collection(uuid, uuid, bigint, text, date, text, jsonb, text);

create or replace function public.update_collection(
  p_id uuid, p_customer uuid, p_amount bigint, p_method text, p_date date, p_content text, p_items jsonb, p_by text,
  p_bank uuid default null
) returns void
language plpgsql as $fn$
begin
  update public.collections
     set customer_id = p_customer, amount = p_amount, method = p_method, collected_on = p_date,
         content = p_content, bank_account_id = p_bank, updated_at = now(), updated_by_name = p_by
   where id = p_id;
  if not found then
    raise exception 'Không tìm thấy phiếu Thu (có thể đã bị xoá hoặc bạn không có quyền).';
  end if;
  delete from public.collection_items where collection_id = p_id;
  insert into public.collection_items (collection_id, order_id, amount)
  select p_id, (x ->> 'order_id')::uuid, (x ->> 'amount')::bigint
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x;
end;
$fn$;

revoke execute on function public.update_collection(uuid, uuid, bigint, text, date, text, jsonb, text, uuid) from public, anon;
grant execute on function public.update_collection(uuid, uuid, bigint, text, date, text, jsonb, text, uuid) to authenticated;

-- ---------- Khung nhìn giao dịch: thêm lệnh Thu đã khớp ----------
create or replace view public.bank_transactions_v with (security_invoker = true) as
select
  t.*,
  case when t.amount > 0 then 'in' else 'out' end as direction,
  (case when t.amount > 0 then 'THU' else 'CHI' end)
    || '_' || to_char(t.txn_time at time zone 'Asia/Ho_Chi_Minh', 'YYYYMMDD')
    || '_' || regexp_replace(a.account_number, '\D', '', 'g')
    || '_' || abs(t.amount)::text
    || '_STT_' || (row_number() over (
         partition by t.bank_account_id, (t.txn_time at time zone 'Asia/Ho_Chi_Minh')::date, t.amount
         order by t.txn_time, t.seq, t.created_at, t.id))::text as hash_code,
  c.id as collection_id,
  c.collection_no as collection_no
from public.bank_transactions t
join public.bank_accounts a on a.id = t.bank_account_id
left join public.collections c on c.bank_transaction_id = t.id;

revoke all on public.bank_transactions_v from anon;
grant select on public.bank_transactions_v to authenticated;

-- ---------- Tổng tiền theo bộ lọc: trạng thái theo lệnh Thu đã khớp ----------
create or replace function public.bank_totals(
  p_account uuid, p_from timestamptz default null, p_to timestamptz default null,
  p_q text default null, p_status text default 'all'
) returns table (txn_count bigint, total_in bigint, total_out bigint)
language sql stable security invoker set search_path = public as $$
  select count(*),
         coalesce(sum(t.amount) filter (where t.amount > 0), 0)::bigint,
         coalesce(-sum(t.amount) filter (where t.amount < 0), 0)::bigint
  from public.bank_transactions t
  where t.bank_account_id = p_account
    and (p_from is null or t.txn_time >= p_from)
    and (p_to is null or t.txn_time < p_to)
    and (p_q is null or p_q = '' or t.description ilike '%' || p_q || '%')
    and (p_status = 'all'
         or (p_status = 'matched' and exists (select 1 from public.collections c where c.bank_transaction_id = t.id))
         or (p_status = 'unmatched' and t.amount > 0 and not exists (select 1 from public.collections c where c.bank_transaction_id = t.id)));
$$;

-- ---------- Đối soát ngay các lệnh Thu đã có (nếu đã chọn ngân hàng) ----------
update public.collections set updated_at = updated_at
 where method = 'transfer' and bank_account_id is not null and bank_transaction_id is null;

-- ===== Chi tiền =====
-- ---------- Phiếu chi ----------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_no bigint generated always as identity,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_by_name text,
  expense_date date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  type text not null check (type in ('salary', 'maintenance', 'fuel', 'advertising', 'utilities', 'other', 'advance')),
  vehicle_id uuid references public.vehicles (id) on delete restrict,
  amount bigint not null check (amount > 0),
  method text not null check (method in ('cash', 'transfer')),
  bank_account_id uuid references public.bank_accounts (id) on delete set null,
  bank_transaction_id uuid references public.bank_transactions (id) on delete set null,
  content text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid')),
  approved_at timestamptz,
  approved_by_name text,
  paid_at timestamptz,
  paid_by_name text,
  updated_at timestamptz,
  updated_by_name text,
  check (type not in ('maintenance', 'fuel') or vehicle_id is not null)
);
create index if not exists expenses_date_idx on public.expenses (expense_date desc);
create index if not exists expenses_status_idx on public.expenses (status);
create unique index if not exists expenses_bank_txn_key on public.expenses (bank_transaction_id) where bank_transaction_id is not null;
create index if not exists expenses_match_idx on public.expenses (bank_account_id, amount) where bank_transaction_id is null;

create table if not exists public.expense_photos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  path text not null unique
);
create index if not exists expense_photos_expense_idx on public.expense_photos (expense_id);

-- ---------- Quy trình duyệt và khoá chỉnh sửa ----------
-- Hợp lệ: Chờ duyệt -> Đã duyệt -> Đã thanh toán; hoàn lại từng bước (Đã thanh toán -> Đã duyệt -> Chờ duyệt).
-- Chỉ phiếu "Chờ duyệt" mới sửa / xoá được (ảnh hóa đơn thì thêm bớt được ở mọi trạng thái).
create or replace function public.expenses_a_guard() returns trigger
language plpgsql as $$
declare
  core_changed boolean;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'pending' then
      raise exception 'Chỉ xoá được phiếu chi đang ở trạng thái Chờ duyệt. Hãy hoàn phiếu về Chờ duyệt trước.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.approved_at := null; new.approved_by_name := null;
    new.paid_at := null; new.paid_by_name := null;
    return new;
  end if;

  core_changed :=
    new.amount is distinct from old.amount or new.method is distinct from old.method
    or new.expense_date is distinct from old.expense_date or new.type is distinct from old.type
    or new.vehicle_id is distinct from old.vehicle_id or new.bank_account_id is distinct from old.bank_account_id
    or new.content is distinct from old.content;

  if new.status is distinct from old.status then
    if not ((old.status = 'pending' and new.status = 'approved')
         or (old.status = 'approved' and new.status in ('paid', 'pending'))
         or (old.status = 'paid' and new.status = 'approved')) then
      raise exception 'Không thể chuyển phiếu chi từ trạng thái % sang %.', old.status, new.status;
    end if;
    if core_changed then
      raise exception 'Không thể vừa đổi trạng thái vừa sửa nội dung phiếu chi.';
    end if;
    if new.status = 'approved' then
      new.approved_at := now();
      new.paid_at := null; new.paid_by_name := null;
    elsif new.status = 'paid' then
      new.paid_at := now();
    else -- về Chờ duyệt
      new.approved_at := null; new.approved_by_name := null;
      new.paid_at := null; new.paid_by_name := null;
    end if;
  elsif core_changed and old.status <> 'pending' then
    raise exception 'Phiếu chi đã duyệt hoặc đã thanh toán, không sửa được. Hãy hoàn phiếu về Chờ duyệt trước.';
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_a_guard on public.expenses;
create trigger expenses_a_guard before insert or update or delete on public.expenses
  for each row execute function public.expenses_a_guard();

-- ---------- Đối chiếu sao kê: dòng sao kê TIỀN RA, cùng ngân hàng, số tiền và ngày ----------
create or replace function public.expenses_b_match() returns trigger
language plpgsql as $$
declare
  t uuid;
begin
  if new.method <> 'transfer' or new.bank_account_id is null then
    new.bank_transaction_id := null;
    return new;
  end if;

  if new.bank_transaction_id is not null then
    if exists (
      select 1 from public.bank_transactions b
      where b.id = new.bank_transaction_id
        and b.bank_account_id = new.bank_account_id
        and b.amount = -new.amount
        and (b.txn_time at time zone 'Asia/Ho_Chi_Minh')::date = new.expense_date
    ) then
      return new;
    end if;
    new.bank_transaction_id := null;
  end if;

  select b.id into t
  from public.bank_transactions b
  where b.bank_account_id = new.bank_account_id
    and b.amount = -new.amount
    and (b.txn_time at time zone 'Asia/Ho_Chi_Minh')::date = new.expense_date
    and not exists (select 1 from public.expenses x where x.bank_transaction_id = b.id and x.id <> new.id)
  order by b.txn_time, b.seq, b.created_at
  limit 1;

  new.bank_transaction_id := t;
  return new;
end;
$$;

drop trigger if exists expenses_b_match on public.expenses;
create trigger expenses_b_match before insert or update on public.expenses
  for each row execute function public.expenses_b_match();

create or replace function public.try_match_txn_out(p_txn uuid) returns void
language plpgsql as $$
declare
  b public.bank_transactions;
  eid uuid;
begin
  select * into b from public.bank_transactions where id = p_txn;
  if not found or b.amount >= 0 then return; end if;
  if exists (select 1 from public.expenses where bank_transaction_id = p_txn) then return; end if;

  select e.id into eid
  from public.expenses e
  where e.bank_transaction_id is null
    and e.method = 'transfer'
    and e.bank_account_id = b.bank_account_id
    and e.amount = -b.amount
    and e.expense_date = (b.txn_time at time zone 'Asia/Ho_Chi_Minh')::date
  order by e.created_at
  limit 1;

  if eid is not null then
    update public.expenses set bank_transaction_id = p_txn where id = eid;
  end if;
end;
$$;

-- Dòng sao kê mới: thử gắn cho lệnh Thu (tiền vào) hoặc phiếu chi (tiền ra)
create or replace function public.bank_txn_after_insert() returns trigger
language plpgsql as $$
begin
  if new.amount > 0 then
    perform public.try_match_txn(new.id);
  else
    perform public.try_match_txn_out(new.id);
  end if;
  return new;
end;
$$;

create or replace function public.expenses_after_change() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.bank_transaction_id is not null then perform public.try_match_txn_out(old.bank_transaction_id); end if;
  elsif old.bank_transaction_id is not null and old.bank_transaction_id is distinct from new.bank_transaction_id then
    perform public.try_match_txn_out(old.bank_transaction_id);
  end if;
  return null;
end;
$$;

drop trigger if exists expenses_after on public.expenses;
create trigger expenses_after after update or delete on public.expenses
  for each row execute function public.expenses_after_change();

-- ---------- Khung nhìn giao dịch: thêm phiếu chi đã khớp ----------
create or replace view public.bank_transactions_v with (security_invoker = true) as
select
  t.*,
  case when t.amount > 0 then 'in' else 'out' end as direction,
  (case when t.amount > 0 then 'THU' else 'CHI' end)
    || '_' || to_char(t.txn_time at time zone 'Asia/Ho_Chi_Minh', 'YYYYMMDD')
    || '_' || regexp_replace(a.account_number, '\D', '', 'g')
    || '_' || abs(t.amount)::text
    || '_STT_' || (row_number() over (
         partition by t.bank_account_id, (t.txn_time at time zone 'Asia/Ho_Chi_Minh')::date, t.amount
         order by t.txn_time, t.seq, t.created_at, t.id))::text as hash_code,
  c.id as collection_id,
  c.collection_no as collection_no,
  e.id as expense_id,
  e.expense_no as expense_no
from public.bank_transactions t
join public.bank_accounts a on a.id = t.bank_account_id
left join public.collections c on c.bank_transaction_id = t.id
left join public.expenses e on e.bank_transaction_id = t.id;

revoke all on public.bank_transactions_v from anon;
grant select on public.bank_transactions_v to authenticated;

-- ---------- Tổng tiền theo bộ lọc: "Đã khớp" gồm cả lệnh Thu (tiền vào) và phiếu chi (tiền ra) ----------
create or replace function public.bank_totals(
  p_account uuid, p_from timestamptz default null, p_to timestamptz default null,
  p_q text default null, p_status text default 'all'
) returns table (txn_count bigint, total_in bigint, total_out bigint)
language sql stable security invoker set search_path = public as $$
  select count(*),
         coalesce(sum(t.amount) filter (where t.amount > 0), 0)::bigint,
         coalesce(-sum(t.amount) filter (where t.amount < 0), 0)::bigint
  from public.bank_transactions t
  where t.bank_account_id = p_account
    and (p_from is null or t.txn_time >= p_from)
    and (p_to is null or t.txn_time < p_to)
    and (p_q is null or p_q = '' or t.description ilike '%' || p_q || '%')
    and (p_status = 'all'
         or (p_status = 'matched' and (exists (select 1 from public.collections c where c.bank_transaction_id = t.id)
                                    or exists (select 1 from public.expenses e where e.bank_transaction_id = t.id)))
         or (p_status = 'unmatched' and not exists (select 1 from public.collections c where c.bank_transaction_id = t.id)
                                    and not exists (select 1 from public.expenses e where e.bank_transaction_id = t.id)));
$$;

-- ---------- Kho ảnh hóa đơn (riêng tư, 10 MB/ảnh) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-docs', 'expense-docs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------- Quyền: chỉ văn phòng (nếu đã có hàm is_staff) hoặc mọi tài khoản đăng nhập ----------
do $$
declare
  t text;
  cond text := case when to_regprocedure('public.is_staff()') is not null then 'public.is_staff()' else 'true' end;
  op text;
begin
  foreach t in array array['expenses', 'expense_photos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "staff full access" on public.%I', t);
    execute format('drop policy if exists "staff all" on public.%I', t);
    execute format('create policy "staff all" on public.%I for all to authenticated using (%s) with check (%s)', t, cond, cond);
  end loop;

  foreach op in array array['select', 'insert', 'delete'] loop
    execute format('drop policy if exists %I on storage.objects', 'expense docs ' || op);
  end loop;
  execute format('create policy "expense docs select" on storage.objects for select to authenticated using (bucket_id = ''expense-docs'' and %s)', cond);
  execute format('create policy "expense docs insert" on storage.objects for insert to authenticated with check (bucket_id = ''expense-docs'' and %s)', cond);
  execute format('create policy "expense docs delete" on storage.objects for delete to authenticated using (bucket_id = ''expense-docs'' and %s)', cond);
end $$;

-- ===== Thống kê theo xe =====
create index if not exists orders_plate_idx on public.orders (plate);
create index if not exists expenses_vehicle_idx on public.expenses (vehicle_id);

-- p_from / p_to: khoảng ngày (gồm cả hai đầu); để trống = tất cả thời gian.
--   * Đơn hàng tính theo NGÀY VẬN CHUYỂN (đơn chưa có ngày vận chuyển chỉ nằm trong "tất cả thời gian").
--   * Chi phí tính theo NGÀY CHI của phiếu chi loại nhiên liệu / bảo dưỡng gắn với xe.
-- p_include_pending: false = chỉ tính phiếu chi đã duyệt hoặc đã thanh toán; true = tính cả phiếu chờ duyệt.
create or replace function public.vehicle_stats(
  p_from date default null, p_to date default null, p_include_pending boolean default false
) returns table (vehicle_id uuid, plate text, order_count bigint, revenue bigint, fuel_cost bigint, maintenance_cost bigint)
language sql stable security invoker set search_path = public as $$
  select v.id,
         v.plate,
         coalesce(o.cnt, 0)::bigint,
         coalesce(o.rev, 0)::bigint,
         coalesce(e.fuel, 0)::bigint,
         coalesce(e.maint, 0)::bigint
  from public.vehicles v
  left join lateral (
    select count(*) as cnt, sum(x.fee) as rev
    from public.orders x
    where x.plate = v.plate
      and (p_from is null or x.ship_date >= p_from)
      and (p_to is null or x.ship_date <= p_to)
  ) o on true
  left join lateral (
    select sum(y.amount) filter (where y.type = 'fuel') as fuel,
           sum(y.amount) filter (where y.type = 'maintenance') as maint
    from public.expenses y
    where y.vehicle_id = v.id
      and y.type in ('fuel', 'maintenance')
      and (p_from is null or y.expense_date >= p_from)
      and (p_to is null or y.expense_date <= p_to)
      and (p_include_pending or y.status in ('approved', 'paid'))
  ) e on true
  order by v.plate;
$$;

revoke execute on function public.vehicle_stats(date, date, boolean) from public, anon;
grant execute on function public.vehicle_stats(date, date, boolean) to authenticated;

-- ===== Vai trò lái xe (giữ ở CUỐI file) =====
-- ---------- Bảng vai trò ----------
create table if not exists public.staff_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null check (role in ('staff', 'sales', 'accountant', 'dispatcher', 'driver')),
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
  if p_role not in ('staff', 'sales', 'accountant', 'dispatcher', 'driver', 'none') then
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

-- ===== Kế hoạch chạy xe =====
create index if not exists orders_plan_idx on public.orders (plate, ship_date, trip_seq);

-- Đánh lại số thứ tự 1..n cho các chuyến của một xe trong một ngày, đưa chuyến p_order vào vị trí p_pos (null = cuối)
create or replace function public.plan_resequence(p_plate text, p_date date, p_order uuid, p_pos int)
returns void language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  select coalesce(array_agg(id order by trip_seq nulls last, order_no), '{}') into ids
  from public.orders where plate = p_plate and ship_date = p_date and (p_order is null or id <> p_order);
  if p_order is not null then
    if p_pos is null or p_pos > coalesce(array_length(ids, 1), 0) then
      ids := ids || p_order;
    else
      ids := ids[1:greatest(p_pos, 1) - 1] || p_order || ids[greatest(p_pos, 1):];
    end if;
  end if;
  update public.orders o set trip_seq = t.n from unnest(ids) with ordinality as t(id, n) where o.id = t.id;
end;
$$;
revoke execute on function public.plan_resequence(text, date, uuid, int) from public, anon, authenticated;

-- Xếp một đơn vào xe + ngày + vị trí; p_plate rỗng = bỏ xếp lịch (đơn quay về danh sách chưa xếp)
create or replace function public.plan_assign(p_order uuid, p_plate text, p_driver text, p_date date, p_pos int default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  old_plate text;
  old_date date;
  v_tons numeric;
begin
  select role into v_role from public.staff_roles where user_id = auth.uid();
  if v_role is null or v_role not in ('staff', 'dispatcher') then
    raise exception 'Chỉ Admin hoặc Điều phối xe mới được sửa kế hoạch chạy xe.';
  end if;
  select plate, ship_date into old_plate, old_date from public.orders where id = p_order;
  if not found then
    raise exception 'Không tìm thấy đơn hàng.';
  end if;

  if coalesce(trim(p_plate), '') = '' then
    update public.orders set plate = null, trip_seq = null, driver = nullif(trim(coalesce(p_driver, '')), '') where id = p_order;
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
           trip_seq = null
     where id = p_order;
    perform public.plan_resequence(p_plate, p_date, p_order, p_pos);
  end if;

  -- Dồn lại số thứ tự ở ô cũ (xe + ngày cũ) nếu chuyến đã rời đi
  if old_plate is not null and old_date is not null and (old_plate is distinct from nullif(trim(coalesce(p_plate, '')), '') or old_date is distinct from p_date) then
    perform public.plan_resequence(old_plate, old_date, null, null);
  end if;
end;
$$;
revoke execute on function public.plan_assign(uuid, text, text, date, int) from public, anon;
grant execute on function public.plan_assign(uuid, text, text, date, int) to authenticated;

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

-- ===== Trạng thái đơn hàng =====
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

-- ===== Phân quyền theo vai trò (giữ ở CUỐI file) =====
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

-- Khách hàng mới do nhân viên kinh doanh tạo thì thuộc về người đó; kinh doanh không tự đổi người phụ trách
create or replace function public.customers_set_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_sales() then
    if tg_op = 'INSERT' then new.sales_user_id := auth.uid(); else new.sales_user_id := old.sales_user_id; end if;
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
