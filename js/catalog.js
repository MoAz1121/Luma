'use strict';

function _lighten(hex, f) {
  return (Math.min(255,((hex>>16)&0xff)+Math.round(255*f))<<16) |
         (Math.min(255,((hex>>8) &0xff)+Math.round(255*f))<<8)  |
          Math.min(255,(hex      &0xff)+Math.round(255*f));
}
function _darken(hex, f) {
  return (Math.max(0,((hex>>16)&0xff)-Math.round(255*f))<<16) |
         (Math.max(0,((hex>>8) &0xff)-Math.round(255*f))<<8)  |
          Math.max(0,(hex      &0xff)-Math.round(255*f));
}

// ── Shared outline material (1 instance for all furniture) ─────────────────
const _OL_MAT = new THREE.MeshBasicMaterial({ color: 0x180800, side: THREE.BackSide });

// ── Vertex color helper ────────────────────────────────────────────────────
function _paint(geo, hex) {
  const cnt = geo.attributes.position.count;
  const arr = new Float32Array(cnt * 3);
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8)  & 0xff) / 255;
  const b = (hex         & 0xff) / 255;
  for (let i = 0; i < cnt; i++) { arr[i*3]=r; arr[i*3+1]=g; arr[i*3+2]=b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// ── Positioned geometry builders ───────────────────────────────────────────
const _T = new THREE.Matrix4();
function _bg(w, h, d, hex, tx, ty, tz) {
  const g = new THREE.BoxGeometry(w, h, d);
  _paint(g, hex);
  g.applyMatrix4(_T.makeTranslation(tx, ty, tz));
  return g;
}
function _cg(rt, rb, h, hex, tx, ty, tz, seg = 8) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  _paint(g, hex);
  g.applyMatrix4(_T.makeTranslation(tx, ty, tz));
  return g;
}
function _sg(r, hex, tx, ty, tz) {
  const g = new THREE.SphereGeometry(r, 8, 6);
  _paint(g, hex);
  g.applyMatrix4(_T.makeTranslation(tx, ty, tz));
  return g;
}

// ── Merge array of geometries into one BufferGeometry, dispose sources ─────
function _merge(geos) {
  let vTotal = 0, iTotal = 0;
  for (const g of geos) {
    vTotal += g.attributes.position.count;
    if (g.index) iTotal += g.index.count;
  }
  const pos = new Float32Array(vTotal * 3);
  const nrm = new Float32Array(vTotal * 3);
  const col = new Float32Array(vTotal * 3);
  const idx = new Uint32Array(iTotal);
  let vOff = 0, iOff = 0;
  for (const g of geos) {
    const vc = g.attributes.position.count;
    pos.set(g.attributes.position.array, vOff * 3);
    if (g.attributes.normal) nrm.set(g.attributes.normal.array, vOff * 3);
    if (g.attributes.color)  col.set(g.attributes.color.array,  vOff * 3);
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) idx[iOff + i] = g.index.array[i] + vOff;
      iOff += g.index.count;
    }
    vOff += vc;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal',   new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color',    new THREE.BufferAttribute(col, 3));
  if (iTotal) out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// ── Build group: 1 toon mesh + 1 outline mesh = 2 draw calls total ─────────
function _buildFurniture(geos) {
  const geo  = _merge(geos);
  const grp  = new THREE.Group();
  grp.add(new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true })));
  const ol = new THREE.Mesh(geo, _OL_MAT);
  ol.scale.setScalar(1.055);
  ol.raycast = () => {};   // exclude from hit-testing
  grp.add(ol);
  return grp;
}

// ── Photo texture (shared, lazy-loaded, aspect-fit) ─────────────────────────
const _PHOTO_MAX = .56;
let _photoTex = null, _photoAspect = 0;
const _photoMeshes = [];
function _photoTexture() {
  if (!_photoTex) {
    _photoTex = new THREE.TextureLoader().load('assets/photo.jpg', (t) => {
      _photoAspect = t.image.width / t.image.height;
      _photoMeshes.forEach(_fitPhoto);
    });
    _photoTex.encoding = THREE.sRGBEncoding;
  }
  return _photoTex;
}
function _fitPhoto(m) {
  if (!_photoAspect) { m.scale.set(_PHOTO_MAX, _PHOTO_MAX, 1); return; }
  if (_photoAspect >= 1) m.scale.set(_PHOTO_MAX, _PHOTO_MAX / _photoAspect, 1);
  else                   m.scale.set(_PHOTO_MAX * _photoAspect, _PHOTO_MAX, 1);
}

// ── Soft radial glow texture (shared) — warm light pools ────────────────────
let _glowTex = null;
function _glowTexture() {
  if (!_glowTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0,  'rgba(255,255,255,1)');
    g.addColorStop(.5, 'rgba(255,255,255,.5)');
    g.addColorStop(1,  'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    _glowTex = new THREE.CanvasTexture(c);
  }
  return _glowTex;
}
// Soft round contact shadow that sits flat on the floor (for cat / resident)
function _contactShadow(size) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map: _glowTexture(), color: 0x2a1c10, transparent: true,
      opacity: .22, depthWrite: false,
    })
  );
  m.rotation.x = -Math.PI / 2;
  m.raycast = () => {};
  return m;
}
// Flat horizontal glow disc on the floor — warm light pool under a lamp etc.
function _floorGlow(size, color, opacity) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map: _glowTexture(), color, transparent: true, opacity,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = .015;
  m.raycast = () => {};
  return m;
}

