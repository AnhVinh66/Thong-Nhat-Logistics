-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run.
-- Giao dịch ngân hàng: tài khoản ngân hàng, giao dịch từ sao kê, chống trùng, mã Hash.
-- Chạy nhiều lần không sao. Tự dùng quyền "chỉ văn phòng" nếu đã chạy driver-role.sql.

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
