'use strict';
let scene, camera, renderer, rayPlane;
const CAM_D = 7;
let _zoom = 1.0;
const _camTarget = new THREE.Vector3(0, 0, 0);
const _camOffset = new THREE.Vector3(12, 12, 12);

let _floorMesh = null;
let _wallMeshes = [];
let _roomMeshes = [];  // all room geometry — disposed on rebuild
let wallHitPlane = null;

let _particles;
const _pVel = [];

function initScene(container) {
  scene = new THREE.Scene();

  const asp = container.offsetWidth / container.offsetHeight;
  camera = new THREE.OrthographicCamera(-CAM_D*asp, CAM_D*asp, CAM_D, -CAM_D, 0.1, 200);
  camera.position.copy(_camOffset);
  camera.lookAt(_camTarget);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(container.offsetWidth, container.offsetHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.outputEncoding = THREE.sRGBEncoding;
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xfff8f0, 0.65));
  const sun = new THREE.DirectionalLight(0xfff0e0, 0.70);
  sun.position.set(15, 25, 10);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xe0f0ff, 0.18);
  fill.position.set(-8, 10, -8); scene.add(fill);

  _buildRoom();
  _initParticles();

  rayPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
  );
  rayPlane.rotation.x = -Math.PI / 2;
  scene.add(rayPlane);

  window.addEventListener('resize', () => {
    const W = container.offsetWidth, H = container.offsetHeight;
    const a = W / H;
    camera.left = -CAM_D * a * _zoom; camera.right = CAM_D * a * _zoom;
    camera.top  =  CAM_D * _zoom;     camera.bottom = -CAM_D * _zoom;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
  });
}

function _addRoom(mesh) { scene.add(mesh); _roomMeshes.push(mesh); return mesh; }

function _buildRoom() {
  const S = GS;
  const H = S / 2;

  _floorMesh = _addRoom(new THREE.Mesh(
    new THREE.BoxGeometry(S, .12, S),
    new THREE.MeshToonMaterial({ color: 0xefd9b8 })
  ));
  _floorMesh.position.y = -.06;

  const gh = new THREE.GridHelper(S, S, 0xdcc8a8, 0xdcc8a8);
  gh.position.y = .01; _addRoom(gh);

  _wallMeshes = [];

  const wZ = new THREE.Mesh(new THREE.BoxGeometry(S, 4.5, .12), new THREE.MeshToonMaterial({ color: 0xfce6df }));
  wZ.position.set(0, 2.25, -H);
  _addRoom(wZ); _wallMeshes.push(wZ);

  const wX = new THREE.Mesh(new THREE.BoxGeometry(.12, 4.5, S), new THREE.MeshToonMaterial({ color: 0xfce6df }));
  wX.position.set(-H, 2.25, 0);
  _addRoom(wX); _wallMeshes.push(wX);

  const bbMat = new THREE.MeshToonMaterial({ color: 0xe0c4b4 });
  const bbZ = new THREE.Mesh(new THREE.BoxGeometry(S, .12, .08), bbMat);
  bbZ.position.set(0, .06, -(H - .1)); _addRoom(bbZ);
  const bbX = new THREE.Mesh(new THREE.BoxGeometry(.08, .12, S), bbMat);
  bbX.position.set(-(H - .1), .06, 0); _addRoom(bbX);

  // Window — always on back wall, offset by room size
  const frameMat = new THREE.MeshToonMaterial({ color: 0xf5ebe0 });
  const winMat   = new THREE.MeshToonMaterial({ color: 0xd0eef8 });
  const barMat   = new THREE.MeshToonMaterial({ color: 0xf0e0d0 });
  const wz = -H + .06;
  const wf = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.7, .06), frameMat);
  wf.position.set(2, 2.6, wz); _addRoom(wf);
  const wg = new THREE.Mesh(new THREE.BoxGeometry(1.94, 1.44, .05), winMat);
  wg.position.set(2, 2.6, wz + .03); _addRoom(wg);
  const bH2 = new THREE.Mesh(new THREE.BoxGeometry(1.94, .05, .04), barMat);
  bH2.position.set(2, 2.6, wz + .06); _addRoom(bH2);
  const bV2 = new THREE.Mesh(new THREE.BoxGeometry(.05, 1.44, .04), barMat);
  bV2.position.set(2, 2.6, wz + .06); _addRoom(bV2);

  const patch = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 2.0),
    new THREE.MeshBasicMaterial({ color: 0xfff8e0, transparent: true, opacity: .08, depthWrite: false })
  );
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(1.6, .02, -(H - 2.5)); _addRoom(patch);

  // Invisible hit plane for wall-item raycasting (back wall, facing +Z)
  wallHitPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(S, 4.5),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
  );
  wallHitPlane.position.set(0, 2.25, -H + 0.08);
  _addRoom(wallHitPlane);
}

