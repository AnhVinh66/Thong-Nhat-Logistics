'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';

const isImage = (f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name);

// Khung tải file: bấm để chọn file, hoặc kéo thả file từ máy tính vào khung.
// onFiles nhận một mảng File (đã lọc theo accept). Mặc định chỉ nhận ảnh.
export default function DropZone({
  id,
  onFiles,
  accept = 'image/*',
  multiple = true,
  disabled = false,
  label = 'Chọn file',
  hint = 'hoặc kéo thả ảnh vào đây',
  wide = false,
}) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const inputRef = useRef(null);

  // Thả file lệch ra ngoài khung thì trình duyệt sẽ mở luôn file và mất form đang nhập -> chặn khi khung đang hiển thị
  useEffect(() => {
    const stop = (e) => {
      if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
    };
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
    };
  }, []);

  const filter = (list) => {
    const files = [...(list || [])];
    const ok = accept === 'image/*' ? files.filter(isImage) : files;
    return multiple ? ok : ok.slice(0, 1);
  };

  const hasFiles = (e) => e.dataTransfer?.types?.includes('Files');

  return (
    <label
      htmlFor={id}
      className={`dropzone ${wide ? 'dropzone-wide' : ''} ${over ? 'over' : ''} ${disabled ? 'disabled' : ''}`}
      onDragEnter={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        if (disabled) return;
        const files = filter(e.dataTransfer.files);
        if (files.length) onFiles(files);
      }}
    >
      <input
        id={id}
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        disabled={disabled}
        onChange={(e) => {
          const files = filter(e.target.files);
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
      <span className="dropzone-label">{over ? 'Thả vào đây' : label}</span>
      <Icon name="image" size={wide ? 22 : 26} />
      {hint && <span className="dropzone-hint">{hint}</span>}
    </label>
  );
}
