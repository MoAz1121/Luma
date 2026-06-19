'use strict';
let _activeRoom = 1;
let _activeRoomType = 'bedroom';
let _hintEl, _delBtn, _rotBtn, _dupBtn, _undoBtn, _colorRow, _roomBtn, _roomPanel, _sizeRow;
let _wallSwatchRow = null, _floorSwatchRow = null;
let _typeRow = null;
const _previews = {};

// ── Offscreen previews ─────────────────────────────────────────────────────
// MUST be called BEFORE initScene() — browsers limit concurrent WebGL contexts.
// Creating a second renderer while the main one is alive can cause context loss.
function renderPreviews() {
  try {
    const SIZE = 96;
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = SIZE;
    const ren = new THREE.WebGLRenderer({ canvas: cvs, antialias: true, alpha: true, preserveDrawingBuffer: true });
    ren.setSize(SIZE, SIZE);
    ren.setClearColor(0x000000, 0);
    const sc = new THREE.Scene();
    sc.add(new THREE.AmbientLight(0xfff8f0, 0.9));
    const sun = new THREE.DirectionalLight(0xfff0dc, 0.75);
    sun.position.set(4, 6, 3); sc.add(sun);
    const fill = new THREE.DirectionalLight(0xdcf0ff, 0.22);
    fill.position.set(-3, 4, -3); sc.add(fill);
    const b3 = new THREE.Box3(), bv = new THREE.Vector3(), bc = new THREE.Vector3();
    for (const def of CATALOG) {
      const group = def.build(def.colors[0].hex);
      sc.add(group);
      b3.setFromObject(group); b3.getCenter(bc); b3.getSize(bv);
      const half = Math.max(bv.x, bv.z, bv.y * .55) * .74 + .28;
      const cam = new THREE.OrthographicCamera(-half, half, half * .88, -half * .88, .01, 60);
      cam.position.set(bc.x + 4, bc.y + 4, bc.z + 4);
      cam.lookAt(bc);
      ren.render(sc, cam);
      _previews[def.id] = cvs.toDataURL('image/png');
      sc.remove(group);
    }
    ren.dispose();
  } catch (e) {
    console.warn('Preview rendering failed, using color swatches as fallback.', e);
  }
}

// ── Color row ──────────────────────────────────────────────────────────────
function showColorRow(def, currentHex) {
  _colorRow.innerHTML = '<span style="font-size:11px;color:#a08878;margin-right:2px">Kleur:</span>';
  def.colors.forEach(col => {
    const dot = document.createElement('div');
    const active = currentHex != null ? col.hex === currentHex : false;
    dot.className = 'crdot' + (active ? ' active' : '');
    dot.style.background = '#' + col.hex.toString(16).padStart(6, '0');
    dot.title = col.label;
    dot.addEventListener('pointerdown', e => {
      e.stopPropagation();
      if (InputState.mode === 'placing') {
        InputState.colorHex = col.hex;
      } else if (_currentSelPlaced && placed[_currentSelPlaced]) {
        const prev = placed[_currentSelPlaced].colorHex;
        const id   = _currentSelPlaced;
        recolor(id, col.hex);
        pushUndo(() => { recolor(id, prev); save(); });
        save();
      }
      _colorRow.querySelectorAll('.crdot').forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
    });
    _colorRow.appendChild(dot);
  });
  _colorRow.style.display = 'flex';
}
function hideColorRow() { _colorRow.style.display = 'none'; }

// ── Room panel ─────────────────────────────────────────────────────────────
const WALL_COLORS = [
  { label: 'Roze',     hex: 0xe9b9b0 }, { label: 'Salie',     hex: 0x9cbfa4 },
  { label: 'Blauw',    hex: 0x9fc0d6 }, { label: 'Zand',      hex: 0xdcc39a },
  { label: 'Lavendel', hex: 0xc3b0d8 }, { label: 'Wit',       hex: 0xf2ece2 },
];
const FLOOR_COLORS = [
  { label: 'Naturel',  hex: 0xdcc3a0 }, { label: 'Eiken',     hex: 0xc9a877 },
  { label: 'Grijs',    hex: 0xb0a89e }, { label: 'Leisteen',  hex: 0x8f9694 },
  { label: 'Wit',      hex: 0xefe9df }, { label: 'Walnoot',   hex: 0x8c6840 },
];

let _curWall = 0xe3cdd6, _curFloor = 0xc9a877;

