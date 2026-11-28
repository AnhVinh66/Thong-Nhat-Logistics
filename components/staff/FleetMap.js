'use client';

import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

// Chữ đưa vào bản đồ luôn qua textContent (không ghép HTML từ dữ liệu Vietmap)
function el(className, text) {
  const d = document.createElement('div');
  d.className = className;
  if (text != null) d.textContent = text;
  return d;
}

// slot: thứ tự trong nhóm xe đỗ sát nhau, để các biển số xếp thành cột thay vì đè lên nhau
function carIcon(L, v, slot) {
  const box = el('gps-car');
  const dot = el(`gps-dot gps-${v.tone}`);
  if (v.tone === 'ok') {
    const arrow = el('gps-arrow');
    arrow.style.transform = `rotate(${Number(v.heading) || 0}deg)`;
    dot.append(arrow);
  }
  const plate = el('gps-plate', v.plate);
  plate.style.top = `${27 + slot * 23}px`;
  box.append(dot, plate);
  return L.divIcon({ html: box, className: '', iconSize: [24, 24], iconAnchor: [12, 12] });
}

// Mũi tên chiều đi dọc theo hành trình: cách nhau đều trên màn hình ở mọi mức thu phóng, lệch sang phải chiều đi
// nên lượt đi và lượt về trên cùng con đường nằm ở hai bên khác nhau.
const ARROW_GAP = 60;
function drawArrows(L, map, layer, track) {
  layer.clearLayers();
  const zoom = map.getZoom();
  const view = map.getPixelBounds(undefined, zoom);
  const pts = [];
  track.forEach((p) => {
    const q = map.project([p.y, p.x], zoom);
    const last = pts[pts.length - 1];
    if (!last || last.distanceTo(q) >= 4) pts.push(q); // bỏ rung lắc GPS khi xe đứng yên
  });
  let run = ARROW_GAP / 2;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = a.distanceTo(b);
    const dir = pts[Math.min(pts.length - 1, i + 1)].subtract(pts[Math.max(0, i - 2)]);
    const size = Math.hypot(dir.x, dir.y);
    while (run <= len) {
      const at = a.add(b.subtract(a).multiplyBy(run / len));
      run += ARROW_GAP;
      if (!size) continue;
      const spot = at.add(L.point(-dir.y / size, dir.x / size).multiplyBy(6));
      if (!view.contains(spot)) continue;
      const box = el('gps-way');
      const deg = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
      box.innerHTML = `<svg viewBox="0 0 18 18" style="transform:rotate(${deg}deg)"><path d="M3 2l13 7-13 7 4-7z" fill="#dc2626" stroke="#fff" stroke-width="1"/></svg>`;
      L.marker(map.unproject(spot, zoom), { icon: L.divIcon({ html: box, className: '', iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false, keyboard: false }).addTo(layer);
    }
    run -= len;
  }
}

// vehicles: [{ id, plate, x, y, heading, tone }] · track: [{ x, y }] · stops: [{ x, y, label }]
// fitKey: đổi giá trị thì bản đồ canh lại cho vừa (làm mới vị trí thì không canh lại) · focus: { x, y, n } để bay tới một điểm
export default function FleetMap({ vehicles = [], track = [], stops = [], fitKey = '', focus = null }) {
  const box = useRef(null);
  const ref = useRef(null); // { L, map, layer }
  const fitted = useRef(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(0); // đổi mức thu phóng thì xếp lại nhãn biển số

  useEffect(() => {
    let dead = false;
    import('leaflet').then(({ default: L }) => {
      if (dead || ref.current) return;
      const map = L.map(box.current, { zoomAnimation: false }).setView([20.98, 105.85], 9);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
      ref.current = { L, map, layer: L.layerGroup().addTo(map), arrows: L.layerGroup().addTo(map) };
      map.on('zoomend', () => setZoom(map.getZoom()));
      setReady(true);
    });
    return () => {
      dead = true;
      ref.current?.map.remove();
      ref.current = null;
      fitted.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !ref.current) return;
    const { L, map, layer } = ref.current;
    layer.clearLayers();
    const all = [];
    const at = (p) => [p.y, p.x];

    if (track.length > 1) {
      const line = track.map(at);
      L.polyline(line, { color: '#ffffff', weight: 8, opacity: 0.9 }).addTo(layer);
      L.polyline(line, { color: '#1d4ed8', weight: 4, opacity: 0.9 }).addTo(layer);
      L.circleMarker(line[0], { radius: 7, color: '#fff', weight: 2, fillColor: '#15803d', fillOpacity: 1 }).bindTooltip('Điểm đầu hành trình').addTo(layer);
      L.circleMarker(line[line.length - 1], { radius: 7, color: '#fff', weight: 2, fillColor: '#b91c1c', fillOpacity: 1 }).bindTooltip('Điểm cuối hành trình').addTo(layer);
      all.push(...line);
    }
    stops.forEach((s, i) => {
      L.marker(at(s), { icon: L.divIcon({ html: el('gps-stop', String(i + 1)), className: '', iconSize: [24, 24], iconAnchor: [12, 12] }) })
        .bindTooltip(el('gps-tip', s.label), { direction: 'top', offset: [0, -10] })
        .addTo(layer);
      all.push(at(s));
    });
    vehicles.forEach((v, i) => {
      // Xe nằm gần nhau trên màn hình (dưới 40 px ở mức thu phóng hiện tại) thì nhãn xếp so le xuống dưới
      const p = map.latLngToLayerPoint(at(v));
      const slot = vehicles.slice(0, i).filter((o) => map.latLngToLayerPoint(at(o)).distanceTo(p) < 40).length;
      L.marker(at(v), { icon: carIcon(L, v, slot), title: v.plate }).addTo(layer);
      all.push(at(v));
    });

    if (all.length && fitted.current !== fitKey) {
      fitted.current = fitKey;
      map.fitBounds(L.latLngBounds(all), { padding: [40, 40], maxZoom: 15 });
    }
  }, [ready, vehicles, track, stops, fitKey, zoom]);

  // Vẽ lại mũi tên mỗi khi kéo hoặc thu phóng bản đồ
  useEffect(() => {
    if (!ready || !ref.current) return;
    const { L, map, arrows } = ref.current;
    const draw = () => drawArrows(L, map, arrows, track);
    draw();
    map.on('moveend', draw);
    return () => {
      map.off('moveend', draw);
      arrows.clearLayers();
    };
  }, [ready, track]);

  useEffect(() => {
    if (ready && focus && ref.current) ref.current.map.setView([focus.y, focus.x], 15);
  }, [ready, focus]);

  return <div ref={box} className="gps-map" role="application" aria-label="Bản đồ vị trí xe" />;
}
