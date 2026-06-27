'use strict';
// A little cat that lives in the room: wanders the floor, sits, and can be petted.
const Cat = (function () {
  let group = null, shadow = null, state = 'idle', tu = 0, target = null, bob = 0, enabled = true;
  const SPEED = 1.05;
  const hearts = [];
  let _heartTex = null;
  const REACTIONS = ['😺 Miauw!', '😸 Prrr...', '😻 *spint zacht*', '🐟 Mauw?', '😺 *kopjes geven*'];

  function build(col = 0x9a9690) {
    const dark = 0x2a2a2a;
    return _buildFurniture([
      _sg(.20, col,      0,   .20,  0),     // body
      _sg(.14, col,      0,   .34,  .15),   // head
      _cg(0, .055, .10,  col, -.07, .47, .15, 6),  // ear L
      _cg(0, .055, .10,  col,  .07, .47, .15, 6),  // ear R
      _sg(.05,  col,     0,   .16, -.22),   // tail base
      _sg(.045, col,     .04, .22, -.27),   // tail tip
      _sg(.03,  dark,   -.05, .35,  .27),   // eye L
      _sg(.03,  dark,    .05, .35,  .27),   // eye R
      _sg(.022, 0xe79aa6, 0,  .31,  .295),  // nose
    ]);
  }

  function init() {
    if (group) return;
    group = build();
    group.position.set(0, 0, 0);
    group.visible = enabled;
    scene.add(group);
    shadow = _contactShadow(.8);
    shadow.visible = enabled;
    scene.add(shadow);
    pickTarget();
  }

  function bound() { return Math.max(1, GS / 2 - 1); }
  function pickTarget() {
    const b = bound();
    // ~40% of the time the cat drifts toward the resident — they're buddies
    if (typeof Person !== 'undefined' && Person.group && Person.enabled && Math.random() < 0.4) {
      const p = Person.group.position;
      target = new THREE.Vector3(
        Math.max(-b, Math.min(b, p.x + (Math.random()-.5) * 0.9)), 0,
        Math.max(-b, Math.min(b, p.z + (Math.random()-.5) * 0.9)));
    } else {
      target = new THREE.Vector3((Math.random()*2-1)*b, 0, (Math.random()*2-1)*b);
    }
    state = 'walk';
  }

  function setEnabled(b) { enabled = b; if (group) group.visible = b; if (shadow) shadow.visible = b; }

  function tick(dt) {
    if (!group || !enabled) return;
    tu += dt;
    if (shadow) shadow.position.set(group.position.x, .012, group.position.z);
    if (state === 'walk' && target) {
      const dx = target.x - group.position.x, dz = target.z - group.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < .06) { state = 'idle'; tu = 0; group.position.y = 0; }
      else {
        const step = Math.min(dist, SPEED * dt);
        group.position.x += dx / dist * step;
        group.position.z += dz / dist * step;
        group.rotation.y = Math.atan2(dx, dz);   // head (+z) faces travel dir
        bob += dt * 10;
        group.position.y = Math.abs(Math.sin(bob)) * .04;
      }
    } else if (state === 'idle') {
      group.position.y = 0;
      const near = (typeof Person !== 'undefined' && Person.group && Person.enabled &&
        group.position.distanceTo(Person.group.position) < 1.4);
      if (tu > (near ? 4 + Math.random() * 4 : 1.6 + Math.random() * 2.5)) pickTarget();
    }
    tickHearts(dt);
  }

  function pet() {
    if (!group) return;
    state = 'idle'; tu = 0;
    group.position.y = .12;               // happy little hop
    spawnHearts();
    if (typeof setHint === 'function') setHint(REACTIONS[Math.floor(Math.random() * REACTIONS.length)]);
    if (typeof playSelect === 'function') playSelect();
  }

  function heartTex() {
    if (!_heartTex) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d');
      x.font = '52px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('❤', 32, 36);
      _heartTex = new THREE.CanvasTexture(c);
    }
    return _heartTex;
  }
  function spawnHearts() {
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: heartTex(), transparent: true, depthWrite: false }));
      s.scale.setScalar(.18);
      s.position.set(group.position.x + (Math.random()-.5)*.2, .55,
                     group.position.z + (Math.random()-.5)*.2);
      s.userData = { vy: .55 + Math.random()*.4, life: 0, max: .9 + Math.random()*.4 };
      scene.add(s); hearts.push(s);
    }
  }
  function tickHearts(dt) {
    for (let i = hearts.length - 1; i >= 0; i--) {
      const h = hearts[i]; h.userData.life += dt;
      h.position.y += h.userData.vy * dt;
      const t = h.userData.life / h.userData.max;
      h.material.opacity = Math.max(0, 1 - t);
      h.scale.setScalar(.18 * (1 + t * .5));
      if (t >= 1) { scene.remove(h); h.material.dispose(); hearts.splice(i, 1); }
    }
  }

  return { init, tick, pet, setEnabled, get group() { return group; }, get enabled() { return enabled; } };
})();
