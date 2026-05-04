/**
 * main.js – Game entry point and scene orchestrator.
 *
 * Scenes:
 *   title   → TitleScene   (animated star-field)
 *   blockly → BlocklyScene (Blockly workspace for coding hero actions)
 *   battle  → BattleScene  (Pixi.js endless-mode fight)
 */

import { TitleScene }   from './scenes/TitleScene.js';
import { BlocklyScene } from './scenes/BlocklyScene.js';
import { BattleScene }  from './scenes/BattleScene.js';

class Game {
  constructor() {
    this._current = null;
    this._scenes  = {};
    this._init();
  }

  _init() {
    // Guard: ensure required libraries are loaded
    if (typeof PIXI === 'undefined') {
      console.error('[Game] Pixi.js not loaded!');
      document.body.innerHTML = '<p style="color:red;padding:20px">無法載入 Pixi.js，請確認網路連線。</p>';
      return;
    }
    if (typeof Blockly === 'undefined') {
      console.error('[Game] Blockly not loaded!');
      document.body.innerHTML = '<p style="color:red;padding:20px">無法載入 Blockly，請確認網路連線。</p>';
      return;
    }

    this._scenes.title   = new TitleScene(this);
    this._scenes.blockly = new BlocklyScene(this);
    this._scenes.battle  = new BattleScene(this);

    this.goToTitle();
  }

  _showScene(name) {
    if (this._current) this._current.hide();
    this._current = this._scenes[name];
    this._current.show();
  }

  goToTitle()   { this._showScene('title');   }
  goToBlockly() { this._showScene('blockly'); }
  goToBattle()  { this._showScene('battle');  }
}

// Expose game instance globally (useful for debugging)
window.blockHeroGame = new Game();