function _buildRoomPanel() {
  _roomPanel = document.getElementById('roompanel');
  _roomPanel.addEventListener('pointerdown', e => e.stopPropagation());

  function addSection(title, colors, onPick, getCurrent) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:11px;color:#8a7060;min-width:36px;';
    lbl.textContent = title;
    row.appendChild(lbl);
    colors.forEach(c => {
      const sw = document.createElement('div');
      sw.className = 'rpsw';
      sw.style.background = '#' + c.hex.toString(16).padStart(6, '0');
      sw.title = c.label;
      sw.dataset.hex = c.hex;
      if (c.hex === getCurrent()) sw.classList.add('active');
      sw.addEventListener('pointerdown', e => {
        e.stopPropagation();
        onPick(c.hex);
        row.querySelectorAll('.rpsw').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
      });
      row.appendChild(sw);
    });
    _roomPanel.appendChild(row);
    return row;
  }

  _wallSwatchRow  = addSection('Muur', WALL_COLORS,
    hex => { setWallColor(hex); _curWall = hex; saveRoom(); },
    () => _curWall
  );
  _floorSwatchRow = addSection('Vloer', FLOOR_COLORS,
    hex => { setFloorColor(hex); _curFloor = hex; saveRoom(); },
    () => _curFloor
  );

  // Room size
  const sizeRow = document.createElement('div');
  sizeRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:2px;';
  const sizeLbl = document.createElement('span');
  sizeLbl.style.cssText = 'font-size:11px;color:#8a7060;min-width:36px;';
  sizeLbl.textContent = 'Maat';
  sizeRow.appendChild(sizeLbl);
  for (const s of [10, 12, 14]) {
    const btn = document.createElement('button');
    btn.dataset.size = s;
    btn.textContent = `${s}×${s}`;
    btn.style.cssText = 'font-size:11px;padding:6px 10px;border-radius:8px;border:1.5px solid #dcc8b8;background:#fdf8f5;color:#7a6858;cursor:pointer;font-weight:600;';
    if (s === GS) btn.style.borderColor = '#c4956a';
    btn.addEventListener('pointerdown', e => {
      e.stopPropagation();
      if (s === GS) return;
      switchRoomSize(s);
      sizeRow.querySelectorAll('button').forEach(b => b.style.borderColor = '#dcc8b8');
      btn.style.borderColor = '#c4956a';
    });
    sizeRow.appendChild(btn);
  }
  _sizeRow = sizeRow;
  _roomPanel.appendChild(sizeRow);

  // Room type selector
  _typeRow = document.createElement('div');
  _typeRow.style.cssText = 'display:flex;align-items:center;gap:5px;flex-wrap:wrap;';
  const typeLbl = document.createElement('span');
  typeLbl.style.cssText = 'font-size:11px;color:#8a7060;min-width:36px;';
  typeLbl.textContent = 'Type';
  _typeRow.appendChild(typeLbl);
  for (const [key, val] of Object.entries(ROOM_TYPES)) {
    const btn = document.createElement('button');
    btn.dataset.roomtype = key;
    btn.textContent = val.label;
    btn.style.cssText = 'font-size:10px;padding:6px 10px;border-radius:8px;border:1.5px solid #dcc8b8;background:#fdf8f5;color:#7a6858;cursor:pointer;font-weight:600;touch-action:manipulation;';
    if (key === _activeRoomType) btn.style.borderColor = '#c4956a';
    btn.addEventListener('pointerdown', e => {
      e.stopPropagation();
      _activeRoomType = key;
      saveRoomType();
      renderInventory(_activeRoomType);
      _syncTypeButtons();
    });
    _typeRow.appendChild(btn);
  }
  _roomPanel.appendChild(_typeRow);

  // Gezelschap (kat / bewoner aan-uit)
  const compRow = document.createElement('div');
  compRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:2px;';
  const compLbl = document.createElement('span');
  compLbl.style.cssText = 'font-size:11px;color:#8a7060;min-width:36px;';
  compLbl.textContent = 'Leven';
  compRow.appendChild(compLbl);
  function compToggle(label, key, get, set) {
    const btn = document.createElement('button');
    const draw = () => {
      const on = get();
      btn.textContent = label + (on ? ' aan' : ' uit');
      btn.style.cssText = 'font-size:11px;padding:6px 10px;border-radius:8px;border:1.5px solid ' +
        (on ? '#9cc4a0' : '#dcc8b8') + ';background:' + (on ? '#eef6ef' : '#f5f0ea') +
        ';color:#7a6858;cursor:pointer;font-weight:600;touch-action:manipulation;';
    };
    draw();
    btn.addEventListener('pointerdown', e => {
      e.stopPropagation();
      const nv = !get(); set(nv);
      try { localStorage.setItem(key, nv ? '1' : '0'); } catch {}
      draw();
    });
    return btn;
  }
  compRow.appendChild(compToggle('🐱 Kat', 'luma_cat_on', () => Cat.enabled, b => Cat.setEnabled(b)));
  compRow.appendChild(compToggle('🧍 Bewoner', 'luma_person_on', () => Person.enabled, b => Person.setEnabled(b)));
  _roomPanel.appendChild(compRow);

  // Alles verwijderen
  const clearBtn = document.createElement('button');
  clearBtn.textContent = '🗑 Alles verwijderen';
  clearBtn.style.cssText = 'margin-top:4px;font-size:11px;padding:5px 10px;border-radius:10px;border:1.5px solid #e08888;background:#fff5f5;color:#c05050;cursor:pointer;font-weight:600;width:100%;';
  clearBtn.addEventListener('pointerdown', e => {
    e.stopPropagation();
    _roomPanel.style.display = 'none';
    clearAllFurniture();
  });
  _roomPanel.appendChild(clearBtn);
}

