// WeChat mini-game entry: the adapter must evaluate before three.js and the game modules.
import './adapter.js';
import '../../site/main.js';
import { initHud } from './hud.js';

initHud();
// phones: render at device pixels up to 1.5x and keep post-processing light
(function tune() {
  const G = window.__iv && window.__iv.G;
  if (!G || !G.renderer) { setTimeout(tune, 50); return; }
  G.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  G.renderer.setSize(innerWidth, innerHeight);
  if (G.composer) G.composer.setSize(innerWidth, innerHeight);
})();
