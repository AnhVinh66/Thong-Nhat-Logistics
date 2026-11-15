-- !!! Nếu đã chạy driver-role.sql: sau khi chạy file này PHẢI chạy lại driver-role.sql,
-- !!! nếu không lái xe sẽ xem được toàn bộ dữ liệu.
-- Chạy file này trong Supabase: SQL Editor -> New query -> dán -> Run.
-- Ảnh chứng từ giao hàng (biên bản giao nhận, bill khách hàng) cho từng điểm giao. Chạy nhiều lần không sao.
-- Cần chạy multi-stop.sql trước (bảng order_stops).

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
