-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run.
-- Phí cầu đường và phí bến bãi phát sinh tại điểm trả hàng (có thể có hoặc không).
-- CẦN CHẠY SAU multi-stop.sql. Chạy nhiều lần không sao.
--
-- Đơn 1 điểm: phí ghi ở chính đơn hàng (orders). Đơn nhiều điểm: phí ghi ở từng điểm trả (order_stops),
-- còn orders lưu tổng của các điểm để tiện thống kê.
-- Các khoản phí này được ghi nhận riêng, KHÔNG cộng vào cước phí (fee) của đơn.

alter table public.orders add column if not exists toll_fee bigint not null default 0 check (toll_fee >= 0);
alter table public.orders add column if not exists parking_fee bigint not null default 0 check (parking_fee >= 0);
alter table public.order_stops add column if not exists toll_fee bigint not null default 0 check (toll_fee >= 0);
alter table public.order_stops add column if not exists parking_fee bigint not null default 0 check (parking_fee >= 0);