// ── Room types ────────────────────────────────────────────────────────────
const ROOM_TYPES = {
  bedroom: { label: 'Slaapkamer', wall: 0xe3cdd6, floor: 0xc9a877 },
  living:  { label: 'Woonkamer',  wall: 0xdcc39a, floor: 0xc9a877 },
  kitchen: { label: 'Keuken',     wall: 0xf2ece2, floor: 0xdcc3a0 },
  bathroom:{ label: 'Badkamer',   wall: 0x9fc0d6, floor: 0xb0a89e },
};

// ── Starter layouts (only placed when room_v3_n key is absent) ───────────
const STARTER_LAYOUTS = {
  bedroom: [
    { id: 'bed',        ai: 1, aj: 1, rot: 0, colorHex: 0xe8c4c8 },  // blush
    { id: 'nightstand', ai: 4, aj: 1, rot: 0, colorHex: null     },
    { id: 'lamp',       ai: 6, aj: 1, rot: 0, colorHex: 0xf0b0b8 },  // roze
    { id: 'plant',      ai: 1, aj: 6, rot: 0, colorHex: null     },
  ],
  living: [
    { id: 'sofa',    ai: 1, aj: 2, rot: 0, colorHex: 0xb09fc0 },  // lavendel
    { id: 'ctable',  ai: 2, aj: 4, rot: 0, colorHex: null     },
    { id: 'tvstand', ai: 4, aj: 1, rot: 0, colorHex: null     },  // back wall, centered
    { id: 'plant',   ai: 7, aj: 1, rot: 0, colorHex: null     },
    { id: 'lamp',    ai: 7, aj: 3, rot: 0, colorHex: null     },
  ],
  kitchen: [
    { id: 'kcounter',    ai: 1, aj: 1, rot: 0, colorHex: null },
    { id: 'stove',       ai: 3, aj: 1, rot: 0, colorHex: null },  // tussen counter en koelkast
    { id: 'fridge',      ai: 4, aj: 1, rot: 0, colorHex: null },
    { id: 'diningtable', ai: 2, aj: 5, rot: 0, colorHex: null },
    { id: 'diningchair', ai: 1, aj: 5, rot: 0, colorHex: null },
    { id: 'diningchair', ai: 5, aj: 5, rot: 0, colorHex: null },
  ],
  bathroom: [
    { id: 'bsink',      ai: 1, aj: 1, rot: 0, colorHex: null     },
    { id: 'bathmirror', ai: 2, aj: 1, rot: 0, colorHex: null     },  // direct naast wastafel
    { id: 'towelrack',  ai: 5, aj: 1, rot: 0, colorHex: 0xf0c8c0 },  // roze
    { id: 'plant',      ai: 6, aj: 3, rot: 0, colorHex: 0x90c0a8 },  // mint, diep rechts
  ],
};