function toggleRoomPanel() {
  const vis = _roomPanel.style.display === 'flex';
  _roomPanel.style.display = vis ? 'none' : 'flex';
}

// ── Init ───────────────────────────────────────────────────────────────────
function initUI() {
  _hintEl   = document.getElementById('hint');
  _delBtn   = document.getElementById('del');
  _rotBtn   = document.getElementById('rot');
  _dupBtn   = document.getElementById('dup');
  _undoBtn  = document.getElementById('undo');
  _colorRow = document.getElementById('colorrow');
  _roomBtn  = document.getElementById('roomBtn');

  _delBtn.addEventListener('pointerdown',  e => { e.stopPropagation(); deleteSelected(); });
  _rotBtn.addEventListener('pointerdown',  e => { e.stopPropagation(); rotateSelection(); });
  _dupBtn.addEventListener('pointerdown',  e => { e.stopPropagation(); duplicateSelected(); });
  _undoBtn.addEventListener('pointerdown', e => { e.stopPropagation(); doUndo(); });
  _roomBtn.addEventListener('pointerdown', e => { e.stopPropagation(); toggleRoomPanel(); });

  // Tabs
  document.querySelectorAll('#tabs .tab').forEach(tab => {
    tab.addEventListener('pointerdown', e => {
      e.stopPropagation();
      const n = parseInt(tab.dataset.room);
      if (n === _activeRoom) { openRenameModal(n); return; }
      document.querySelectorAll('#tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      switchRoom(n);
    });
  });

  _updateAllTabLabels();

  // Close room panel when clicking outside
  document.addEventListener('pointerdown', () => {
    if (_roomPanel && _roomPanel.style.display === 'flex') _roomPanel.style.display = 'none';
  });

  _buildRoomPanel();

  renderInventory(_activeRoomType);
}

// ── Inventory rendering ────────────────────────────────────────────────────
function renderInventory(roomType) {
  const inv = document.getElementById('inv');
  inv.innerHTML = '';
  const visible = CATALOG.filter(def => def.roomTypes && def.roomTypes.includes(roomType));
  for (const def of visible) {
    const card = document.createElement('div');
    card.className = 'card'; card.dataset.id = def.id;
    const img = document.createElement('img');
    img.className = 'pimg'; img.src = _previews[def.id] || ''; img.alt = def.label;
    const lb = document.createElement('span');
    lb.className = 'lb'; lb.textContent = def.label;
    card.append(img, lb);
    card.addEventListener('pointerdown', e => {
      e.stopPropagation();
      card._tapX = e.clientX; card._tapY = e.clientY;
    });
    card.addEventListener('pointerup', e => {
      e.stopPropagation();
      if (card._tapX != null) {
        const dx = e.clientX - card._tapX, dy = e.clientY - card._tapY;
        if (Math.sqrt(dx * dx + dy * dy) < 12) {
          if (typeof onCatalogSelect === 'function') onCatalogSelect(def, card);
        }
        card._tapX = null;
      }
    });
    card.addEventListener('pointercancel', () => { card._tapX = null; });
    inv.appendChild(card);
  }
  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:16px 20px;font-size:12px;color:#b0a090;font-style:italic;white-space:nowrap;align-self:center;';
    empty.textContent = 'Nog geen items voor dit kamertype';
    inv.appendChild(empty);
  }
  // If currently placing an item no longer in inventory, cancel placing mode
  if (typeof InputState !== 'undefined' && InputState.mode === 'placing' && InputState.selDef) {
    if (!visible.find(d => d.id === InputState.selDef.id)) {
      if (typeof onCatalogSelect === 'function') onCatalogSelect(null, null);
    }
  }
}

