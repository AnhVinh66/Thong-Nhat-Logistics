-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run.
-- Chi tiền: phiếu Đề xuất Chi, duyệt (Chờ duyệt -> Đã duyệt -> Đã thanh toán), ảnh hóa đơn, đối chiếu sao kê.
-- CẦN CHẠY SAU: vehicles.sql, bank.sql, reconcile.sql. Chạy nhiều lần không sao.
-- LƯU Ý: nếu sau này bạn chạy lại reconcile.sql thì PHẢI chạy lại file này ngay sau đó
-- (reconcile.sql ghi đè khung nhìn và hàm tổng tiền bản cũ, chưa có phần Chi).

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
