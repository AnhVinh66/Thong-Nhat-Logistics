-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run.
-- Đối soát lệnh Thu với sao kê ngân hàng (tích xanh / X đỏ). CẦN CHẠY SAU collections.sql và bank.sql.
-- Chạy nhiều lần không sao.
--
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