// ── Catalog ───────────────────────────────────────────────────────────────
const CATALOG = [
  {
    id: 'sofa', label: 'Bank', color: '#b09fc0', w: 2, d: 1, h: 0.85,
    roomTypes: ['living'],
    colors: [
      { label: 'Lavendel',  hex: 0xb09fc0 }, { label: 'Oker',      hex: 0xc8a060 },
      { label: 'Salie',     hex: 0x8aab90 }, { label: 'Terracotta', hex: 0xc07858 },
    ],
    build(h = 0xb09fc0) {
      const dk = _darken(h, .15), lt = _lighten(h, .18);
      return _buildFurniture([
        _bg(1.80, .36, .86, h,    0,    .18,    0),
        _bg(1.80, .54, .18, dk,   0,    .63, -.34),
        _bg(.78,  .18, .60, lt, -.44,   .54,  .04),
        _bg(.78,  .18, .60, lt,  .44,   .54,  .04),
        _bg(.12,  .46, .86, dk, -.90,   .23,    0),
        _bg(.12,  .46, .86, dk,  .90,   .23,    0),
      ]);
    }
  },
  {
    id: 'armchair', label: 'Fauteuil', color: '#c4956a', w: 1, d: 1, h: 0.85,
    roomTypes: ['living'],
    colors: [
      { label: 'Karamel', hex: 0xc4956a }, { label: 'Mosterd', hex: 0xc8a030 },
      { label: 'Blauw',   hex: 0x7090b8 }, { label: 'Crème',   hex: 0xe8d8b8 },
    ],
    build(h = 0xc4956a) {
      const dk = _darken(h, .15), lt = _lighten(h, .18);
      return _buildFurniture([
        _bg(.80, .35, .80, h,   0,  .175,    0),
        _bg(.80, .52, .18, dk,  0,   .61, -.31),
        _bg(.62, .18, .56, lt,  0,   .53,  .04),
        _bg(.09, .44, .80, dk, -.40, .22,    0),
        _bg(.09, .44, .80, dk,  .40, .22,    0),
      ]);
    }
  },
  {
    id: 'ctable', label: 'Salontafel', color: '#d4a870', w: 1, d: 1, h: 0.44,
    roomTypes: ['living'],
    colors: [
      { label: 'Eiken',  hex: 0xd4a870 }, { label: 'Walnoot', hex: 0x8c5c38 },
      { label: 'Wit',    hex: 0xf0ece4 }, { label: 'Zwart',   hex: 0x404040 },
    ],
    build(h = 0xd4a870) {
      const dk = _darken(h, .18);
      return _buildFurniture([
        _bg(.84, .06, .84, h,     0,  .38,    0),
        _bg(.06, .34, .06, dk, -.35, .17, -.35),
        _bg(.06, .34, .06, dk, -.35, .17,  .35),
        _bg(.06, .34, .06, dk,  .35, .17, -.35),
        _bg(.06, .34, .06, dk,  .35, .17,  .35),
      ]);
    }
  },
  {
    id: 'lamp', label: 'Vloerlamp', color: '#f5e080', w: 1, d: 1, h: 1.78,
    roomTypes: ['bedroom', 'living'], interactive: 'lamp',
    colors: [
      { label: 'Crème', hex: 0xf5e080 }, { label: 'Roze', hex: 0xf0b0b8 },
      { label: 'Mint',  hex: 0xa8d8b8 }, { label: 'Wit',  hex: 0xf8f8f0 },
    ],
    build(h = 0xf5e080) {
      const geo = _merge([
        _cg(.15,  .18,  .05, 0x404040,     0,  .025, 0),
        _cg(.025, .025, 1.44, 0x555555,    0,  .77,  0, 6),
        _cg(0,    .25,  .28, h,            0,  1.63, 0),
      ]);
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true })));
      const ol = new THREE.Mesh(geo, _OL_MAT);
      ol.scale.setScalar(1.055); ol.raycast = () => {};
      grp.add(ol);
      // Glow disc — separate mesh (MeshBasicMaterial, different from toon)
      const glowGeo = new THREE.CircleGeometry(.11, 12);
      glowGeo.applyMatrix4(_T.makeRotationX(Math.PI / 2));
      glowGeo.applyMatrix4(_T.makeTranslation(0, 1.50, 0));
      const bulb = new THREE.Mesh(glowGeo,
        new THREE.MeshBasicMaterial({ color: _lighten(h, .2), side: THREE.DoubleSide }));
      bulb.userData.glow = true; grp.add(bulb);
      // Warm light pool on the floor so the lamp reads as "on"
      const pool = _floorGlow(1.7, 0xffc070, .38);
      pool.userData.glow = true; grp.add(pool);
      return grp;
    }
  },
  {
    id: 'plant', label: 'Plant', color: '#c87050', w: 1, d: 1, h: 1.10,
    roomTypes: ['bedroom', 'living', 'bathroom'],
    colors: [
      { label: 'Terracotta', hex: 0xc87050 }, { label: 'Wit',  hex: 0xe8e0d8 },
      { label: 'Zwart',      hex: 0x484040 }, { label: 'Mint', hex: 0x90c0a8 },
    ],
    build(h = 0xc87050) {
      return _buildFurniture([
        _cg(.18, .14, .32, h,        0,  .16, 0),
        _cg(.17, .17, .04, 0x3a2010, 0,  .34, 0),
        _sg(.32, 0x5aaa60,           0,  .72, 0),
        _sg(.22, 0x72cc70,          .17, .88, .10),
      ]);
    }
  },
  {
    id: 'rug', label: 'Vloerkleed', color: '#e09880', w: 3, d: 2, h: 0.09, layer: 'floor',
    roomTypes: ['bedroom', 'living'],
    colors: [
      { label: 'Zalm',    hex: 0xe09880 }, { label: 'Indigo',  hex: 0x8090c0 },
      { label: 'Mosterd', hex: 0xd8b840 }, { label: 'Salie',   hex: 0x90b090 },
    ],
    build(h = 0xe09880) {
      const lt = _lighten(h, .12);
      return _buildFurniture([
        _bg(2.86, .04, 1.86, h,  0, .020, 0),
        _bg(2.46, .045, 1.46, lt, 0, .042, 0),
      ]);
    }
  },
  {
    id: 'bed', label: 'Bed', color: '#e8c4c8', w: 2, d: 3, h: 0.65,
    roomTypes: ['bedroom'],
    colors: [
      { label: 'Salie',   hex: 0x90b898 }, { label: 'Blush',  hex: 0xe8c4c8 },
      { label: 'Mosterd', hex: 0xc8a840 }, { label: 'Ivoor',  hex: 0xd8d0c0 },
    ],
    build(h = 0x90b898) {
      return _buildFurniture([
        _bg(1.86, .22, 2.86, 0xd4b896,  0,  .11,    0),
        _bg(1.86, .56, .16,  0xc0a478,  0,  .44, -1.35),
        _bg(1.70, .22, 2.54, 0xf8f4ee,  0,  .33,   .05),
        _bg(1.60, .14, 1.56, h,         0,  .51,   .52),
        _bg(1.34, .10, .40,  0xfff5f0,  0, .495, -.98),
      ]);
    }
  },
  {
    id: 'bookshelf', label: 'Boekenkast', color: '#a07848', w: 1, d: 1, h: 1.87,
    roomTypes: ['bedroom', 'living'],
    colors: [
      { label: 'Eiken',  hex: 0xa07848 }, { label: 'Walnoot', hex: 0x6a4428 },
      { label: 'Wit',    hex: 0xe8e4dc }, { label: 'Zwart',   hex: 0x383430 },
    ],
    build(h = 0xa07848) {
      const dk = _darken(h, .14);
      return _buildFurniture([
        _bg(.86, 1.82, .30, h,   0,  .91, 0),
        _bg(.82, .05,  .28, dk,  0,  .54, 0),
        _bg(.82, .05,  .28, dk,  0, 1.00, 0),
        _bg(.82, .05,  .28, dk,  0, 1.46, 0),
        _bg(.09, .26, .22, 0xe05050, -.31, 1.24, 0),
        _bg(.08, .26, .22, 0x5080d0, -.21, 1.24, 0),
        _bg(.10, .26, .22, 0x50a858, -.10, 1.24, 0),
        _bg(.08, .26, .22, 0xd0a020,  .01, 1.24, 0),
        _bg(.09, .26, .22, 0xc06898,  .11, 1.24, 0),
      ]);
    }
  },
  {
    id: 'tvstand', label: 'TV-meubel', color: '#6a6058', w: 2, d: 1, h: 0.52,
    roomTypes: ['living'],
    colors: [
      { label: 'Antraciet', hex: 0x6a6058 }, { label: 'Eiken', hex: 0xb08050 },
      { label: 'Wit',       hex: 0xf0ece4 }, { label: 'Zwart', hex: 0x303030 },
    ],
    build(h = 0x6a6058) {
      const dk = _darken(h, .16), lt = _lighten(h, .14);
      return _buildFurniture([
        _bg(1.80, .36, .80, h,    0,  .18,    0),
        _bg(1.80, .06, .80, dk,   0,  .39,    0),
        _bg(.52,  .30, .72, lt, -.58, .15,    0),
        _bg(.52,  .30, .72, lt,  .58, .15,    0),
        _bg(.58,  .30, .72, dk,   0,  .15,    0),
        _bg(1.60, .90, .06, 0x101418, 0,  .85, -.36),
        _bg(1.44, .76, .04, 0x1a2430, 0,  .85, -.33),
      ]);
    }
  },
  {
    id: 'desk', label: 'Bureau', color: '#c0a070', w: 2, d: 1, h: 0.82,
    roomTypes: ['bedroom', 'living'],
    colors: [
      { label: 'Eiken',   hex: 0xc0a070 }, { label: 'Walnoot', hex: 0x7a5030 },
      { label: 'Wit',     hex: 0xf2eeea }, { label: 'Zwart',   hex: 0x383430 },
    ],
    build(h = 0xc0a070) {
      const dk = _darken(h, .18);
      return _buildFurniture([
        _bg(1.84, .06, .80, h,      0,   .79,    0),
        _bg(.06,  .76, .06, dk,  -.86,   .38, -.34),
        _bg(.06,  .76, .06, dk,  -.86,   .38,  .34),
        _bg(.06,  .76, .06, dk,   .86,   .38, -.34),
        _bg(.06,  .76, .06, dk,   .86,   .38,  .34),
        _bg(.06,  .52, .68, dk,  -.86,   .26,    0),
        _bg(.74,  .50, .06, dk,  -.58,   .25, -.34),
        _bg(.70,  .04, .04, dk,  -.58,   .12, -.28),
        _bg(.70,  .04, .04, dk,  -.58,   .34, -.28),
      ]);
    }
  },
  {
    id: 'nightstand', label: 'Nachtkastje', color: '#c8a870', w: 1, d: 1, h: 0.58,
    roomTypes: ['bedroom'],
    colors: [
      { label: 'Eiken', hex: 0xc8a870 }, { label: 'Walnoot', hex: 0x7a5030 },
      { label: 'Wit',   hex: 0xf2eeea }, { label: 'Roze',    hex: 0xe8c0b8 },
    ],
    build(h = 0xc8a870) {
      const dk = _darken(h, .18), lt = _lighten(h, .12);
      return _buildFurniture([
        _bg(.78, .50, .78, h,         0, .25,    0),
        _bg(.78, .06, .78, lt,        0, .53,    0),
        _bg(.64, .18, .68, dk,        0, .25,    0),
        _bg(.04, .06, .04, 0x888070,  0, .31, -.32),
        _cg(.10, .12, .03, 0x909090,  0, .57,    0),
        _cg(.015, .015, .28, 0x606060, 0, .72,   0, 6),
        _cg(0, .14, .18, 0xf8e8b0,   0, .87,    0),
      ]);
    }
  },

  // ── Kitchen ───────────────────────────────────────────────────────────────
  {
    id: 'kcounter', label: 'Keukenblok', w: 2, d: 1, h: 0.90,
    roomTypes: ['kitchen'],
    colors: [
      { label: 'Wit',    hex: 0xf0ece4 }, { label: 'Grijs',  hex: 0xd0ccc8 },
      { label: 'Eiken',  hex: 0xc8a870 }, { label: 'Antrac.', hex: 0x606058 },
    ],
    build(h = 0xf0ece4) {
      const dk = _darken(h, .13), lt = _lighten(h, .08);
      return _buildFurniture([
        _bg(1.88, .06, .80, dk,       0,  .03,    0),  // kick plate
        _bg(1.88, .74, .80, h,        0,  .43,    0),  // cabinet body
        _bg(1.96, .08, .86, lt,       0,  .84,    0),  // countertop
        _bg(.82, .52, .04, dk,     -.47,  .43, -.41),  // left door
        _bg(.82, .52, .04, dk,      .47,  .43, -.41),  // right door
        _bg(.20, .03, .02, 0x909090, -.47, .52, -.44), // left handle
        _bg(.20, .03, .02, 0x909090,  .47, .52, -.44), // right handle
      ]);
    }
  },
  {
    id: 'fridge', label: 'Koelkast', w: 1, d: 1, h: 1.80,
    roomTypes: ['kitchen'],
    colors: [
      { label: 'Grijs', hex: 0xc8c4c0 }, { label: 'Wit',   hex: 0xf4f0ec },
      { label: 'Staal', hex: 0xb0b8b8 }, { label: 'Zwart', hex: 0x343430 },
    ],
    build(h = 0xc8c4c0) {
      const dk = _darken(h, .12);
      return _buildFurniture([
        _bg(.80, 1.70, .70, h,          0,  .85,    0),  // main body
        _bg(.68, 1.54, .05, dk,         0,  .91, -.36),  // door panel
        _bg(.68, .03, .05, 0x808080,    0,  .54, -.36),  // freezer line
        _bg(.06, .52, .04, 0xa0a0a0, -.26, 1.10, -.40),  // handle
      ]);
    }
  },
  {
    id: 'stove', label: 'Fornuis', w: 1, d: 1, h: 0.90,
    roomTypes: ['kitchen'],
    colors: [
      { label: 'Antrac.', hex: 0x505058 }, { label: 'Wit',   hex: 0xf0ece4 },
      { label: 'Staal',   hex: 0xa0a8a8 }, { label: 'Beige', hex: 0xd8c8b0 },
    ],
    build(h = 0x505058) {
      const dk = _darken(h, .14);
      return _buildFurniture([
        _bg(.84, .82, .80, h,              0,  .41,    0),  // body
        _bg(.82, .04, .78, dk,             0,  .84,    0),  // glass top
        _cg(.11, .11, .02, 0x181820, -.22,    .87, -.18, 12), // burner FL
        _cg(.11, .11, .02, 0x181820,  .22,    .87, -.18, 12), // burner FR
        _cg(.11, .11, .02, 0x181820, -.22,    .87,  .18, 12), // burner BL
        _cg(.11, .11, .02, 0x181820,  .22,    .87,  .18, 12), // burner BR
        _bg(.62, .38, .04, 0x181820,   0,     .49, -.41),  // oven door
        _cg(.04, .04, .04, 0x404040, -.18,    .19, -.43, 8),  // knob L
        _cg(.04, .04, .04, 0x404040,   0,     .19, -.43, 8),  // knob M
        _cg(.04, .04, .04, 0x404040,  .18,    .19, -.43, 8),  // knob R
      ]);
    }
  },
  {
    id: 'ksink', label: 'Gootsteen', w: 1, d: 1, h: 0.90,
    roomTypes: ['kitchen'],
    colors: [
      { label: 'Wit',   hex: 0xf0ece4 }, { label: 'Grijs', hex: 0xd0ccc8 },
      { label: 'Eiken', hex: 0xc8a870 }, { label: 'Mint',  hex: 0xb8d8cc },
    ],
    build(h = 0xf0ece4) {
      const dk = _darken(h, .12);
      return _buildFurniture([
        _bg(.84, .80, .80, h,           0,  .40,    0),  // cabinet
        _bg(.86, .06, .82, 0xe0dcd8,    0,  .83,    0),  // countertop
        _bg(.54, .05, .48, dk,          0,  .84,  .06),  // basin
        _bg(.06, .04, .04, 0x909090,    0,  .86, -.14),  // faucet base
        _cg(.022, .022, .22, 0x909090,  0,  .97, -.14, 6), // faucet neck
        _bg(.16, .022, .022, 0x909090,  0, 1.08, -.14),  // faucet head
      ]);
    }
  },
  {
    id: 'diningtable', label: 'Eettafel', w: 2, d: 1, h: 0.78,
    roomTypes: ['kitchen', 'living'],
    colors: [
      { label: 'Eiken',  hex: 0xd4a870 }, { label: 'Walnoot', hex: 0x8c5c38 },
      { label: 'Wit',    hex: 0xf0ece4 }, { label: 'Zwart',   hex: 0x404040 },
    ],
    build(h = 0xd4a870) {
      const dk = _darken(h, .18);
      return _buildFurniture([
        _bg(1.84, .06, .84, h,     0,  .75,  0),  // tabletop
        _bg(.06, .68, .06, dk, -.84,  .34, -.36),  // leg FL
        _bg(.06, .68, .06, dk,  .84,  .34, -.36),  // leg FR
        _bg(.06, .68, .06, dk, -.84,  .34,  .36),  // leg BL
        _bg(.06, .68, .06, dk,  .84,  .34,  .36),  // leg BR
      ]);
    }
  },
  {
    id: 'diningchair', label: 'Eetstoel', w: 1, d: 1, h: 0.96,
    roomTypes: ['kitchen', 'living'],
    colors: [
      { label: 'Eiken',      hex: 0xc8a870 }, { label: 'Walnoot',    hex: 0x7a5030 },
      { label: 'Wit',        hex: 0xf0ece4 }, { label: 'Terracotta', hex: 0xc07858 },
    ],
    build(h = 0xc8a870) {
      const dk = _darken(h, .15);
      return _buildFurniture([
        _bg(.66, .10, .64, h,    0,  .44,    0),  // seat
        _bg(.64, .46, .08, dk,   0,  .79, -.26),  // backrest
        _bg(.05, .42, .05, dk, -.26, .21, -.24),  // leg FL
        _bg(.05, .42, .05, dk,  .26, .21, -.24),  // leg FR
        _bg(.05, .42, .05, dk, -.26, .21,  .24),  // leg BL
        _bg(.05, .42, .05, dk,  .26, .21,  .24),  // leg BR
      ]);
    }
  },

  // ── Bathroom ──────────────────────────────────────────────────────────────
  {
    id: 'bsink', label: 'Wastafelkast', w: 1, d: 1, h: 0.85,
    roomTypes: ['bathroom'],
    colors: [
      { label: 'Wit',  hex: 0xf2eeea }, { label: 'Beige', hex: 0xe8ddd0 },
      { label: 'Mint', hex: 0xbad8cc }, { label: 'Roze',  hex: 0xecd0cc },
    ],
    build(h = 0xf2eeea) {
      const dk = _darken(h, .12);
      return _buildFurniture([
        _bg(.72, .66, .50, h,            0,  .33,    0),  // cabinet
        _bg(.74, .05, .52, 0xdedbd8,     0,  .685,   0),  // countertop
        _bg(.50, .04, .38, dk,           0,  .70,  .04),  // basin
        _bg(.58, .46, .04, dk,           0,  .33, -.26),  // door
        _bg(.06, .04, .04, 0x909090,     0,  .72, -.08),  // faucet base
        _cg(.022, .022, .18, 0x909090,   0,  .81, -.08, 6), // faucet neck
        _bg(.12, .022, .022, 0x909090,   0,  .90, -.08),  // faucet head
      ]);
    }
  },
  {
    id: 'toilet', label: 'Toilet', w: 1, d: 1, h: 0.82,
    roomTypes: ['bathroom'],
    colors: [
      { label: 'Wit',   hex: 0xf4f0ec }, { label: 'Crème', hex: 0xece4d4 },
      { label: 'Grijs', hex: 0xd0ccca }, { label: 'Roze',  hex: 0xf0d8d4 },
    ],
    build(h = 0xf4f0ec) {
      const dk = _darken(h, .10), lt = _lighten(h, .06);
      return _buildFurniture([
        _cg(.28, .30, .34, h,   0, .17,  .16, 12),  // bowl
        _cg(.28, .28, .04, lt,  0, .36,  .16, 12),  // seat
        _bg(.40, .40, .20, h,   0, .61, -.20),       // tank
        _bg(.42, .04, .22, dk,  0, .83, -.20),       // tank lid
      ]);
    }
  },
  {
    id: 'shower', label: 'Douche', w: 1, d: 1, h: 2.0,
    roomTypes: ['bathroom'],
    colors: [
      { label: 'Blauw', hex: 0x80b8d8 }, { label: 'Mint',  hex: 0x78c0a8 },
      { label: 'Wit',   hex: 0xd8eef8 }, { label: 'Grijs', hex: 0x98a8b0 },
    ],
    build(h = 0x80b8d8) {
      return _buildFurniture([
        _bg(.84, .08, .84, 0xe0dcd8,    0,   .04,    0),  // tray
        _bg(.84, 1.80, .05, h,          0,   .98, -.42),  // back glass
        _bg(.05, 1.80, .84, h,       -.42,   .98,    0),  // side glass
        _bg(.04, .22, .04, 0x909090, -.32,  1.88, -.32),  // wall pipe
        _bg(.04, .04, .20, 0x909090, -.32,  1.76, -.22),  // arm
        _cg(.08, .08, .03, 0x787878, -.32,  1.76, -.32, 10), // showerhead
      ]);
    }
  },
  {
    id: 'bathtub', label: 'Ligbad', w: 2, d: 1, h: 0.65,
    roomTypes: ['bathroom'],
    colors: [
      { label: 'Blush', hex: 0xe89888 }, { label: 'Mint',  hex: 0x80c0a8 },
      { label: 'Wit',   hex: 0xf0ece8 }, { label: 'Grijs', hex: 0xa8a0a0 },
    ],
    build(h = 0xe89888) {
      const dk = _darken(h, .10), lt = _lighten(h, .06);
      return _buildFurniture([
        _bg(1.80, .54, .82, h,          0,  .27,    0),  // outer body
        _bg(1.60, .18, .62, lt,         0,  .50,  .02),  // inner basin
        _bg(1.82, .06, .84, dk,         0,  .57,    0),  // rim
        _cg(.022, .022, .22, 0xa0a0a0, .72,  .66, -.14, 6), // faucet neck
        _bg(.14, .022, .022, 0xa0a0a0, .72,  .77, -.14),  // faucet head
      ]);
    }
  },
  {
    id: 'towelrack', label: 'Handdoekrek', w: 1, d: 1, h: 1.20,
    roomTypes: ['bathroom'],
    colors: [
      { label: 'Wit',   hex: 0xf0e8e0 }, { label: 'Roze',  hex: 0xf0c8c0 },
      { label: 'Mint',  hex: 0xc0e0d4 }, { label: 'Blauw', hex: 0xc0d4e8 },
    ],
    build(h = 0xf0e8e0) {
      return _buildFurniture([
        _bg(.08, .04, .22, 0x808080,         -.26,  .02, 0),  // base L
        _bg(.08, .04, .22, 0x808080,          .26,  .02, 0),  // base R
        _cg(.028, .028, 1.10, 0xa0a0a0,      -.26,  .57, 0, 8), // post L
        _cg(.028, .028, 1.10, 0xa0a0a0,       .26,  .57, 0, 8), // post R
        _bg(.52, .04, .04, 0xa8a8a8,             0,  .38, 0),      // bar low
        _bg(.52, .04, .04, 0xa8a8a8,             0,  .72, 0),      // bar high
        _bg(.42, .32, .05, h,                   0,  .62, .05),  // towel
      ]);
    }
  },
  {
    id: 'bathmirror', label: 'Spiegel', w: 1, d: 1, h: 1.46,
    roomTypes: ['bathroom', 'bedroom'],
    colors: [
      { label: 'Chroom', hex: 0xb8c0c4 }, { label: 'Goud',  hex: 0xe8c860 },
      { label: 'Zwart',  hex: 0x383430 }, { label: 'Hout',  hex: 0xc8a870 },
    ],
    build(h = 0xb8c0c4) {
      return _buildFurniture([
        _bg(.36, .04, .20, h,         0,  .02,    0),
        _bg(.04, .92, .04, h,         0,  .48,    0),
        _bg(.62, .84, .06, h,         0, 1.02,    0),
        _bg(.52, .72, .04, 0xcce4f0,  0, 1.02,  .05),
      ]);
    }
  },

  // ── Decoratie / kleine items ──────────────────────────────────────────────
  {
    id: 'candle', label: 'Kaars', w: 1, d: 1, h: 0.34, interactive: 'lamp',
    roomTypes: ['bedroom', 'living', 'kitchen', 'bathroom'],
    colors: [
      { label: 'Crème', hex: 0xf0e6d2 }, { label: 'Roze', hex: 0xf0c0c8 },
      { label: 'Salie', hex: 0xb8cca8 }, { label: 'Wit',  hex: 0xf6f2ea },
    ],
    build(h = 0xf0e6d2) {
      const g = _buildFurniture([
        _cg(.13, .15, .26, h,            0, .13, 0, 12),
        _cg(.14, .14, .03, _darken(h, .08), 0, .27, 0, 12),
      ]);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffd070 }));
      flame.position.set(0, .33, 0); flame.userData.glow = true; g.add(flame);
      const pool = _floorGlow(.9, 0xffc070, .30); pool.userData.glow = true; g.add(pool);
      return g;
    }
  },
  {
    id: 'books', label: 'Boeken', w: 1, d: 1, h: 0.3,
    roomTypes: ['bedroom', 'living'],
    colors: [
      { label: 'Warm',  hex: 0xc06050 }, { label: 'Blauw', hex: 0x6a90c0 },
      { label: 'Groen', hex: 0x6fae84 }, { label: 'Oker',  hex: 0xd8a850 },
    ],
    build(h = 0xc06050) {
      return _buildFurniture([
        _bg(.50, .08, .34, h,             0,   .05, 0),
        _bg(.46, .08, .30, _lighten(h, .14), .02, .13, .01),
        _bg(.42, .08, .27, _darken(h, .10), -.02, .21, -.01),
      ]);
    }
  },
  {
    id: 'vase', label: 'Vaas', w: 1, d: 1, h: 0.66,
    roomTypes: ['bedroom', 'living', 'kitchen', 'bathroom'],
    colors: [
      { label: 'Klei', hex: 0xc88a6a }, { label: 'Wit',   hex: 0xeee6dc },
      { label: 'Blauw', hex: 0x7aa0c0 }, { label: 'Zwart', hex: 0x40383a },
    ],
    build(h = 0xc88a6a) {
      return _buildFurniture([
        _cg(.10, .16, .34, h,             0, .17, 0, 12),
        _cg(.11, .10, .04, _darken(h, .08), 0, .36, 0, 12),
        _cg(.02, .02, .24, 0x5a8a50,     -.04, .50, 0, 6),
        _cg(.02, .02, .22, 0x5a8a50,      .05, .48, .03, 6),
        _sg(.06, 0xe48aa0,               -.04, .63, 0),
        _sg(.06, 0xf0c060,                .05, .60, .03),
        _sg(.055, 0xf0a0b0,               .01, .66, -.03),
      ]);
    }
  },
  {
    id: 'pouf', label: 'Poef', w: 1, d: 1, h: 0.34,
    roomTypes: ['living', 'bedroom'],
    colors: [
      { label: 'Mosterd', hex: 0xd8a850 }, { label: 'Roze',  hex: 0xe6a8b4 },
      { label: 'Salie',   hex: 0x9cbf9c }, { label: 'Grijs', hex: 0xb0a89e },
    ],
    build(h = 0xd8a850) {
      return _buildFurniture([
        _cg(.32, .32, .26, h,             0, .14, 0, 14),
        _cg(.33, .33, .04, _darken(h, .08), 0, .27, 0, 14),
      ]);
    }
  },
  {
    id: 'roundrug', label: 'Rond kleed', w: 2, d: 2, h: 0.08, layer: 'floor',
    roomTypes: ['living', 'bedroom', 'bathroom'],
    colors: [
      { label: 'Zand',  hex: 0xe0c89a }, { label: 'Roze', hex: 0xe8bcc2 },
      { label: 'Salie', hex: 0xa8c4a4 }, { label: 'Grijs', hex: 0xc2bab0 },
    ],
    build(h = 0xe0c89a) {
      return _buildFurniture([
        _cg(.92, .92, .04, _darken(h, .12),  0, .02,  0, 28),   // border (darker, low)
        _cg(.74, .74, .04, h,                0, .055, 0, 28),   // field (raised .035 → no z-fight)
      ]);
    }
  },
  {
    id: 'sidetable', label: 'Bijzettafel', w: 1, d: 1, h: 0.5,
    roomTypes: ['living', 'bedroom'],
    colors: [
      { label: 'Eiken', hex: 0xc8a06a }, { label: 'Walnoot', hex: 0x8c6a48 },
      { label: 'Wit',   hex: 0xe8e0d6 }, { label: 'Zwart',   hex: 0x3a3636 },
    ],
    build(h = 0xc8a06a) {
      return _buildFurniture([
        _cg(.27, .27, .04, h,             0, .48, 0, 14),
        _cg(.03, .03, .46, _darken(h, .12), 0, .23, 0, 8),
        _cg(.17, .17, .03, _darken(h, .12), 0, .02, 0, 14),
      ]);
    }
  },
  {
    id: 'teddy', label: 'Knuffel', w: 1, d: 1, h: 0.52,
    roomTypes: ['bedroom', 'living'],
    colors: [
      { label: 'Bruin', hex: 0xb98a5e }, { label: 'Roze',  hex: 0xe6a8b4 },
      { label: 'Crème', hex: 0xe8dcc8 }, { label: 'Grijs', hex: 0xa8a09a },
    ],
    build(h = 0xb98a5e) {
      return _buildFurniture([
        _sg(.16, h,              0, .18, 0),
        _sg(.12, h,              0, .36, .04),
        _sg(.05, h,            -.09, .46, .02),
        _sg(.05, h,             .09, .46, .02),
        _sg(.06, _lighten(h, .12), 0, .32, .13),
        _sg(.024, 0x2a2424,    -.05, .40, .13),
        _sg(.024, 0x2a2424,     .05, .40, .13),
        _sg(.07, h,            -.15, .18, .04),
        _sg(.07, h,             .15, .18, .04),
        _sg(.07, h,            -.08, .05, .06),
        _sg(.07, h,             .08, .05, .06),
      ]);
    }
  },
  {
    id: 'smallplant', label: 'Klein plantje', w: 1, d: 1, h: 0.46,
    roomTypes: ['bedroom', 'living', 'kitchen', 'bathroom'],
    colors: [
      { label: 'Terracotta', hex: 0xc87050 }, { label: 'Wit', hex: 0xe8e0d8 },
      { label: 'Zwart', hex: 0x484040 }, { label: 'Mint', hex: 0x90c0a8 },
    ],
    build(h = 0xc87050) {
      return _buildFurniture([
        _cg(.12, .09, .18, h,             0, .09, 0, 10),
        _cg(.13, .13, .03, _darken(h, .08), 0, .18, 0, 10),
        _sg(.16, 0x6fae84,                0, .32, 0),
        _sg(.10, 0x7fbf90,              .08, .40, .04),
        _sg(.10, 0x7fbf90,             -.08, .40, -.02),
      ]);
    }
  },

  // ── Wall decor (wallMounted: true) ────────────────────────────────────────
  {
    id: 'poster', label: 'Poster', wallMounted: true,
    w: 1, d: 0, h: 1.1,
    roomTypes: ['bedroom', 'living', 'kitchen', 'bathroom'],
    colors: [
      { label: 'Zalm',     hex: 0xf0a090 },
      { label: 'Lavendel', hex: 0xc0aad8 },
      { label: 'Mint',     hex: 0x98d4b8 },
      { label: 'Mosterd',  hex: 0xe0c060 },
    ],
    build(h = 0xf0a090) {
      return _buildFurniture([
        _bg(.84, 1.10, .06, 0xf0ece4,  0, 0,    0),
        _bg(.68, .92,  .04, h,          0, 0, .02),
      ]);
    }
  },
  {
    id: 'photoframe', label: 'Fotolijst', wallMounted: true,
    w: 1, d: 0, h: 0.74,
    roomTypes: ['bedroom', 'living', 'bathroom'],
    colors: [
      { label: 'Goud',  hex: 0xe0c060 },
      { label: 'Hout',  hex: 0xc8a870 },
      { label: 'Zwart', hex: 0x383434 },
      { label: 'Wit',   hex: 0xf0ece4 },
    ],
    build(h = 0xe0c060) {
      const grp = _buildFurniture([
        _bg(.74, .74, .06, h,        0, 0,    0),
        _bg(.60, .60, .04, 0x201c1c, 0, 0, .02),  // dark mat behind photo
      ]);
      const photo = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: _photoTexture() })
      );
      photo.position.z = .045;
      photo.raycast = () => {};   // exclude from hit-testing
      _photoMeshes.push(photo);
      _fitPhoto(photo);
      grp.add(photo);
      return grp;
    }
  },
];
