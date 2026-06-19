'use strict';
window.addEventListener('DOMContentLoaded', () => {
  try {
    // Previews FIRST — before main WebGL context is created.
    // Two live WebGL contexts at once causes context loss on many devices.
    renderPreviews();

    GS = loadRoomSize();
    _activeRoomType = loadRoomType();
    Cat.setEnabled(localStorage.getItem('luma_cat_on') !== '0');
    Person.setEnabled(localStorage.getItem('luma_person_on') !== '0');
    initScene(document.getElementById('c'));
    initUI();
    initInput();
    loadRoom();
    setWallColor(_curWall);
    setFloorColor(_curFloor);
    _syncPanelSwatches();
    load();
    loadWallItems();
    Cat.init();
    Person.init();
    showGreeting();

    let _last = performance.now();
    (function loop(now) {
      requestAnimationFrame(loop);
      now = now || performance.now();
      const dt = Math.min(.05, (now - _last) / 1000); _last = now;
      tickPlacement();
      tickParticles();
      Cat.tick(dt);
      Person.tick(dt);
      renderer.render(scene, camera);
    })(performance.now());

  } catch (err) {
    // Show error visibly instead of silent blank screen
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;inset:0;background:#fff;color:#c00;padding:20px;font:12px monospace;white-space:pre;z-index:9999;overflow:auto';
    div.textContent = 'INIT ERROR:\n' + (err.stack || err.message || String(err));
    document.body.appendChild(div);
  }
});
