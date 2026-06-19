'use strict';
let _ctx = null;

function _ac() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

function _tone(freq0, freq1, dur, type = 'sine', vol = 0.22) {
  try {
    const ctx = _ac();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq0, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq1, ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur + 0.01);
  } catch {}
}

function playPlace()  { _tone(280, 130, 0.18, 'sine',     0.28); }
function playRemove() { _tone(380, 190, 0.12, 'triangle', 0.18); }
function playError()  { _tone(200, 170, 0.10, 'sawtooth', 0.14); }
function playRotate() { _tone(520, 620, 0.07, 'sine',     0.14); }
function playSelect() { _tone(440, 480, 0.06, 'sine',     0.10); }