// ── Greeting on open (time-of-day) ──────────────────────────────────────────
const GREET_NAME = 'mijn schatje';   // zet hier haar naam voor een persoonlijke begroeting, bv. 'lieverd'
function showGreeting() {
  const el = document.getElementById('greet');
  if (!el) return;
  const h = new Date().getHours();
  let main, emoji, subs;
  if      (h >= 5  && h < 12) { main='Goodmorning'; emoji='☀️'; subs=['Did you sleep well baby','Kom snel naar me toe','I missed you tonight']; }
  else if (h >= 12 && h < 18) { main='Hey there'; emoji='🐱'; subs=['Heb je al gegeten baby','Thinking about you','Hope your day is good']; }
  else if (h >= 18 && h < 23) { main='Goodevening'; emoji='🌙'; subs=['Hoe was je dag cutie','Wish you were here','Kom lekker bij me in bed baby']; }
  else                        { main='Slaaplekker';  emoji='💤'; subs=['Make sure you dream of me','Tot morgen baby 🌙','I love you so much']; }
  el.querySelector('.gmain').textContent = main + (GREET_NAME ? ', ' + GREET_NAME : '') + ' ' + emoji;
  el.querySelector('.gsub').textContent  = subs[Math.floor(Math.random() * subs.length)];
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => el.classList.remove('show'), 3400);
}

// ── Memory captions (sweet note when a special item is selected) ────────────
// Edit/extend freely — alleen items met een regel hier tonen een onderschrift.
const CAPTIONS = {
  bed:        'One day we will get to cuddle here',
  sofa:       'Cant wait to watch movies on this sofa with you',
  plant:      'I made sure they arent roses <3',
  photoframe: 'Look at how cute we are',
  lamp:       'You are the brightest light in my life',
};
let _capTimer = null;
function showCaption(id) {
  const el = document.getElementById('cap');
  if (!el) return;
  const txt = CAPTIONS[id];
  if (!txt) { el.classList.remove('show'); return; }
  el.textContent = '💬 ' + txt;
  el.classList.add('show');
  clearTimeout(_capTimer);
  _capTimer = setTimeout(() => el.classList.remove('show'), 4000);
}
function hideCaption() {
  const el = document.getElementById('cap');
  if (el) el.classList.remove('show');
}

// ── Helpers ────────────────────────────────────────────────────────────────
function setHint(text) { _hintEl.textContent = text; }
function highlightCard(id) { document.querySelectorAll('.card').forEach(c => c.classList.toggle('sel', c.dataset.id === id)); }
function clearCards() { document.querySelectorAll('.card').forEach(c => c.classList.remove('sel')); }
function setSelPlaced(id) {
  _delBtn.style.display = id ? 'block' : 'none';
  _dupBtn.style.display = id ? 'block' : 'none';
  if (!id) _rotBtn.style.display = 'none';
}
function showRotBtn(v) { _rotBtn.style.display = v ? 'block' : 'none'; }

function _syncTypeButtons() {
  if (!_typeRow) return;
  _typeRow.querySelectorAll('button').forEach(b =>
    b.style.borderColor = b.dataset.roomtype === _activeRoomType ? '#c4956a' : '#dcc8b8');
}

function _syncPanelSwatches() {
  if (_wallSwatchRow)  _wallSwatchRow.querySelectorAll('.rpsw').forEach(s =>
    s.classList.toggle('active', parseInt(s.dataset.hex) === _curWall));
  if (_floorSwatchRow) _floorSwatchRow.querySelectorAll('.rpsw').forEach(s =>
    s.classList.toggle('active', parseInt(s.dataset.hex) === _curFloor));
  if (_sizeRow) _sizeRow.querySelectorAll('button').forEach(b =>
    b.style.borderColor = parseInt(b.dataset.size) === GS ? '#c4956a' : '#dcc8b8');
}

