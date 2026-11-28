'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, vnd, displayLogin, expenseCode } from '../../../lib/supabase';
import Modal from '../../../components/staff/Modal';
import RowActions, { ViewBtn, DeleteBtn } from '../../../components/staff/RowActions';
import DateInput from '../../../components/DateInput';
import { todayIso, dmy } from '../../../lib/period';
import {
  DOC_KINDS, docLabel, docStatus, maintStatus, leftText, leftParts, loadKm, kmCounter, num0, addMonths,
  WARN_DAYS, WARN_KM, TONE_LABEL,
} from '../../../lib/vehicleDue';

// Hạn giấy tờ xe và lịch bảo dưỡng. Số km đã chạy lấy từ báo cáo Vietmap, không cần đọc đồng hồ công-tơ-mét.

const TABS = [
  { id: 'due', label: 'Tổng hợp giấy tờ' },
  { id: 'docs', label: 'Giấy tờ theo xe' },
  { id: 'maint', label: 'Bảo dưỡng' },
];
const digits = (s) => String(s).replace(/\D/g, '');
const who = async () => displayLogin((await supabase.auth.getUser()).data?.user?.email);

export default function Page() {
  const today = todayIso();
  const [tab, setTab] = useState('due');
  const [vehicles, setVehicles] = useState(null);
  const [docs, setDocs] = useState([]);
  const [items, setItems] = useState([]);
  const [logs, setLogs] = useState([]);
  const [km, setKm] = useState(null);
  const [kmErr, setKmErr] = useState('');
  const [err, setErr] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [docAt, setDocAt] = useState(null); // { vehicle, kind }
  const [logAt, setLogAt] = useState(null); // { vehicle, item }

  const load = useCallback(async () => {
    const [v, d, i, l] = await Promise.all([
      supabase.from('vehicles').select('id, plate').order('plate'),
      supabase.from('vehicle_docs').select('*').order('expires_on', { ascending: false }),
      supabase.from('maint_items').select('*').order('sort').order('name'),
      supabase.from('maint_logs').select('*').order('done_on', { ascending: false }),
    ]);
    if (d.error || i.error || l.error) setErr('Chưa có bảng hồ sơ xe. Hãy chạy supabase/han-xe.sql trên Supabase.');
    setVehicles(v.data || []);
    setDocs(d.data || []);
    setItems(i.data || []);
    setLogs(l.data || []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Km đã chạy: tải từ ngày bảo dưỡng cũ nhất còn đang tính
  const oldest = useMemo(() => logs.reduce((m, l) => (l.done_on < m ? l.done_on : m), today), [logs, today]);
  useEffect(() => {
    if (!vehicles?.length || oldest === today) return;
    let dead = false;
    loadKm(vehicles, oldest, today)
      .then((k) => !dead && setKm(k))
      .catch((e) => !dead && setKmErr(e.message));
    return () => {
      dead = true;
    };
  }, [vehicles, oldest, today]);
  const kmSince = useMemo(() => kmCounter(km), [km]);

  // Mọi việc của mọi xe, cùng một dạng để xếp và đếm
  const tasks = useMemo(() => {
    if (!vehicles) return [];
    const out = [];
    vehicles.forEach((v) => {
      DOC_KINDS.forEach((k) => {
        const s = docStatus(docs, v.id, k.id, today);
        out.push({ key: `d:${v.id}:${k.id}`, type: 'doc', vehicle: v, kind: k.id, name: k.label, s, dueText: s.cur ? dmy(s.cur.expires_on) : '—' });
      });
      items.forEach((it) => {
        const s = maintStatus(logs, it, v.id, today, kmSince);
        const due = [];
        if (s.last && it.every_km) due.push(s.last.odo_km != null ? `${num0(s.last.odo_km + it.every_km)} km` : `+${num0(it.every_km)} km`);
        if (s.dueDay) due.push(dmy(s.dueDay));
        out.push({ key: `m:${v.id}:${it.id}`, type: 'maint', vehicle: v, item: it, name: it.name, s, dueText: due.join(' / ') || '—' });
      });
    });
    return out;
  }, [vehicles, docs, items, logs, today, kmSince]);

  // Ô đếm theo thẻ đang xem: giấy tờ ở hai thẻ đầu, bảo dưỡng ở thẻ Bảo dưỡng
  const kind = tab === 'maint' ? 'maint' : 'doc';
  const count = (tone) => tasks.filter((t) => t.type === kind && t.s.tone === tone && !(t.kind === 'city_permit' && tone === 'muted')).length;
  // Bảng tổng: mọi giấy tờ đã nhập, hạn gần nhất (kể cả đã quá hạn) xếp trên cùng; loại chưa nhập xếp cuối nếu bật
  const docRows = tasks
    .filter((t) => t.type === 'doc' && (t.s.cur || (showAll && t.kind !== 'city_permit')))
    .sort((a, b) => (a.s.cur ? 0 : 1) - (b.s.cur ? 0 : 1) || (a.s.days ?? 0) - (b.s.days ?? 0) || a.vehicle.plate.localeCompare(b.vehicle.plate));

  return (
    <>
      <div className="staff-head">
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Hồ sơ xe</h1>
      </div>

      <div className="kpis" style={{ marginBottom: 14, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <Kpi tone="err" icon="!" label={kind === 'doc' ? 'Giấy tờ quá hạn' : 'Bảo dưỡng quá hạn'} value={count('err')} sub={kind === 'doc' ? 'Đã hết hạn, cần gia hạn ngay' : 'Đã quá km hoặc quá tháng'} />
        <Kpi tone="warn" icon="⏱" label="Sắp đến hạn" value={count('warn')} sub={kind === 'doc' ? `Trong ${WARN_DAYS} ngày tới` : `Trong ${WARN_DAYS} ngày hoặc ${num0(WARN_KM)} km`} />
        <Kpi tone="navy" icon="?" label="Chưa nhập" value={count('muted')} sub={kind === 'doc' ? 'Loại giấy tờ chưa có hạn' : 'Chưa ghi lần làm gần nhất'} />
        <Kpi tone="ok" icon="✓" label="Còn hạn" value={count('ok')} sub={`Tổng ${vehicles?.length || 0} xe`} />
      </div>

      <div className="seg" role="tablist" aria-label="Hồ sơ xe" style={{ marginBottom: 14 }}>
        {TABS.map((t) => (
          <button type="button" key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {err && <p className="err" role="alert">{err}</p>}
      {kmErr && <p className="err" role="alert">Không lấy được số km từ Vietmap ({kmErr}). Bảo dưỡng đang chỉ tính theo tháng.</p>}

      {tab === 'due' && (
        <>
          <label className="check-inline" style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Hiện cả loại giấy tờ chưa nhập
          </label>
          <div className="table-wrap">
            <table className="staff-table due-table">
              <thead>
                <tr><th>Xe</th><th>Loại giấy tờ</th><th>Số giấy</th><th>Ngày hết hạn</th><th>Còn lại</th><th>Trạng thái</th><th aria-label="Thao tác"></th></tr>
              </thead>
              <tbody>
                {docRows.map((t) => (
                  <tr key={t.key} className={t.s.tone === 'err' || t.s.tone === 'warn' ? `fc-${t.s.tone}` : ''}>
                    <td><strong>{t.vehicle.plate}</strong></td>
                    <td>{t.name}</td>
                    <td className="muted">{t.s.cur?.doc_no || '—'}</td>
                    <td>{t.dueText}</td>
                    <td>{t.s.tone === 'muted' ? <span className="muted">—</span> : leftText(t.s)}</td>
                    <td><span className={`pill pill-${t.s.tone}`}>{TONE_LABEL[t.s.tone]}</span></td>
                    <td><button type="button" className="btn btn-outline sm" onClick={() => setDocAt({ vehicle: t.vehicle, kind: t.kind })}>{t.s.cur ? 'Gia hạn' : 'Nhập hạn'}</button></td>
                  </tr>
                ))}
                {vehicles && !docRows.length && <tr><td colSpan={7} className="muted">Chưa nhập giấy tờ nào.</td></tr>}
                {!vehicles && <tr><td colSpan={7} className="muted">Đang tải...</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'docs' && (
        <>
          <p className="muted small fc-sub">Bấm vào một ô để xem các lần gia hạn và nhập hạn mới. Ô vàng: còn dưới {WARN_DAYS} ngày, ô đỏ: đã hết hạn.</p>
          <div className="table-wrap">
            <table className="staff-table due-grid">
              <thead><tr><th>Xe</th>{DOC_KINDS.map((k) => <th key={k.id}>{k.label}</th>)}</tr></thead>
              <tbody>
                {(vehicles || []).map((v) => (
                  <tr key={v.id}>
                    <td><strong>{v.plate}</strong></td>
                    {DOC_KINDS.map((k) => {
                      const s = docStatus(docs, v.id, k.id, today);
                      return (
                        <td key={k.id} className={`due-cell due-${s.tone}`}>
                          <button type="button" onClick={() => setDocAt({ vehicle: v, kind: k.id })}>
                            {s.cur ? <><strong>{dmy(s.cur.expires_on)}</strong><span>{leftText(s)}</span></> : <span className="muted">+ Nhập hạn</span>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'maint' && (
        <>
          <p className="muted small fc-sub">
            Số km tính từ báo cáo quãng đường Vietmap kể từ ngày làm gần nhất{km ? '' : kmErr ? '' : ' (đang tải...)'}. Bấm vào một ô để ghi lần bảo dưỡng mới.
          </p>
          <div className="table-wrap">
            <table className="staff-table due-grid">
              <thead>
                <tr>
                  <th>Xe</th>
                  {items.map((it) => (
                    <th key={it.id}>{it.name}<div className="muted small">{[it.every_km && `${num0(it.every_km)} km`, it.every_months && `${it.every_months} tháng`].filter(Boolean).join(' / ')}</div></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(vehicles || []).map((v) => (
                  <tr key={v.id}>
                    <td><strong>{v.plate}</strong></td>
                    {items.map((it) => {
                      const s = maintStatus(logs, it, v.id, today, kmSince);
                      return (
                        <td key={it.id} className={`due-cell due-${s.tone}`}>
                          <button type="button" onClick={() => setLogAt({ vehicle: v, item: it })}>
                            {s.last ? (
                              <>
                                {leftParts(s).map((t, i) => (i === 0 ? <strong key={i}>{t}</strong> : <span key={i} className="due-2nd">{t}</span>))}
                                <span>Làm ngày {dmy(s.last.done_on)}</span>
                              </>
                            ) : <span className="muted">+ Ghi lần làm</span>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {!items.length && vehicles && <tr><td className="muted">Chưa có hạng mục bảo dưỡng nào. Thêm ở mục "Hạng mục bảo dưỡng" bên dưới.</td></tr>}
              </tbody>
            </table>
          </div>

          <h2 className="fc-title">Hạng mục bảo dưỡng</h2>
          <p className="muted small fc-sub">Chu kỳ của từng hạng mục, áp dụng cho mọi xe.</p>
          <ItemsPanel items={items} reload={load} />
        </>
      )}

      {docAt && <DocModal at={docAt} docs={docs} today={today} onClose={() => setDocAt(null)} reload={load} />}
      {logAt && <LogModal at={logAt} logs={logs} today={today} kmSince={kmSince} onClose={() => setLogAt(null)} reload={load} />}
    </>
  );
}

function Kpi({ tone, icon, label, value, sub }) {
  return (
    <div className="kpi">
      <span className={`kpi-icon tone-${tone}`}><span aria-hidden="true">{icon}</span></span>
      <span className="kpi-text"><span className="kpi-label">{label}</span><span className="kpi-value">{value}</span><span className="kpi-sub">{sub}</span></span>
    </div>
  );
}

// Lịch sử gia hạn một loại giấy của một xe + nhập lần gia hạn mới
function DocModal({ at, docs, today, onClose, reload }) {
  const { vehicle, kind } = at;
  const s = docStatus(docs, vehicle.id, kind, today);
  const [f, setF] = useState({ doc_no: s.cur?.doc_no || '', issued_on: today, expires_on: s.cur ? addMonths(s.cur.expires_on, 12) : addMonths(today, 12), note: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  async function save(e) {
    e.preventDefault();
    if (!f.expires_on) return setErr('Nhập ngày hết hạn.');
    if (f.issued_on && f.issued_on > f.expires_on) return setErr('Ngày cấp phải trước ngày hết hạn.');
    setBusy(true);
    const { error } = await supabase.from('vehicle_docs').insert({
      vehicle_id: vehicle.id, kind, doc_no: f.doc_no.trim() || null, issued_on: f.issued_on || null, expires_on: f.expires_on, note: f.note.trim() || null, created_by_name: await who(),
    });
    setBusy(false);
    if (error) return setErr(error.code === '42501' ? 'Tài khoản này không được nhập hạn giấy tờ.' : 'Không lưu được. Vui lòng thử lại.');
    await reload();
    onClose();
  }
  async function remove(d) {
    if (!window.confirm(`Xoá dòng hạn ${dmy(d.expires_on)}?`)) return;
    await supabase.from('vehicle_docs').delete().eq('id', d.id);
    reload();
  }

  return (
    <Modal title={`${docLabel(kind)}: xe ${vehicle.plate}`} onClose={onClose} width={620}>
      {s.list.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: 14 }}>
          <table className="staff-table due-hist">
            <thead><tr><th>Số giấy</th><th>Ngày cấp</th><th>Hết hạn</th><th>Người nhập</th><th aria-label="Thao tác"></th></tr></thead>
            <tbody>
              {s.list.map((d, i) => (
                <tr key={d.id}>
                  <td>{d.doc_no || '—'}{d.note && <div className="muted small">{d.note}</div>}</td>
                  <td>{d.issued_on ? dmy(d.issued_on) : '—'}</td>
                  <td><strong>{dmy(d.expires_on)}</strong>{i === 0 && <div className="muted small">Đang dùng</div>}</td>
                  <td className="muted">{d.created_by_name || ''}</td>
                  <td><DeleteBtn label="Xoá dòng hạn này" onClick={() => remove(d)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form className="form" onSubmit={save}>
        <strong>{s.cur ? 'Nhập lần gia hạn mới' : 'Nhập hạn giấy tờ'}</strong>
        <div className="due-form">
          <div className="field"><label htmlFor="dc-no">Số giấy / số hợp đồng</label><input id="dc-no" value={f.doc_no} onChange={(e) => set('doc_no')(e.target.value)} maxLength={100} /></div>
          <div className="field"><label htmlFor="dc-is">Ngày cấp</label><DateInput id="dc-is" value={f.issued_on} onChange={set('issued_on')} /></div>
          <div className="field"><label htmlFor="dc-ex">Ngày hết hạn *</label><DateInput id="dc-ex" value={f.expires_on} onChange={set('expires_on')} /></div>
        </div>
        <div className="field"><label htmlFor="dc-note">Ghi chú</label><input id="dc-note" value={f.note} onChange={(e) => set('note')(e.target.value)} maxLength={500} placeholder="VD: Bảo Việt, phí 1.200.000 đ" /></div>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>Đóng</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</button>
        </div>
      </form>
    </Modal>
  );
}

// Các lần bảo dưỡng một hạng mục của một xe + ghi lần mới (gắn phiếu chi bảo dưỡng nếu có)
function LogModal({ at, logs, today, kmSince, onClose, reload }) {
  const { vehicle, item } = at;
  const s = maintStatus(logs, item, vehicle.id, today, kmSince);
  const [f, setF] = useState({ done_on: today, odo_km: '', note: '', expense_id: '' });
  const [expenses, setExpenses] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    supabase
      .from('expenses')
      .select('id, expense_no, expense_date, amount, content')
      .eq('type', 'maintenance')
      .eq('vehicle_id', vehicle.id)
      .order('expense_date', { ascending: false })
      .limit(30)
      .then(({ data }) => setExpenses(data || []));
  }, [vehicle.id]);

  async function save(e) {
    e.preventDefault();
    if (!f.done_on) return setErr('Nhập ngày làm.');
    if (f.done_on > today) return setErr('Ngày làm không được sau hôm nay.');
    setBusy(true);
    const { error } = await supabase.from('maint_logs').insert({
      vehicle_id: vehicle.id, item_id: item.id, done_on: f.done_on, odo_km: f.odo_km ? Number(f.odo_km) : null, note: f.note.trim() || null, expense_id: f.expense_id || null, created_by_name: await who(),
    });
    setBusy(false);
    if (error) return setErr(error.code === '42501' ? 'Tài khoản này không được ghi bảo dưỡng.' : 'Không lưu được. Vui lòng thử lại.');
    await reload();
    onClose();
  }
  async function remove(l) {
    if (!window.confirm(`Xoá lần bảo dưỡng ngày ${dmy(l.done_on)}?`)) return;
    await supabase.from('maint_logs').delete().eq('id', l.id);
    reload();
  }

  const cycle = [item.every_km && `${num0(item.every_km)} km`, item.every_months && `${item.every_months} tháng`].filter(Boolean).join(' hoặc ');
  return (
    <Modal title={`${item.name}: xe ${vehicle.plate}`} onClose={onClose} width={620}>
      <p className="muted small" style={{ marginTop: 0 }}>
        Chu kỳ: {cycle}, cái nào đến trước.
        {s.last && <> Lần gần nhất {dmy(s.last.done_on)}{s.km != null && `, đã chạy ${num0(s.km)} km`}. {leftText(s)}.</>}
      </p>
      {s.list.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: 14 }}>
          <table className="staff-table due-hist">
            <thead><tr><th>Ngày làm</th><th className="num">Công-tơ-mét</th><th>Phiếu chi</th><th>Ghi chú</th><th aria-label="Thao tác"></th></tr></thead>
            <tbody>
              {s.list.map((l) => {
                const x = expenses.find((e) => e.id === l.expense_id);
                return (
                  <tr key={l.id}>
                    <td><strong>{dmy(l.done_on)}</strong></td>
                    <td className="num">{l.odo_km != null ? `${num0(l.odo_km)} km` : '—'}</td>
                    <td>{x ? `${expenseCode(x.expense_no)} · ${vnd(x.amount)}` : l.expense_id ? 'Có phiếu' : '—'}</td>
                    <td className="muted">{l.note || ''}</td>
                    <td><DeleteBtn label="Xoá lần bảo dưỡng này" onClick={() => remove(l)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <form className="form" onSubmit={save}>
        <strong>Ghi lần bảo dưỡng mới</strong>
        <div className="due-form">
          <div className="field"><label htmlFor="lg-day">Ngày làm *</label><DateInput id="lg-day" value={f.done_on} onChange={set('done_on')} /></div>
          <div className="field"><label htmlFor="lg-odo">Số công-tơ-mét (km)</label><input id="lg-odo" inputMode="numeric" value={f.odo_km ? num0(Number(f.odo_km)) : ''} onChange={(e) => set('odo_km')(digits(e.target.value))} placeholder="Không bắt buộc" /></div>
          <div className="field">
            <label htmlFor="lg-exp">Phiếu chi bảo dưỡng</label>
            <select id="lg-exp" value={f.expense_id} onChange={(e) => set('expense_id')(e.target.value)}>
              <option value="">Không gắn</option>
              {expenses.map((x) => <option key={x.id} value={x.id}>{expenseCode(x.expense_no)} · {dmy(x.expense_date)} · {vnd(x.amount)}</option>)}
            </select>
          </div>
        </div>
        <div className="field"><label htmlFor="lg-note">Ghi chú</label><input id="lg-note" value={f.note} onChange={(e) => set('note')(e.target.value)} maxLength={500} placeholder="VD: Gara Hùng Cường, dầu Shell Rimula 15W-40" /></div>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>Đóng</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</button>
        </div>
      </form>
    </Modal>
  );
}

// Danh sách hạng mục bảo dưỡng và chu kỳ
function ItemsPanel({ items, reload }) {
  const blank = { name: '', every_km: '', every_months: '' };
  const [f, setF] = useState(blank);
  const [edit, setEdit] = useState(null); // id đang sửa
  const [open, setOpen] = useState(false); // ô thêm / sửa chỉ mở khi cần
  const [err, setErr] = useState('');
  const close = () => {
    setOpen(false);
    setEdit(null);
    setF(blank);
    setErr('');
  };
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: k === 'name' ? e.target.value : digits(e.target.value) }));

  async function save(e) {
    e.preventDefault();
    if (!f.name.trim()) return setErr('Nhập tên hạng mục.');
    if (!f.every_km && !f.every_months) return setErr('Nhập chu kỳ theo km, theo tháng, hoặc cả hai.');
    if (f.every_months && (+f.every_months < 1 || +f.every_months > 120)) return setErr('Chu kỳ tháng từ 1 đến 120.');
    const row = { name: f.name.trim(), every_km: f.every_km ? +f.every_km : null, every_months: f.every_months ? +f.every_months : null };
    const q = edit ? supabase.from('maint_items').update(row).eq('id', edit) : supabase.from('maint_items').insert({ ...row, sort: items.length + 1 });
    const { error } = await q;
    if (error) return setErr(error.code === '23505' ? 'Đã có hạng mục trùng tên.' : 'Không lưu được. Vui lòng thử lại.');
    close();
    reload();
  }
  async function remove(it) {
    if (!window.confirm(`Xoá hạng mục "${it.name}"? Các lần bảo dưỡng đã ghi của hạng mục này cũng bị xoá.`)) return;
    await supabase.from('maint_items').delete().eq('id', it.id);
    reload();
  }

  return (
    <div className={open ? 'due-items' : 'due-items closed'}>
      <div>
      <div className="table-wrap">
        <table className="staff-table">
          <thead><tr><th>Hạng mục</th><th className="num">Mỗi (km)</th><th className="num">Mỗi (tháng)</th><th aria-label="Thao tác"></th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td><strong>{it.name}</strong></td>
                <td className="num">{it.every_km ? num0(it.every_km) : '—'}</td>
                <td className="num">{it.every_months || '—'}</td>
                <td>
                  <RowActions
                    view={<ViewBtn label="Sửa hạng mục" onClick={() => { setEdit(it.id); setOpen(true); setErr(''); setF({ name: it.name, every_km: it.every_km ? String(it.every_km) : '', every_months: it.every_months ? String(it.every_months) : '' }); }} />}
                    del={<DeleteBtn label="Xoá hạng mục" onClick={() => remove(it)} />}
                  />
                </td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={4} className="muted">Chưa có hạng mục nào.</td></tr>}
          </tbody>
        </table>
      </div>
      {!open && (
        <button type="button" className="btn btn-outline sm due-add" onClick={() => setOpen(true)}>+ Thêm hạng mục</button>
      )}
      </div>
      {open && (
      <form className="panel form due-item-form" onSubmit={save}>
        <strong>{edit ? 'Sửa hạng mục' : 'Thêm hạng mục'}</strong>
        <div className="field"><label htmlFor="it-name">Tên hạng mục</label><input id="it-name" value={f.name} onChange={set('name')} maxLength={100} placeholder="VD: Thay dầu máy" /></div>
        <div className="field"><label htmlFor="it-km">Chu kỳ theo km</label><input id="it-km" inputMode="numeric" value={f.every_km ? num0(+f.every_km) : ''} onChange={set('every_km')} placeholder="VD: 10.000" /></div>
        <div className="field"><label htmlFor="it-mo">Chu kỳ theo tháng</label><input id="it-mo" inputMode="numeric" value={f.every_months} onChange={set('every_months')} placeholder="VD: 6" /></div>
        <p className="muted small" style={{ margin: 0 }}>Nhập một hoặc cả hai. Cái nào đến trước thì báo trước.</p>
        {err && <p className="err" role="alert">{err}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-outline" onClick={close}>Huỷ</button>
          <button className="btn btn-primary">{edit ? 'Lưu thay đổi' : 'Thêm'}</button>
        </div>
      </form>
      )}
    </div>
  );
}
