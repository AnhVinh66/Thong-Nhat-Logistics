-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run.
-- Cho phép tính tổng tiền vào / ra của TẤT CẢ ngân hàng (cửa sổ "Tất cả giao dịch" ở trang Giao dịch ngân hàng):
-- bank_totals(p_account => null) = mọi tài khoản. Chạy nhiều lần không sao. CẦN CHẠY SAU expenses.sql.
create or replace function public.bank_totals(
  p_account uuid, p_from timestamptz default null, p_to timestamptz default null,
  p_q text default null, p_status text default 'all'
) returns table (txn_count bigint, total_in bigint, total_out bigint)
language sql stable security invoker set search_path = public as $$
  select count(*),
         coalesce(sum(t.amount) filter (where t.amount > 0), 0)::bigint,
         coalesce(-sum(t.amount) filter (where t.amount < 0), 0)::bigint
  from public.bank_transactions t
  where (p_account is null or t.bank_account_id = p_account)
    and (p_from is null or t.txn_time >= p_from)
    and (p_to is null or t.txn_time < p_to)
    and (p_q is null or p_q = '' or t.description ilike '%' || p_q || '%')
    and (p_status = 'all'
         or (p_status = 'matched' and (exists (select 1 from public.collections c where c.bank_transaction_id = t.id)
                                    or exists (select 1 from public.expenses e where e.bank_transaction_id = t.id)))
         or (p_status = 'unmatched' and not exists (select 1 from public.collections c where c.bank_transaction_id = t.id)
                                    and not exists (select 1 from public.expenses e where e.bank_transaction_id = t.id)));
$$;
