'use strict';

function _key()      { return `room_v3_${_activeRoom}`; }
function _styleKey() { return `room_style_v1_${_activeRoom}`; }
function _sizeKey()  { return `room_size_v1_${_activeRoom}`; }
function _typeKey()  { return `room_type_v1_${_activeRoom}`; }
function _nameKey(n) { return `room_name_v1_${n}`; }
function _wallKey()  { return `room_wall_v1_${_activeRoom}`; }

function save() {
  const data = Object.values(placed).map(({ def, ai, aj, rot, colorHex }) => ({
    id: def.id, ai, aj, rot: rot || 0, colorHex: colorHex ?? null,
  }));
  try { localStorage.setItem(_key(), JSON.stringify(data)); } catch {}
}

function load() {
  try {
    const raw = localStorage.getItem(_key());
    if (raw === null) {
      for (const { id, ai, aj, rot, colorHex } of (STARTER_LAYOUTS[_activeRoomType] || [])) {
        const def = CATALOG.find(c => c.id === id);
        if (def) place(def, ai, aj, rot, colorHex ?? def.colors[0]?.hex, false);
      }
      save();
      return;
    }
    const data = JSON.parse(raw || '[]');
    for (const { id, ai, aj, rot, colorHex } of data) {
      const def = CATALOG.find(c => c.id === id);
      if (def) place(def, ai, aj, rot || 0, colorHex ?? def.colors[0]?.hex, false);
    }
  } catch {}
}

function saveRoom() {
  try { localStorage.setItem(_styleKey(), JSON.stringify({ wall: _curWall, floor: _curFloor })); } catch {}
}

function loadRoom() {
  try {
    const d = JSON.parse(localStorage.getItem(_styleKey()) || 'null');
    if (!d) {
      const t = ROOM_TYPES[_activeRoomType];
      if (t) { setWallColor(t.wall); _curWall = t.wall; setFloorColor(t.floor); _curFloor = t.floor; }
      return;
    }
    if (d.wall)  { setWallColor(d.wall);   _curWall  = d.wall; }
    if (d.floor) { setFloorColor(d.floor); _curFloor = d.floor; }
  } catch {}
}

function saveRoomSize(size) {
  try { localStorage.setItem(_sizeKey(), String(size)); } catch {}
}

function loadRoomSize() {
  try {
    const v = parseInt(localStorage.getItem(_sizeKey()) || '10', 10);
    return [10, 12, 14].includes(v) ? v : 10;
  } catch { return 10; }
}

function saveRoomType() {
  try { localStorage.setItem(_typeKey(), _activeRoomType); } catch {}
}

function saveRoomName(n, name) {
  try {
    const trimmed = name ? name.trim().slice(0, 18) : '';
    if (!trimmed) localStorage.removeItem(_nameKey(n));
    else localStorage.setItem(_nameKey(n), trimmed);
  } catch {}
}

function loadRoomName(n) {
  try { return localStorage.getItem(_nameKey(n)) || null; } catch { return null; }
}

function loadRoomType() {
  const roomDefaults = { 1: 'bedroom', 2: 'living', 3: 'bathroom' };
  try {
    const v = localStorage.getItem(_typeKey());
    return (v && Object.prototype.hasOwnProperty.call(ROOM_TYPES, v)) ? v : (roomDefaults[_activeRoom] || 'bedroom');
  } catch { return roomDefaults[_activeRoom] || 'bedroom'; }
}

function saveWallItems() {
  const data = Object.values(wallPlaced).map(({ def, wx, colorHex }) => ({
    id: def.id, wx, colorHex: colorHex ?? null,
  }));
  try { localStorage.setItem(_wallKey(), JSON.stringify(data)); } catch {}
}

function loadWallItems() {
  try {
    const raw = localStorage.getItem(_wallKey());
    if (!raw) return;
    const data = JSON.parse(raw);
    for (const { id, wx, colorHex } of data) {
      const def = CATALOG.find(c => c.id === id && c.wallMounted);
      if (def) placeOnWall(def, wx, colorHex ?? def.colors[0]?.hex);
    }
  } catch {}
}
