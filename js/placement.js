'use strict';
let GS = 10;
const placed = {};
const gmap       = {};  // normal furniture grid
const gmap_floor = {};  // floor-layer items (rug) — furniture may overlap

// ── Wall items ─────────────────────────────────────────────────────────────
const wallPlaced = {};
let _wid = 0;
const _WALL_Y = 1.8;
function _wallZ() { return -GS / 2 + 0.12; }

function canPlaceOnWall(wx) {
  if (Object.keys(wallPlaced).length >= 3) return false;
  const sx = Math.round(wx);
  return !Object.values(wallPlaced).some(w => w.wx === sx);
}

function placeOnWall(def, wx, colorHex) {
  const sx = Math.round(wx);
  if (!canPlaceOnWall(wx)) return null;
  colorHex = colorHex != null ? colorHex : def.colors[0]?.hex;
  const group = def.build(colorHex);
  group.position.set(sx, _WALL_Y, _wallZ());
  scene.add(group);
  const wid = `w${_wid++}`;
  wallPlaced[wid] = { def, wx: sx, colorHex, group };
  group.traverse(o => { if (o.isMesh) o.userData.wid = wid; });
  return wid;
}

function removeWallItem(wid) {
  if (!wallPlaced[wid]) return;
  scene.remove(wallPlaced[wid].group);
  delete wallPlaced[wid];
}

function clearAllWallItems() {
  Object.keys(wallPlaced).forEach(wid => removeWallItem(wid));
}

function _gmapFor(def) { return def?.layer === 'floor' ? gmap_floor : gmap; }
let _pid = 0;
let _preview = null;
let _previewMesh = null;
let _dragOverlay = null;
let _dragMesh = null;

const _popAnims  = []; // {group, t}
const _snapAnims = []; // {item, x0, z0, x1, z1, t}

// Selection highlight ring
let _selRing = null;

function _effDims(def, rot) {
  return (rot % 2 === 0) ? { w: def.w, d: def.d } : { w: def.d, d: def.w };
}
function centerOf(ai, aj, def, rot) {
  const e = _effDims(def, rot);
  return { x: -GS/2 + ai + e.w/2, z: -GS/2 + aj + e.d/2 };
}
function anchorFor(wx, wz, def, rot) {
  const e = _effDims(def, rot);
  return {
    ai: Math.floor(wx + GS/2) - Math.floor(e.w/2),
    aj: Math.floor(wz + GS/2) - Math.floor(e.d/2),
  };
}
function _keys(def, ai, aj, rot) {
  const e = _effDims(def, rot), out = [];
  for (let i = 0; i < e.w; i++)
    for (let j = 0; j < e.d; j++)
      out.push(`${ai+i},${aj+j}`);
  return out;
}
function canPlace(def, ai, aj, rot) {
  const e = _effDims(def, rot);
  const gm = _gmapFor(def);
  for (let i = 0; i < e.w; i++)
    for (let j = 0; j < e.d; j++) {
      if (ai+i < 0 || ai+i >= GS || aj+j < 0 || aj+j >= GS) return false;
      if (gm[`${ai+i},${aj+j}`]) return false;
    }
  return true;
}

function _makeShadow(cx, cz, def, rot) {
  const e = _effDims(def, rot);
  const s = new THREE.Mesh(
    new THREE.CircleGeometry(1, 20),
    new THREE.MeshBasicMaterial({ color: 0x2a1000, transparent: true, opacity: .13, depthWrite: false })
  );
  s.rotation.x = -Math.PI / 2;
  s.scale.set(e.w * .45, 1, e.d * .45);
  s.position.set(cx, .005, cz);
  return s;
}

function place(def, ai, aj, rot, colorHex, animate) {
  rot = rot || 0;
  colorHex = colorHex != null ? colorHex : def.colors[0]?.hex;
  if (!canPlace(def, ai, aj, rot)) return null;
  const group = def.build(colorHex);
  group.rotation.y = rot * Math.PI / 2;
  const c = centerOf(ai, aj, def, rot);
  group.position.set(c.x, 0, c.z);
  scene.add(group);
  const shadow = _makeShadow(c.x, c.z, def, rot);
  scene.add(shadow);
  const id = `p${_pid++}`;
  placed[id] = { def, ai, aj, rot, colorHex, group, shadow };
  _keys(def, ai, aj, rot).forEach(k => { _gmapFor(def)[k] = id; });
  group.traverse(o => { if (o.isMesh) o.userData.pid = id; });
  if (animate !== false) {
    group.position.y = 0.85;
    _popAnims.push({ group, t: 0 });
  }
  if (typeof _invalidateHitCache === 'function') _invalidateHitCache();
  return id;
}

