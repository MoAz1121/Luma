'use strict';
window.addEventListener('DOMContentLoaded', () => {
  try {
    // Previews FIRST — before main WebGL context is created.
    // Two live WebGL contexts at once causes context loss on many devices.
    renderPreviews();

    GS = loadRoomSize();
    _activeRoomType = loadRoomType();
    initScene(document.getElementById('c'));
    initUI();
    initInput();
    loadRoom();
    setWallColor(_curWall);
    setFloorColor(_curFloor);
    _syncPanelSwatches();
    load();
    loadWallItems();

    (function loop() {
      requestAnimationFrame(loop);
      tickPlacement();
      tickParticles();
      renderer.render(scene, camera);
    })();

  } catch (err) {
    // Show error visibly instead of silent blank screen
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;inset:0;background:#fff;color:#c00;padding:20px;font:12px monospace;white-space:pre;z-index:9999;overflow:auto';
    div.textContent = 'INIT ERROR:\n' + (err.stack || err.message || String(err));
    document.body.appendChild(div);
  }
});
