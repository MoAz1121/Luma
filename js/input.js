'use strict';
const InputState = { mode: 'idle', selDef: null, rot: 0, colorHex: null };
const DRAG_PX = 16;

let _ptStart = null, _dragging = false;
let _movingId = null, _origAI = 0, _origAJ = 0, _origRot = 0;
let _currentSelPlaced = null;
let _catHit = false;
let _personHit = false;
const _undoStack = [];

// Multi-pointer tracking (pinch zoom)
const _ptrs = new Map();
let _lastPinchDist = null;

const _rc = new THREE.Raycaster();
const _mv = new THREE.Vector2();

function _ptr(e) {
  const r = renderer.domElement.getBoundingClientRect();
  return {
    x:  ((e.clientX - r.left) / r.width)  * 2 - 1,
    y: -((e.clientY - r.top)  / r.height) * 2 + 1,
  };
}
function _hitFloor(p) {
  _mv.set(p.x, p.y); _rc.setFromCamera(_mv, camera);
  const h = _rc.intersectObject(rayPlane);
  return h.length ? h[0].point : null;
}
function _hitWall(p) {
  if (!wallHitPlane) return null;
  _mv.set(p.x, p.y); _rc.setFromCamera(_mv, camera);
  const h = _rc.intersectObject(wallHitPlane);
  return h.length ? h[0].point : null;
}
let _hitCache = null;
function _invalidateHitCache() { _hitCache = null; }
function _hitPlaced(p) {
  _mv.set(p.x, p.y); _rc.setFromCamera(_mv, camera);
  if (!_hitCache) {
    _hitCache = [];
    scene.traverse(o => { if (o.isMesh && o.userData.pid) _hitCache.push(o); });
  }
  const h = _rc.intersectObjects(_hitCache);
  return h.length ? h[0].object.userData.pid : null;
}
function _hitCat(p) {
  if (typeof Cat === 'undefined' || !Cat.group || !Cat.enabled) return false;
  _mv.set(p.x, p.y); _rc.setFromCamera(_mv, camera);
  return _rc.intersectObject(Cat.group, true).length > 0;
}
function _hitPerson(p) {
  if (typeof Person === 'undefined' || !Person.group || !Person.enabled) return false;
  _mv.set(p.x, p.y); _rc.setFromCamera(_mv, camera);
  return _rc.intersectObject(Person.group, true).length > 0;
}
function _updatePreview(pt) {
  if (InputState.mode !== 'placing' || !InputState.selDef || !pt) return;
  if (InputState.selDef.wallMounted) return;
  const { ai, aj } = anchorFor(pt.x, pt.z, InputState.selDef, InputState.rot);
  showPreview(InputState.selDef, ai, aj, InputState.rot);
}

function pushUndo(fn) { _undoStack.push(fn); if (_undoStack.length > 40) _undoStack.shift(); }
function doUndo() { const fn = _undoStack.pop(); if (fn) fn(); }

function rotateSelection() {
  if (InputState.mode === 'placing' && InputState.selDef) {
    InputState.rot = (InputState.rot + 1) % 4;
    clearPreview();
    playRotate();
    setHint(`${InputState.selDef.label} — ${InputState.rot * 90}° — tik op kamer`);
  } else if (_currentSelPlaced && placed[_currentSelPlaced]) {
    const item = placed[_currentSelPlaced];
    const prev = item.rot, newRot = (prev + 1) % 4;
    lift(_currentSelPlaced);
    const ok = drop(_currentSelPlaced, item.ai, item.aj, newRot);
    if (!ok) { restore(_currentSelPlaced, item.ai, item.aj, prev); playError(); return; }
    showSelectionHighlight(_currentSelPlaced);
    pushUndo(() => { lift(_currentSelPlaced); drop(_currentSelPlaced, item.ai, item.aj, prev); save(); });
    save(); playRotate();
  }
}

