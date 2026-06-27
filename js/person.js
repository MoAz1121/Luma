'use strict';
// The resident: a 2D billboard sprite of the character (assets/resident_sprite.png)
// that always faces the camera, driven by simple AI — wanders, walks to your
// furniture and uses it (sit / sleep / read / water...), and waves when clicked.
const Person = (function () {
  // ── JOUW INPUT — pas vrij aan ───────────────────────────────────────────
  const CLICK_BUBBLES = ['💛', '😊', '🥰', '😚', '💭'];          // wolkje als ze aangeklikt wordt
  const CLICK_HINTS   = ['🙋 Hoi!', '🥰 Hey jij', '😚 Mwah', '💛 Hoi liefje', '😊 Hihi'];
  // ────────────────────────────────────────────────────────────────────────

  let group = null, sprite = null, mat = null, bubble = null, shadow = null, ready = false, enabled = true;
  let state = 'idle', tu = 0, useT = 0, phase = 0, walking = false;
  let target = null, useDef = null, useCenter = null, poseState = 'stand';

  const SPEED = 0.9, H = 1.7;     // world height of the sprite
  let aspect = 0.36;
  const bubTex = {};

  const USABLE = {
    bed:         { emoji: '💤', pose: 'sleep' },
    sofa:        { emoji: '😌', pose: 'sit'   },
    fauteuil:    { emoji: '😌', pose: 'sit'   },
    diningchair: { emoji: '😋', pose: 'sit'   },
    desk:        { emoji: '✏️', pose: 'sit'   },
    diningtable: { emoji: '🍽️', pose: 'stand' },
    ctable:      { emoji: '☕', pose: 'stand' },
    bookcase:    { emoji: '📖', pose: 'stand' },
    plant:       { emoji: '🪴', pose: 'stand' },
    tvstand:     { emoji: '📺', pose: 'stand' },
  };

  function bubbleTexture(emoji) {
    if (!bubTex[emoji]) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d');
      x.beginPath(); x.arc(32, 28, 26, 0, Math.PI * 2);
      x.fillStyle = 'rgba(255,255,255,.92)'; x.fill();
      x.font = '30px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(emoji, 32, 30);
      bubTex[emoji] = new THREE.CanvasTexture(c);
    }
    return bubTex[emoji];
  }

  function resize() { if (sprite) { sprite.scale.set(H * aspect, H, 1); sprite.position.y = H / 2; } }

  function init() {
    if (group) return;
    group = new THREE.Group(); group.position.set(1, 0, 1); group.visible = enabled; scene.add(group);
    shadow = _contactShadow(.95); shadow.visible = enabled; scene.add(shadow);

    const tex = new THREE.TextureLoader().load('assets/resident_sprite.png', (t) => {
      aspect = t.image.width / t.image.height; resize(); ready = true;
    });
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = THREE.RepeatWrapping;   // allows left/right flip via repeat.x = -1
    mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    sprite = new THREE.Sprite(mat);
    group.add(sprite);

    bubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    bubble.scale.setScalar(.42); bubble.position.set(0, H + .2, 0); bubble.visible = false;
    group.add(bubble);

    resize();
    pickNext();
  }

  function bound() { return Math.max(1, GS / 2 - 1); }

  function timePhase() {
    const h = new Date().getHours();
    if (h < 5 || h >= 23) return 'night';
    if (h < 12) return 'morning';
    if (h < 18) return 'afternoon';
    return 'evening';
  }
  function findUsable(ids) {
    if (typeof placed !== 'object') return null;
    const list = Object.values(placed).filter(it => it && ids.indexOf(it.def.id) !== -1);
    return list.length ? list[Math.floor(Math.random() * list.length)] : null;
  }
  function gotoItem(it, def) {
    const ip = it.group.position;
    useCenter = new THREE.Vector3(ip.x, 0, ip.z);
    const cx = -ip.x, cz = -ip.z, mm = Math.hypot(cx, cz) || 1;
    target = new THREE.Vector3(ip.x + cx / mm * 0.55, 0, ip.z + cz / mm * 0.55);
    useDef = def; state = 'walk'; poseState = 'stand';
  }
  function gotoWindow() {
    const Hh = GS / 2, h = new Date().getHours();
    useCenter = new THREE.Vector3(2, 0, -Hh);
    target = new THREE.Vector3(2, 0, -Hh + 1.3);
    const emoji = (h < 5 || h >= 21) ? '🌙' : (h < 11) ? '☀️' : (h < 18) ? '🌤️' : '🌆';
    useDef = { emoji, pose: 'gaze' }; state = 'walk'; poseState = 'stand';
  }
  function wander() {
    const b = bound();
    target = new THREE.Vector3((Math.random()*2-1)*b, 0, (Math.random()*2-1)*b);
    useDef = null; useCenter = null; state = 'walk'; poseState = 'stand';
  }

  function pickNext() {
    useDef = null; useCenter = null;
    const ph = timePhase(), r = Math.random();
    if (ph === 'night') {
      const bed = findUsable(['bed']);
      if (bed && r < 0.85) { gotoItem(bed, USABLE.bed); return; }
    } else if (ph === 'evening') {
      const sit = findUsable(['sofa', 'fauteuil']);
      if (sit && r < 0.6) { gotoItem(sit, USABLE[sit.def.id]); return; }
      if (r < 0.75) { gotoWindow(); return; }
    } else if (ph === 'morning') {
      if (r < 0.4) { gotoWindow(); return; }
      const cof = findUsable(['ctable', 'diningtable']);
      if (cof && r < 0.7) { gotoItem(cof, USABLE[cof.def.id]); return; }
    } else { // afternoon
      if (r < 0.18) { gotoWindow(); return; }
    }
    const any = findUsable(Object.keys(USABLE));
    if (any && Math.random() < 0.6) { gotoItem(any, USABLE[any.def.id]); return; }
    wander();
  }

  function startUse() {
    state = 'use'; useT = 0; tu = 0;
    poseState = useDef.pose;
    if (poseState === 'sleep' && useCenter) { group.position.x = useCenter.x; group.position.z = useCenter.z; }
    bubble.material.map = bubbleTexture(useDef.emoji);
    bubble.material.needsUpdate = true; bubble.visible = true;
  }
  function endUse() { bubble.visible = false; pickNext(); }

  function animate(dt) {
    const k = Math.min(1, dt * 8);
    // lying down (sleep) tilts the billboard flat; otherwise upright
    const rotT = poseState === 'sleep' ? -Math.PI / 2 : 0;
    if (mat) mat.rotation += (rotT - mat.rotation) * k;
    if (walking) {
      group.position.y = Math.abs(Math.sin(phase)) * .04;   // gentle step bob
    } else {
      let yT = 0;
      if (poseState === 'sit') yT = -.20;
      else if (poseState === 'sleep') yT = .30;
      group.position.y += (yT - group.position.y) * k;
    }
  }

  function setEnabled(b) { enabled = b; if (group) group.visible = b; if (shadow) shadow.visible = b; }

  function tick(dt) {
    if (!group || !enabled) return;
    tu += dt; walking = false;
    if (shadow) shadow.position.set(group.position.x, .012, group.position.z);
    if (state === 'walk' && target) {
      const dx = target.x - group.position.x, dz = target.z - group.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < .07) {
        if (useDef) startUse();
        else { state = 'idle'; tu = 0; }
      } else {
        walking = true; phase += dt * 8;
        const step = Math.min(dist, SPEED * dt);
        group.position.x += dx / dist * step;
        group.position.z += dz / dist * step;
        // face travel by flipping the sprite left/right
        if (Math.abs(dx) > .001 && mat && mat.map) mat.map.repeat.x = dx >= 0 ? 1 : -1, mat.map.offset.x = dx >= 0 ? 0 : 1;
      }
    } else if (state === 'use') {
      useT += dt;
      if (useT > 4.5 + Math.random() * 4) endUse();
    } else if (state === 'idle') {
      if (tu > 1.2 + Math.random() * 2) pickNext();
    }
    animate(dt);
  }

  function greet() {
    if (!group) return;
    bubble.material.map = bubbleTexture(CLICK_BUBBLES[Math.floor(Math.random() * CLICK_BUBBLES.length)]);
    bubble.material.needsUpdate = true; bubble.visible = true;
    state = 'idle'; tu = 0; poseState = 'stand';
    if (typeof setHint === 'function') setHint(CLICK_HINTS[Math.floor(Math.random() * CLICK_HINTS.length)]);
    if (typeof playSelect === 'function') playSelect();
    setTimeout(() => { if (state === 'idle') bubble.visible = false; }, 2200);
  }

  return { init, tick, greet, setEnabled, get group() { return group; }, get ready() { return ready; }, get enabled() { return enabled; } };
})();
