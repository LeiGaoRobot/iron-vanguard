// WeChat mini-game entry: the adapter must evaluate before three.js and the game modules.
import './adapter.js';
import '../../site/main.js';
import { initHud } from './hud.js';

initHud();   // pixel ratio / MSAA / Bloom / shadows are set by quality.js once the renderer exists
