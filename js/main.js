/**
 * main.js – Game entry point and scene orchestrator.
 *
 * Scenes:
 *   title      → TitleScene          (animated star-field)
 *   blockly    → BlocklyScene        (Blockly workspace for coding hero actions)
 *   battle     → BattleScene         (Pixi.js endless-mode fight)
 *   peerLobby  → PeerLobbyScene      (PeerJS connection lobby)
 *   mpBattle   → MultiplayerBattleScene (two-player PvP via PeerJS)
 */

import { TitleScene }              from './scenes/TitleScene.js';
import { BlocklyScene }            from './scenes/BlocklyScene.js';
import { BattleScene }             from './scenes/BattleScene.js';
import { PeerLobbyScene }          from './scenes/PeerLobbyScene.js';
import { MultiplayerBattleScene }  from './scenes/MultiplayerBattleScene.js';

class Game {
  constructor() {
    this._current = null;
    this._scenes  = {};

    /** Active PeerJS Peer instance (set by PeerLobbyScene) */
    this._mpPeer  = null;
    /** Active PeerJS DataConnection (set by PeerLobbyScene) */
    this._mpConn  = null;

    this._init();
  }

  _init() {
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
    if (typeof Peer === 'undefined') {
      console.warn('[Game] PeerJS not loaded – multiplayer will be unavailable.');
    }

    this._scenes.title    = new TitleScene(this);
    this._scenes.blockly  = new BlocklyScene(this);
    this._scenes.battle   = new BattleScene(this);
    this._scenes.peerLobby = new PeerLobbyScene(this);
    this._scenes.mpBattle  = new MultiplayerBattleScene(this);

    this.goToTitle();
  }

  _showScene(name) {
    if (this._current) this._current.hide();
    this._current = this._scenes[name];
    this._current.show();
  }

  goToTitle() {
    // Clean up any lingering multiplayer connection
    this._closeMpConnection();
    this._showScene('title');
  }

  goToBlockly()   { this._showScene('blockly');   }
  goToBattle()    { this._showScene('battle');     }
  goToMpLobby()   {
    this._closeMpConnection();
    this._showScene('peerLobby');
  }

  /**
   * Transition from PeerLobbyScene to MultiplayerBattleScene.
   * @param {import('peerjs').Peer}           peer
   * @param {import('peerjs').DataConnection} conn
   */
  goToMpBattle(peer, conn) {
    this._mpPeer = peer;
    this._mpConn = conn;
    this._showScene('mpBattle');
  }

  /** Tear down the active multiplayer peer/connection. */
  _closeMpConnection() {
    if (this._mpConn) {
      try { this._mpConn.close(); } catch (_) {}
      this._mpConn = null;
    }
    if (this._mpPeer) {
      try { this._mpPeer.destroy(); } catch (_) {}
      this._mpPeer = null;
    }
  }
}

// Expose game instance globally (useful for debugging)
window.blockHeroGame = new Game();

