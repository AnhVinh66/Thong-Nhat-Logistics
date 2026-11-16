'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import Modal from './Modal';

export const DOCS_BUCKET = 'delivery-docs';

export const docKinds = [
  { id: 'bien_ban', label: 'Biên bản giao nhận' },
  { id: 'bill', label: 'Ảnh bill khách hàng' },
];

// Xoá file ảnh trong kho trước khi xoá đơn / điểm trả (dòng dữ liệu tự xoá theo cascade)
export async function removeDocFiles({ orderId, stopIds }) {
  let q = supabase.from('delivery_photos').select('path');
  q = orderId ? q.eq('order_id', orderId) : q.in('stop_id', stopIds);
  const { data, error } = await q;
  if (error || !data?.length) return;
  await supabase.storage.from(DOCS_BUCKET).remove(data.map((d) => d.path));
}

// Thu nhỏ ảnh (cạnh dài tối đa 1600px, JPEG) để tải nhanh và tiết kiệm dung lượng
export async function compress(file) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
    if (blob && blob.size < file.size) return { blob, ext: 'jpg', type: 'image/jpeg' };
  } catch {
    // Trình duyệt không đọc được định dạng (VD: HEIC) -> tải nguyên bản
  }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  return { blob: file, ext, type: file.type || 'image/jpeg' };
}

// Tải nhiều ảnh lên cho một điểm giao. Trả về { ok, total }.
export async function uploadDocs(orderId, stopId, kind, fileList) {
  const files = [...(fileList || [])];
  let ok = 0;
  for (const file of files) {
    if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) continue;
    const { blob, ext, type } = await compress(file);
    const path = `${orderId}/${stopId || 'main'}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const up = await supabase.storage.from(DOCS_BUCKET).upload(path, blob, { contentType: type });
    if (up.error) continue;
    const ins = await supabase.from('delivery_photos').insert({ order_id: orderId, stop_id: stopId || null, kind, path });
    if (ins.error) {
      await supabase.storage.from(DOCS_BUCKET).remove([path]);
      continue;
    }
    ok++;
  }
  return { ok, total: files.length };
}

function KindSection({ kind, photos, urls, busy, onUpload, onDelete }) {
  const inputId = `up-${kind.id}`;
  const camId = `cam-${kind.id}`;
  return (
    <section className="doc-section">
      <div className="doc-head">
        <h3>{kind.label} <span className="muted small">({photos.length})</span></h3>
        <div className="doc-actions">
          <label htmlFor={camId} className="btn btn-primary sm">Chụp ảnh</label>
          <input id={camId} type="file" accept="image/*" capture="environment" hidden disabled={busy}
            onChange={(e) => { onUpload(kind.id, e.target.files); e.target.value = ''; }} />
          <label htmlFor={inputId} className="btn btn-outline sm">Chọn ảnh</label>
          <input id={inputId} type="file" accept="image/*" multiple hidden disabled={busy}
            onChange={(e) => { onUpload(kind.id, e.target.files); e.target.value = ''; }} />
        </div>
      </div>
      {photos.length ? (
        <ul className="thumbs">
          {photos.map((p) => (
            <li key={p.id}>
              {urls[p.path] ? (
                <a href={urls[p.path]} target="_blank" rel="noopener noreferrer" aria-label={`Mở ảnh ${kind.label} cỡ lớn`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urls[p.path]} alt={`${kind.label} – ${new Date(p.created_at).toLocaleString('vi-VN')}`} loading="lazy" />
                </a>
              ) : (
                <div className="thumb-ph">Đang tải...</div>
              )}
              <span className="thumb-date">{new Date(p.created_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</span>
              <button type="button" className="thumb-del" onClick={() => onDelete(p)} aria-label="Xoá ảnh này">✕</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>Chưa có ảnh.</p>
      )}
    </section>
  );
}

export default function DeliveryDocs({ orderId, stopId, title, onClose, onChanged }) {
  const [photos, setPhotos] = useState([]);
  const [urls, setUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('delivery_photos').select('*').eq('order_id', orderId).order('created_at');
    q = stopId ? q.eq('stop_id', stopId) : q.is('stop_id', null);
    const { data, error } = await q;
    if (error) {
      setMsg({ ok: false, text: 'Chưa sẵn sàng lưu ảnh. Hãy chạy supabase/delivery-photos.sql trên Supabase.' });
      setLoading(false);
      return;
    }
    setPhotos(data);
    if (data.length) {
      const { data: signed } = await supabase.storage.from(DOCS_BUCKET).createSignedUrls(data.map((p) => p.path), 3600);
      setUrls(Object.fromEntries((signed || []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl])));
    }
    setLoading(false);
  }, [orderId, stopId]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(kind, fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    setBusy(true);
    setMsg({ ok: true, text: `Đang tải lên ${files.length} ảnh...` });
    const { ok } = await uploadDocs(orderId, stopId, kind, files);
    setBusy(false);
    setMsg(
      ok === files.length
        ? { ok: true, text: `Đã tải lên ${ok} ảnh.` }
        : { ok: false, text: `Tải lên được ${ok}/${files.length} ảnh. Ảnh lỗi có thể quá 10 MB hoặc không phải file ảnh; vui lòng thử lại.` }
    );
    load();
    onChanged?.();
  }

  async function remove(p) {
    if (!window.confirm('Xoá ảnh này? Thao tác này không thể hoàn tác.')) return;
    // Xoá file trước (quyền xoá file của lái xe dựa vào dòng dữ liệu ảnh nên dòng phải còn), rồi mới xoá dòng.
    // Không có quyền thì kho trả về danh sách rỗng -> dừng, không xoá gì.
    const st = await supabase.storage.from(DOCS_BUCKET).remove([p.path]);
    if (st.error || !st.data?.length) {
      setMsg({ ok: false, text: 'Không xoá được ảnh. Lái xe chỉ xoá được ảnh do chính mình tải lên.' });
      return;
    }
    const del = await supabase.from('delivery_photos').delete().eq('id', p.id);
    if (del.error) setMsg({ ok: false, text: 'Đã xoá file nhưng chưa xoá được bản ghi ảnh. Vui lòng thử lại.' });
    load();
    onChanged?.();
  }

  return (
    <Modal title={title} onClose={onClose}>
      {msg && <p className={msg.ok ? 'ok-msg' : 'err'} role="status" style={{ marginBottom: 12 }}>{msg.text}</p>}
      {loading && !photos.length ? (
        <p className="muted">Đang tải...</p>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          {docKinds.map((k) => (
            <KindSection
              key={k.id}
              kind={k}
              photos={photos.filter((p) => p.kind === k.id)}
              urls={urls}
              busy={busy}
              onUpload={upload}
              onDelete={remove}
            />
          ))}
        </div>
      )}
      <div className="modal-actions" style={{ marginTop: 18 }}>
        <button type="button" className="btn btn-outline" onClick={onClose}>Đóng</button>
      </div>
    </Modal>
  );
}