function initInput() {
  const canvas = renderer.domElement;

  // Keyboard
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); doUndo(); }
    if (e.key === 'r' || e.key === 'R') rotateSelection();
    if (e.key === 'Escape') {
      if (InputState.mode === 'placing') onCatalogSelect(InputState.selDef, null);
    }
  });

  // Scroll wheel zoom
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    zoomCamera(e.deltaY > 0 ? 0.12 : -0.12);
  }, { passive: false });

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    _ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (_ptrs.size > 1) { _ptStart = null; return; } // entering pinch — cancel single-touch logic

    _ptStart = { sx: e.clientX, sy: e.clientY };
    _dragging = false; _movingId = null; _catHit = false; _personHit = false;

    const p = _ptr(e);
    if (InputState.mode === 'placing') _updatePreview(_hitFloor(p));

    if (InputState.mode === 'idle') {
      const pid = _hitPlaced(p);
      if (pid) { _movingId = pid; _origAI = placed[pid].ai; _origAJ = placed[pid].aj; _origRot = placed[pid].rot; }
      else if (_hitPerson(p)) _personHit = true;
      else _catHit = _hitCat(p);
    }
  }, { passive: false });

  canvas.addEventListener('pointermove', e => {
    e.preventDefault();
    _ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Pinch zoom (2 fingers)
    if (_ptrs.size === 2) {
      const [p1, p2] = [..._ptrs.values()];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (_lastPinchDist !== null) zoomCamera((_lastPinchDist - dist) * 0.035);
      _lastPinchDist = dist;
      return;
    }
    _lastPinchDist = null;

    // Preview follows mouse hover — no button press required
    if (InputState.mode === 'placing') { _updatePreview(_hitFloor(_ptr(e))); }

    if (!_ptStart || _ptrs.size > 1) return;

    const dx = e.clientX - _ptStart.sx, dy = e.clientY - _ptStart.sy;

    if (!_dragging && Math.sqrt(dx*dx + dy*dy) > DRAG_PX) {
      _dragging = true;
      if (InputState.mode === 'idle') {
        if (_movingId) {
          InputState.mode = 'moving';
          lift(_movingId);
          clearSelectionHighlight();
          _currentSelPlaced = null; setSelPlaced(null); clearCards(); showRotBtn(false); hideColorRow();
          setHint('Sleep naar nieuwe positie — loslaten om te plaatsen');
        }
        // else: camera pan
      }
    }

    const p = _ptr(e);

    if (InputState.mode === 'moving' && _movingId && _dragging) {
      const pt = _hitFloor(p); if (!pt) return;
      const def = placed[_movingId].def, rot = placed[_movingId].rot;
      const { ai, aj } = anchorFor(pt.x, pt.z, def, rot);
      const c = centerOf(ai, aj, def, rot);
      dragTo(_movingId, c.x, c.z, rot);
      showDragOverlay(c.x, c.z, def, rot, canPlace(def, ai, aj, rot));
      return;
    }

    // Idle drag on empty floor → pan camera
    if (InputState.mode === 'idle' && _dragging && !_movingId) {
      panCamera(dx, dy);
      _ptStart = { sx: e.clientX, sy: e.clientY };
    }
  }, { passive: false });

  canvas.addEventListener('pointerup', e => {
    e.preventDefault();
    _ptrs.delete(e.pointerId);
    _lastPinchDist = null;

    // Still fingers on screen → wait for all up
    if (_ptrs.size > 0) { _ptStart = null; _dragging = false; return; }

    const p = _ptr(e);

    if (InputState.mode === 'moving' && _movingId) {
      clearDragOverlay();
      const pt = _hitFloor(p);
      const def = placed[_movingId].def, rot = placed[_movingId].rot;
      const id = _movingId;
      const oai = _origAI, oaj = _origAJ, orot = _origRot;
      const fromX = placed[id].group.position.x, fromZ = placed[id].group.position.z;
      let ok = false;
      if (pt) { const { ai, aj } = anchorFor(pt.x, pt.z, def, rot); ok = drop(id, ai, aj, rot); }
      if (!ok) {
        restore(id, oai, oaj, orot);
        snapBack(id, fromX, fromZ);
        playError();
      } else {
        pushUndo(() => { lift(id); restore(id, oai, oaj, orot); save(); });
        save(); playPlace();
      }
      InputState.mode = 'idle'; _movingId = null;
      setHint('Selecteer een meubel hieronder ↓');

    } else if (InputState.mode === 'placing') {
      if (InputState.selDef?.wallMounted) {
        const wpt = _hitWall(p);
        if (wpt) {
          const wid = placeOnWall(InputState.selDef, wpt.x, InputState.colorHex);
          if (wid) {
            pushUndo(() => { removeWallItem(wid); saveWallItems(); });
            saveWallItems(); playPlace();
            setHint(`✓ ${InputState.selDef.label} gehangen`);
          } else {
            playError();
            setHint(Object.keys(wallPlaced).length >= 3
              ? 'Maximum 3 muurdecoraties bereikt'
              : 'Plek al bezet op de muur');
          }
        } else {
          setHint('Tik op de muur om te hangen ↑');
        }
      } else {
        const pt = _hitFloor(p);
        if (pt) {
          const { ai, aj } = anchorFor(pt.x, pt.z, InputState.selDef, InputState.rot);
          const id = place(InputState.selDef, ai, aj, InputState.rot, InputState.colorHex);
          if (id) {
            pushUndo(() => { remove(id); save(); });
            save(); playPlace();
            setHint(`✓ ${InputState.selDef.label} geplaatst`);
          } else {
            playError(); setHint('Bezet — kies een andere plek');
          }
        }
      }

    } else if (InputState.mode === 'idle' && !_dragging) {
      if (_personHit && !_movingId) {
        Person.greet(); _personHit = false;
      } else if (_catHit && !_movingId) {
        Cat.pet(); _catHit = false;
      } else if (_movingId) {
        const reTap = (_currentSelPlaced === _movingId);
        _currentSelPlaced = _movingId;
        showSelectionHighlight(_movingId);
        setSelPlaced(_movingId); showRotBtn(true);
        showColorRow(placed[_movingId].def, placed[_movingId].colorHex);
        playSelect();
        setHint('Verwijder, roteer of herkleur het geselecteerde meubel');
        showCaption(placed[_movingId].def.id);
        if (reTap) interactPlaced(_movingId);   // tweede tik = bedienen
      } else {
        _currentSelPlaced = null;
        clearSelectionHighlight();
        setSelPlaced(null); hideColorRow(); hideCaption();
        setHint('Selecteer een meubel hieronder ↓');
      }
      _movingId = null;
    }

    _ptStart = null; _dragging = false;
  }, { passive: false });

  canvas.addEventListener('pointercancel', e => {
    _ptrs.delete(e.pointerId);
    _lastPinchDist = null;
    _ptStart = null; _dragging = false;
  }, { passive: false });
}