function clearAllPlaced() {
  Object.keys(placed).forEach(id => remove(id));
  Object.keys(gmap).forEach(k => delete gmap[k]);
  Object.keys(gmap_floor).forEach(k => delete gmap_floor[k]);
  _popAnims.length = 0;
  _snapAnims.length = 0;
}

function remove(id) {
  if (!placed[id]) return;
  clearSelectionHighlight();
  scene.remove(placed[id].group);
  scene.remove(placed[id].shadow);
  _keys(placed[id].def, placed[id].ai, placed[id].aj, placed[id].rot).forEach(k => delete _gmapFor(placed[id].def)[k]);
  delete placed[id];
  if (typeof _invalidateHitCache === 'function') _invalidateHitCache();
}

function lift(id) {
  if (!placed[id]) return;
  _keys(placed[id].def, placed[id].ai, placed[id].aj, placed[id].rot).forEach(k => delete _gmapFor(placed[id].def)[k]);
}

function drop(id, ai, aj, rot) {
  const item = placed[id];
  if (!item) return false;
  rot = (rot !== undefined) ? rot : item.rot;
  if (!canPlace(item.def, ai, aj, rot)) return false;
  item.ai = ai; item.aj = aj; item.rot = rot;
  _keys(item.def, ai, aj, rot).forEach(k => { _gmapFor(item.def)[k] = id; });
  item.group.rotation.y = rot * Math.PI / 2;
  const c = centerOf(ai, aj, item.def, rot);
  item.group.position.set(c.x, 0, c.z);
  const e = _effDims(item.def, rot);
  item.shadow.scale.set(e.w * .45, 1, e.d * .45);
  item.shadow.position.set(c.x, .005, c.z);
  return true;
}

function recolor(id, newHex) {
  const item = placed[id];
  if (!item) return;
  scene.remove(item.group);
  const newGroup = item.def.build(newHex);
  newGroup.rotation.y = item.rot * Math.PI / 2;
  const c = centerOf(item.ai, item.aj, item.def, item.rot);
  newGroup.position.set(c.x, 0, c.z);
  scene.add(newGroup);
  newGroup.traverse(o => { if (o.isMesh) o.userData.pid = id; });
  item.group = newGroup;
  item.colorHex = newHex;
  if (_selRing) _selRing.ring.position.set(c.x, .009, c.z);
  if (typeof _invalidateHitCache === 'function') _invalidateHitCache();
}

function restore(id, origAI, origAJ, origRot) {
  const item = placed[id];
  if (!item) return;
  item.ai = origAI; item.aj = origAJ; item.rot = origRot;
  _keys(item.def, origAI, origAJ, origRot).forEach(k => { _gmapFor(item.def)[k] = id; });
  item.group.rotation.y = origRot * Math.PI / 2;
  const c = centerOf(origAI, origAJ, item.def, origRot);
  item.group.position.set(c.x, 0, c.z);
  const e = _effDims(item.def, origRot);
  item.shadow.scale.set(e.w * .45, 1, e.d * .45);
  item.shadow.position.set(c.x, .005, c.z);
}

function dragTo(id, wx, wz, rot) {
  if (!placed[id]) return;
  placed[id].group.rotation.y = rot * Math.PI / 2;
  placed[id].group.position.set(wx, 0, wz);
  placed[id].shadow.position.set(wx, .005, wz);
}

// Animate item from (fromX,fromZ) back to its current (restored) position
function snapBack(id, fromX, fromZ) {
  const item = placed[id];
  if (!item) return;
  const toX = item.group.position.x, toZ = item.group.position.z;
  item.group.position.set(fromX, 0, fromZ);
  item.shadow.position.set(fromX, .005, fromZ);
  _snapAnims.push({ item, x0: fromX, z0: fromZ, x1: toX, z1: toZ, t: 0 });
}

