-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run. Chạy MỘT lần (chạy lại cũng không sao).
-- Sửa biển số nhập sai 29E-373.23 thành biển số đúng 29E-378.23 ở toàn bộ hệ thống:
--   - Danh sách xe (giữ nguyên xe, chỉ đổi biển số nên phiếu chi nhiên liệu / bảo dưỡng vẫn gắn đúng xe);
--   - Đơn hàng và Kế hoạch chạy xe (cột biển số trên đơn);
--   - Nếu lỡ đã tạo thêm một xe 29E-378.23 riêng thì gộp hai xe làm một.

do $$
declare
  v_old constant text := '29E-373.23';
  v_new constant text := '29E-378.23';
  wrong_id uuid;
  right_id uuid;
  n_orders int;
begin
  select id into wrong_id from public.vehicles where plate = v_old;
  select id into right_id from public.vehicles where plate = v_new;

  if wrong_id is not null and right_id is not null then
    -- Đã có cả hai xe: chuyển phiếu chi của xe đúng sang xe đang dùng rồi xoá bản trùng.
    -- Tạm tắt kiểm tra "phiếu đã duyệt không sửa được" vì đây chỉ là gộp xe, không đổi nội dung phiếu.
    alter table public.expenses disable trigger expenses_a_guard;
    update public.expenses set vehicle_id = wrong_id where vehicle_id = right_id;
    alter table public.expenses enable trigger expenses_a_guard;
    delete from public.vehicles where id = right_id;
    raise notice 'Đã gộp xe % trùng vào xe đang dùng.', v_new;
  end if;

  if wrong_id is not null then
    update public.vehicles set plate = v_new where id = wrong_id;
    raise notice 'Đã đổi biển số xe % thành %.', v_old, v_new;
  elsif right_id is null then
    raise notice 'Không tìm thấy xe % hay % trong Danh sách xe.', v_old, v_new;
  end if;

  update public.orders set plate = v_new where plate = v_old;
  get diagnostics n_orders = row_count;
  raise notice 'Đã sửa biển số trên % đơn hàng.', n_orders;
end $$;

-- Kiểm tra lại (kết quả phải là 0 cho biển số sai):
select
  (select count(*) from public.vehicles where plate = '29E-373.23') as xe_bien_sai,
  (select count(*) from public.orders where plate = '29E-373.23') as don_bien_sai,
  (select count(*) from public.vehicles where plate = '29E-378.23') as xe_bien_dung,
  (select count(*) from public.orders where plate = '29E-378.23') as don_bien_dung;