function _clearRoom() {
  for (const m of _roomMeshes) {
    scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (Array.isArray(m.material)) m.material.forEach(mt => mt.dispose());
      else m.material.dispose();
    }
  }
  _roomMeshes = [];
  _wallMeshes = [];
  _floorMesh  = null;
  wallHitPlane = null;
}

function rebuildRoom(newSize, wallHex, floorHex) {
  _clearRoom();
  GS = newSize;
  _buildRoom();
  if (wallHex  != null) setWallColor(wallHex);
  if (floorHex != null) setFloorColor(floorHex);
  if (rayPlane) {
    rayPlane.geometry.dispose();
    rayPlane.geometry = new THREE.PlaneGeometry(newSize + 10, newSize + 10);
  }
  _camTarget.set(0, 0, 0);
  camera.position.set(_camOffset.x, _camOffset.y, _camOffset.z);
  camera.lookAt(_camTarget);
  camera.updateMatrixWorld();
}

function setWallColor(hex) {
  _wallMeshes.forEach(m => m.material.color.setHex(hex));
}
function setFloorColor(hex) {
  if (_floorMesh) _floorMesh.material.color.setHex(hex);
}

function _initParticles() {
  const count = 55;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i*3]   = (Math.random() - .5) * 14;
    pos[i*3+1] = Math.random() * 6.5;
    pos[i*3+2] = (Math.random() - .5) * 14;
    _pVel.push({ x: (Math.random()-.5)*.004, y: .0015+Math.random()*.003, z: (Math.random()-.5)*.004 });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  _particles = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xfff0d8, size: .07, transparent: true, opacity: .6, sizeAttenuation: true,
  }));
  scene.add(_particles);
}

let _pFrame = 0;
function tickParticles() {
  if (!_particles || ++_pFrame % 2 !== 0) return;
  const pos = _particles.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.array[i*3]   += _pVel[i].x;
    pos.array[i*3+1] += _pVel[i].y;
    pos.array[i*3+2] += _pVel[i].z;
    if (pos.array[i*3+1] > 6.5) pos.array[i*3+1] = 0;
    if (Math.abs(pos.array[i*3])   > 7) _pVel[i].x *= -1;
    if (Math.abs(pos.array[i*3+2]) > 7) _pVel[i].z *= -1;
  }
  pos.needsUpdate = true;
}

function zoomCamera(delta) {
  _zoom = Math.max(.45, Math.min(2.6, _zoom + delta));
  const asp = renderer.domElement.offsetWidth / renderer.domElement.offsetHeight;
  camera.left   = -CAM_D * asp * _zoom; camera.right  =  CAM_D * asp * _zoom;
  camera.top    =  CAM_D * _zoom;       camera.bottom = -CAM_D * _zoom;
  camera.updateProjectionMatrix();
}

function panCamera(dx, dy) {
  const W = renderer.domElement.offsetWidth, H = renderer.domElement.offsetHeight;
  const fw = camera.right - camera.left, fh = camera.top - camera.bottom;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up    = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  _camTarget.x -= right.x*(dx/W)*fw - up.x*(dy/H)*fh;
  _camTarget.z -= right.z*(dx/W)*fw - up.z*(dy/H)*fh;
  const cl = GS / 2;
  _camTarget.x = Math.max(-cl, Math.min(cl, _camTarget.x));
  _camTarget.z = Math.max(-cl, Math.min(cl, _camTarget.z));
  camera.position.set(_camTarget.x+_camOffset.x, _camTarget.y+_camOffset.y, _camTarget.z+_camOffset.z);
  camera.lookAt(_camTarget);
  camera.updateMatrixWorld();
}