// Second tap on a selected interactive item operates it (e.g. lamp on/off)
function interactPlaced(id) {
  const item = placed[id];
  if (!item || !item.def.interactive) return;
  if (item.def.interactive === 'lamp') {
    if (item.on === undefined) item.on = true;
    item.on = !item.on;
    item.group.traverse(o => { if (o.userData && o.userData.glow) o.visible = item.on; });
    setHint(item.on ? '💡 Lamp aan' : '🌙 Lamp uit');
  }
}

function onCatalogSelect(def, card) {
  if (InputState.mode === 'moving') return;
  clearDragOverlay(); clearSelectionHighlight();
  _currentSelPlaced = null; setSelPlaced(null); hideCaption();

  if (def && InputState.selDef?.id === def.id) {
    InputState.selDef = null; InputState.mode = 'idle'; InputState.rot = 0;
    clearPreview(); clearCards(); showRotBtn(false); hideColorRow();
    setHint('Selecteer een meubel hieronder ↓');
  } else if (def) {
    InputState.selDef = def; InputState.mode = 'placing';
    InputState.rot = 0; InputState.colorHex = def.colors[0]?.hex;
    clearPreview(); clearCards(); highlightCard(def.id);
    showRotBtn(!def.wallMounted); showColorRow(def, def.colors[0]?.hex);
    setHint(def.wallMounted
      ? `${def.label} — tik op de muur om te hangen ↑`
      : `${def.label} (${def.w}×${def.d}) — tik op kamer`);
  }
}