// ── Selection highlight ────────────────────────────────────────────────────
function showSelectionHighlight(id) {
  clearSelectionHighlight();
  const item = placed[id];
  if (!item) return;
  const e = _effDims(item.def, item.rot);
  const r = Math.max(e.w, e.d) * 0.58;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(r * .68, r * 1.10, 48),
    new THREE.MeshBasicMaterial({ color: 0xf8c8e0, transparent: true, opacity: .52, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(item.group.position.x, .009, item.group.position.z);
  scene.add(ring);
  _selRing = { ring, t: 0 };
}

function clearSelectionHighlight() {
  if (_selRing) { scene.remove(_selRing.ring); _selRing = null; }
}

function updateHighlightPos(id) {
  if (!_selRing || !placed[id]) return;
  _selRing.ring.position.x = placed[id].group.position.x;
  _selRing.ring.position.z = placed[id].group.position.z;
}

// ── Preview ────────────────────────────────────────────────────────────────
function showPreview(def, ai, aj, rot) {
  rot = rot || 0;
  const ok = canPlace(def, ai, aj, rot);
  const e  = _effDims(def, rot);
  const c  = centerOf(ai, aj, def, rot);
  const h  = def.h || 1.0;
  if (!_previewMesh) {
    _preview = new THREE.Group();
    _previewMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: .30, depthWrite: false })
    );
    _preview.add(_previewMesh);
    scene.add(_preview);
  }
  _previewMesh.scale.set(e.w - .1, h, e.d - .1);
  _previewMesh.position.y = h / 2;
  _previewMesh.material.color.setHex(ok ? 0x80e888 : 0xff6060);
  _preview.position.set(c.x, 0, c.z);
  _preview.visible = true;
}
function clearPreview() { if (_preview) _preview.visible = false; }

function showDragOverlay(wx, wz, def, rot, valid) {
  const e = _effDims(def, rot);
  if (!_dragMesh) {
    _dragMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, .06, 1),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: .45, depthWrite: false })
    );
    scene.add(_dragMesh);
    _dragOverlay = _dragMesh;
  }
  _dragMesh.scale.set(e.w - .08, 1, e.d - .08);
  _dragMesh.position.set(wx, .03, wz);
  _dragMesh.material.color.setHex(valid ? 0x60cc60 : 0xff4040);
  _dragMesh.visible = true;
}
function clearDragOverlay() { if (_dragMesh) _dragMesh.visible = false; }

// ── Nearest free cell (Chebyshev ring search) ─────────────────────────────
function _nearestFree(def, ai, aj, rot) {
  for (let radius = 1; radius <= GS; radius++) {
    for (let di = -radius; di <= radius; di++) {
      for (let dj = -radius; dj <= radius; dj++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== radius) continue;
        if (canPlace(def, ai + di, aj + dj, rot)) return { ai: ai + di, aj: aj + dj };
      }
    }
  }
  return null;
}

// ── Tick ───────────────────────────────────────────────────────────────────
function tickPlacement() {
  // Drop-in animations (~200ms, cubic ease-out)
  for (let i = _popAnims.length - 1; i >= 0; i--) {
    const a = _popAnims[i];
    a.t = Math.min(1, a.t + 0.085);
    const e = 1 - Math.pow(1 - a.t, 3);
    a.group.position.y = 0.85 * (1 - e);
    if (a.t >= 1) { a.group.position.y = 0; _popAnims.splice(i, 1); }
  }
  // Snap-back animations (elastic spring)
  for (let i = _snapAnims.length - 1; i >= 0; i--) {
    const a = _snapAnims[i];
    a.t = Math.min(1, a.t + .09);
    const e = 1 - Math.exp(-9 * a.t) * Math.cos(a.t * 18);
    a.item.group.position.x = a.x0 + (a.x1 - a.x0) * e;
    a.item.group.position.z = a.z0 + (a.z1 - a.z0) * e;
    a.item.shadow.position.x = a.item.group.position.x;
    a.item.shadow.position.z = a.item.group.position.z;
    if (a.t >= 1) {
      a.item.group.position.set(a.x1, 0, a.z1);
      a.item.shadow.position.set(a.x1, .005, a.z1);
      _snapAnims.splice(i, 1);
    }
  }
  // Highlight ring pulse (~1.2s gentle breathe, range 0.24–0.64)
  if (_selRing) {
    _selRing.t += .034;
    _selRing.ring.material.opacity = .44 + .20 * Math.sin(_selRing.t * 2.5);
  }
}