function switchRoom(n) {
  if (n === _activeRoom) return;
  save();
  saveWallItems();
  _activeRoom = n;
  // Reset UI state
  InputState.mode = 'idle'; InputState.selDef = null; InputState.rot = 0;
  clearPreview(); clearDragOverlay(); clearSelectionHighlight();
  _currentSelPlaced = null; setSelPlaced(null); showRotBtn(false); hideColorRow();
  clearCards();
  _undoStack.length = 0;
  // Reset colors to defaults BEFORE rebuild so _buildRoom uses correct values
  _curWall = 0xfce6df; _curFloor = 0xefd9b8;
  clearAllPlaced();
  clearAllWallItems();
  _activeRoomType = loadRoomType();
  rebuildRoom(loadRoomSize(), _curWall, _curFloor);
  loadRoom();
  load();
  loadWallItems();
  _syncPanelSwatches();
  _syncTypeButtons();
  renderInventory(_activeRoomType);
  setHint('Selecteer een meubel hieronder ↓');
}

function switchRoomSize(newSize) {
  save();
  saveWallItems();
  clearAllPlaced();
  clearAllWallItems();
  rebuildRoom(newSize, _curWall, _curFloor);
  saveRoomSize(newSize);
  _undoStack.length = 0;
  _syncPanelSwatches();
  setHint('Selecteer een meubel hieronder ↓');
}

function clearAllFurniture() {
  if (!confirm('Alle meubels verwijderen?')) return;
  const snapshot = Object.values(placed).map(({ def, ai, aj, rot, colorHex }) => ({ def, ai, aj, rot, colorHex }));
  clearAllPlaced();
  pushUndo(() => {
    snapshot.forEach(({ def, ai, aj, rot, colorHex }) => place(def, ai, aj, rot, colorHex));
    save();
  });
  save();
  playRemove();
  _currentSelPlaced = null; setSelPlaced(null); showRotBtn(false); hideColorRow();
  setHint('Selecteer een meubel hieronder ↓');
}

function deleteSelected() {
  if (!_currentSelPlaced) return;
  const item = placed[_currentSelPlaced]; if (!item) return;
  const { def, ai, aj, rot, colorHex } = item, id = _currentSelPlaced;
  remove(id);
  pushUndo(() => { place(def, ai, aj, rot, colorHex, false); save(); });
  save(); playRemove();
  _currentSelPlaced = null; setSelPlaced(null); showRotBtn(false); hideColorRow();
  setHint('Selecteer een meubel hieronder ↓');
}

function _updateAllTabLabels() {
  document.querySelectorAll('#tabs .tab').forEach(tab => {
    const n = parseInt(tab.dataset.room);
    tab.textContent = loadRoomName(n) || `Kamer ${n}`;
  });
}

function openRenameModal(n) {
  const modal = document.getElementById('renameModal');
  const input = document.getElementById('renameInput');
  const title = document.getElementById('renameTitle');
  title.textContent = `Naam voor Kamer ${n}`;
  input.value = loadRoomName(n) || '';
  input.placeholder = `Kamer ${n}`;
  modal.style.display = 'flex';
  input.focus();
  input.select();

  function _confirm() {
    saveRoomName(n, input.value);
    _updateAllTabLabels();
    modal.style.display = 'none';
  }
  function _cancel() { modal.style.display = 'none'; }

  document.getElementById('renameConfirm').onclick = _confirm;
  document.getElementById('renameCancel').onclick  = _cancel;
  input.onkeydown = e => { if (e.key === 'Enter') _confirm(); if (e.key === 'Escape') _cancel(); };
  modal.onclick   = e => { if (e.target === modal) _cancel(); };
}

function duplicateSelected() {
  if (!_currentSelPlaced) return;
  const item = placed[_currentSelPlaced]; if (!item) return;
  const target = _nearestFree(item.def, item.ai, item.aj, item.rot);
  if (!target) { setHint('Geen plek vrij naast dit meubel'); return; }
  const id = place(item.def, target.ai, target.aj, item.rot, item.colorHex);
  if (id) {
    pushUndo(() => { remove(id); save(); });
    save(); playPlace();
    setHint(`✓ ${item.def.label} gedupliceerd`);
  }
}
