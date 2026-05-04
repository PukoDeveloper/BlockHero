/**
 * MultiplayerBattleScene – Two-player PvP battle over a PeerJS DataConnection.
 *
 * Architecture
 * ─────────────
 * Each player runs their own Hero locally (using their saved Blockly program).
 * An OpponentProxy mirrors the remote hero's HP locally for display purposes.
 *
 * Data channel messages
 * ─────────────────────
 *  Sent when MY hero attacks:   { type: 'hit',      dmg: N }
 *  Sent when MY hero heals:     { type: 'hp_sync',  hp:  N }
 *  Sent when MY hero defends:   { type: 'defend' }
 *  Sent when MY hero dies:      { type: 'dead' }
 *  Sent on connect / restart:   { type: 'ready' }
 *
 * Receiving 'hit'      → reduce myHero.hp by dmg (bypassing def; attacker already
 *                         factored their own atk - opponent.def in Hero.executeAction).
 * Receiving 'hp_sync'  → update opponentProxy.hp for display correction.
 * Receiving 'defend'   → show visual defend flag on opponentProxy.
 * Receiving 'dead'     → opponent died → I win.
 */

import { Hero }   from '../entities/Hero.js';
import { ACTION_DEFS, getActionProgramFromXml } from '../utils/BlocklyConfig.js';
import { Storage } from '../utils/Storage.js';

const LOG_MAX = 30;

/* =========================================================================
   OpponentProxy – a lightweight stand-in for the remote hero.
   Implements the same interface that Hero.executeAction() requires of its
   `enemy` argument (name, def, takeDamage) plus display helpers.
   ========================================================================= */
class OpponentProxy {
  constructor(sendFn) {
    this.name = '對手英雄';
    this.icon = '⚔️';
    this.maxHp = 100;
    this.hp    = 100;
    this.atk   = 20;   // kept for interface parity
    this.def   = 5;    // used by Hero.executeAction for damage calculation

    this.isHurt      = false;
    this.hurtTimer   = 0;
    this.isAttacking = false;
    this.attackTimer = 0;
    this.isDefending = false;

    this._send = sendFn;
  }

  /**
   * Called by Hero.executeAction(). Damage is already reduced by the hero's
   * atk minus this proxy's def (same as the remote hero's def).
   * We apply it locally (for display) and forward to the peer.
   */
  takeDamage(amount) {
    this.hp       = Math.max(0, this.hp - amount);
    this.isHurt   = true;
    this.hurtTimer = 0.3;
    this._send({ type: 'hit', dmg: amount });
    return amount;
  }

  update(dt) {
    if (this.isHurt      && (this.hurtTimer   -= dt) <= 0) this.isHurt      = false;
    if (this.isAttacking && (this.attackTimer -= dt) <= 0) this.isAttacking = false;
    if (this.isDefending) {
      // Visual-only; cleared by receiving a hit from peer
    }
  }

  isAlive()    { return this.hp > 0; }
  getHpPct()   { return (this.hp / this.maxHp) * 100; }
  isCharged()  { return false; }
}

/* =========================================================================
   MultiplayerBattleScene
   ========================================================================= */
export class MultiplayerBattleScene {
  constructor(game) {
    this.game   = game;
    this.el     = document.getElementById('mp-battle-screen');
    this.canvas = document.getElementById('mp-battle-canvas');
    this.app    = null;

    this.myHero        = null;
    this.opponentProxy = null;

    /** @type {import('peerjs').DataConnection | null} */
    this.conn    = null;
    this.running = false;
    this.paused  = false;

    this._dmgNumbers = [];
    this._resizeHandler = () => this._onResize();

    this._initPixi();
    this._setupButtons();
  }

  /* ================================================================
     Pixi.js setup
     ================================================================ */
  _initPixi() {
    this.app = new PIXI.Application({
      view:            this.canvas,
      width:           window.innerWidth,
      height:          window.innerHeight,
      backgroundColor: 0x0d0d1a,
      antialias:       true,
      resolution:      window.devicePixelRatio || 1,
      autoDensity:     true,
    });

    this._layerBg      = new PIXI.Container();
    this._layerChars   = new PIXI.Container();
    this._layerFx      = new PIXI.Container();
    this._layerDmgNums = new PIXI.Container();

    this.app.stage.addChild(
      this._layerBg, this._layerChars, this._layerFx, this._layerDmgNums,
    );

    this._bgGfx     = new PIXI.Graphics(); this._layerBg.addChild(this._bgGfx);
    this._heroGfx   = new PIXI.Graphics(); this._layerChars.addChild(this._heroGfx);
    this._oppGfx    = new PIXI.Graphics(); this._layerChars.addChild(this._oppGfx);

    this._drawBackground();

    this.app.ticker.add(() => {
      const dt = this.app.ticker.deltaMS / 1000;
      if (this.running && !this.paused) this._update(dt);
      this._renderCharacters();
      this._updateDmgNumbers(dt);
    });

    window.addEventListener('resize', this._resizeHandler);
  }

  /* ================================================================
     Background (same style as BattleScene)
     ================================================================ */
  _drawBackground() {
    const g = this._bgGfx;
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const groundY = H * 0.68;

    g.clear();

    const skyBands = [
      [0,    0x0d0d1a],
      [0.25, 0x111130],
      [0.5,  0x152248],
      [0.68, 0x0b1830],
    ];
    for (let i = 0; i < skyBands.length - 1; i++) {
      const [t0, c0] = skyBands[i];
      const [t1]     = skyBands[i + 1];
      g.beginFill(c0);
      g.drawRect(0, H * t0, W, H * (t1 - t0) + 1);
      g.endFill();
    }

    g.beginFill(0x07071a);
    g.drawRect(0, groundY, W, H - groundY);
    g.endFill();

    g.lineStyle(2, 0x2a2a5a, 0.8);
    g.moveTo(0, groundY);
    g.lineTo(W, groundY);

    g.lineStyle(0);
    for (let i = 0; i < 6; i++) {
      const x = (W / 6) * i + W / 12;
      const pilH = 80 + Math.sin(i * 1.5) * 30;
      g.beginFill(0x0f0f2a);
      g.drawRect(x - 10, groundY - pilH, 20, pilH);
      g.endFill();
    }
  }

  _onResize() {
    if (!this.app) return;
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
    this._drawBackground();
  }

  /* ================================================================
     Character rendering
     ================================================================ */
  _renderCharacters() {
    this._drawMyHero();
    this._drawOpponent();
  }

  /** Draw my hero (blue) on the left – identical to BattleScene._drawHero */
  _drawMyHero() {
    const g = this.myHero ? this._heroGfx : null;
    if (!g) return;

    g.clear();
    const hero    = this.myHero;
    const W       = this.app.screen.width;
    const H       = this.app.screen.height;
    const groundY = H * 0.68;
    const scale   = Math.min(W, H) / 700;
    const S       = 60 * scale;

    const cx = W * 0.22;
    const cy = groundY;

    const atk       = hero.isAttacking ? 18 * scale : 0;
    const hurtShake = hero.isHurt ? Math.sin(Date.now() / 30) * 6 * scale : 0;
    const bob       = Math.sin(Date.now() / 500) * 3 * scale;
    const ox = cx + atk + hurtShake;
    const oy = cy + bob;

    const bodyColor = hero.isDefending ? 0x2980b9 : 0x4a90d9;

    if (hero.isCharged()) {
      g.lineStyle(3, 0xf5a623, 0.7 + 0.3 * Math.sin(Date.now() / 150));
      g.drawCircle(ox, oy - S * 0.7, S * 0.85);
    }

    g.lineStyle(0);
    g.beginFill(0x2c3e50);
    g.drawRect(ox - S * 0.28, oy - S * 0.38, S * 0.22, S * 0.38);
    g.drawRect(ox + S * 0.06, oy - S * 0.38, S * 0.22, S * 0.38);
    g.endFill();

    g.beginFill(bodyColor);
    g.drawRoundedRect(ox - S * 0.38, oy - S * 1.05, S * 0.76, S * 0.67, 5 * scale);
    g.endFill();

    if (hero.isDefending) {
      g.beginFill(0x3498db, 0.85);
      g.drawRoundedRect(ox - S * 0.60, oy - S, S * 0.28, S * 0.55, 4 * scale);
      g.endFill();
      g.lineStyle(1.5, 0x85c1e9);
      g.drawRoundedRect(ox - S * 0.60, oy - S, S * 0.28, S * 0.55, 4 * scale);
    }

    g.lineStyle(0);
    g.beginFill(0xaeb6bf);
    g.drawRect(ox + S * 0.35, oy - S * 1.1, 3 * scale, S * 0.72);
    g.endFill();
    g.beginFill(0x7f8c8d);
    g.drawRect(ox + S * 0.26, oy - S * 0.63, 20 * scale, 4 * scale);
    g.endFill();

    g.beginFill(0xf5cba7);
    g.drawCircle(ox, oy - S * 1.05, S * 0.21);
    g.endFill();

    g.beginFill(0x566573);
    g.drawRect(ox - S * 0.22, oy - S * 1.28, S * 0.44, S * 0.24);
    g.endFill();
  }

  /** Draw opponent hero (orange/red) on the right, mirrored. */
  _drawOpponent() {
    const g   = this.opponentProxy ? this._oppGfx : null;
    if (!g || !this.opponentProxy?.isAlive()) { if (g) g.clear(); return; }

    g.clear();
    const opp     = this.opponentProxy;
    const W       = this.app.screen.width;
    const H       = this.app.screen.height;
    const groundY = H * 0.68;
    const scale   = Math.min(W, H) / 700;
    const S       = 60 * scale;

    const cx = W * 0.78;
    const cy = groundY;

    const atk       = opp.isAttacking ? -18 * scale : 0;
    const hurtShake = opp.isHurt ? Math.sin(Date.now() / 30) * 6 * scale : 0;
    const bob       = Math.sin(Date.now() / 500 + 1) * 3 * scale;
    const ox = cx + atk + hurtShake;
    const oy = cy + bob;

    const bodyColor = opp.isDefending ? 0xc0392b : 0xe05020;

    if (opp.isDefending) {
      g.lineStyle(3, 0xf5a623, 0.7 + 0.3 * Math.sin(Date.now() / 150));
      g.drawCircle(ox, oy - S * 0.7, S * 0.85);
    }

    g.lineStyle(0);
    g.beginFill(0x4a2c2a);
    g.drawRect(ox - S * 0.28, oy - S * 0.38, S * 0.22, S * 0.38);
    g.drawRect(ox + S * 0.06, oy - S * 0.38, S * 0.22, S * 0.38);
    g.endFill();

    g.beginFill(bodyColor);
    g.drawRoundedRect(ox - S * 0.38, oy - S * 1.05, S * 0.76, S * 0.67, 5 * scale);
    g.endFill();

    if (opp.isDefending) {
      g.beginFill(0xe74c3c, 0.85);
      g.drawRoundedRect(ox + S * 0.32, oy - S, S * 0.28, S * 0.55, 4 * scale);
      g.endFill();
      g.lineStyle(1.5, 0xf1948a);
      g.drawRoundedRect(ox + S * 0.32, oy - S, S * 0.28, S * 0.55, 4 * scale);
    }

    // Sword (flipped to left side)
    g.lineStyle(0);
    g.beginFill(0xaeb6bf);
    g.drawRect(ox - S * 0.38, oy - S * 1.1, 3 * scale, S * 0.72);
    g.endFill();
    g.beginFill(0x7f8c8d);
    g.drawRect(ox - S * 0.46, oy - S * 0.63, 20 * scale, 4 * scale);
    g.endFill();

    g.beginFill(0xf5cba7);
    g.drawCircle(ox, oy - S * 1.05, S * 0.21);
    g.endFill();

    g.beginFill(0x922b21);
    g.drawRect(ox - S * 0.22, oy - S * 1.28, S * 0.44, S * 0.24);
    g.endFill();
  }

  /* ================================================================
     Floating damage numbers
     ================================================================ */
  _spawnDmgNumber(x, y, value, color, isHeal = false) {
    const style = new PIXI.TextStyle({
      fontSize: 28, fontWeight: 'bold',
      fill: color, stroke: 0x000000, strokeThickness: 4,
      dropShadow: true, dropShadowAlpha: 0.5, dropShadowBlur: 3, dropShadowDistance: 2,
    });
    const text     = new PIXI.Text((isHeal ? '+' : '-') + value, style);
    text.anchor.set(0.5);
    text.x         = x + (Math.random() - 0.5) * 40;
    text.y         = y - 20;
    text._vy       = -(90 + Math.random() * 30);
    text._life     = 0;
    text._maxLife  = 1.2;
    this._layerDmgNums.addChild(text);
    this._dmgNumbers.push(text);
  }

  _updateDmgNumbers(dt) {
    for (let i = this._dmgNumbers.length - 1; i >= 0; i--) {
      const t = this._dmgNumbers[i];
      t._life += dt;
      t.y     += t._vy * dt;
      t._vy   *= (1 - 3 * dt);
      t.alpha  = 1 - (t._life / t._maxLife);
      t.scale.set(0.9 + 0.1 * (t._life / t._maxLife));
      if (t._life >= t._maxLife) {
        this._layerDmgNums.removeChild(t);
        this._dmgNumbers.splice(i, 1);
      }
    }
  }

  /* ================================================================
     PeerJS data channel
     ================================================================ */
  _send(msg) {
    if (this.conn && this.conn.open) {
      try { this.conn.send(msg); } catch (_) {}
    }
  }

  _onData(msg) {
    if (!this.running) return;

    switch (msg.type) {
      case 'hit': {
        // Opponent attacked me – apply damage directly (bypassing def, already factored)
        const dmg = Math.max(1, msg.dmg);
        this.myHero.hp        = Math.max(0, this.myHero.hp - dmg);
        this.myHero.isHurt    = true;
        this.myHero.hurtTimer = 0.3;
        this.opponentProxy.isAttacking = true;
        this.opponentProxy.attackTimer = 0.4;
        this._log(`對手攻擊我的英雄，造成 ${dmg} 傷害！`, 'log-enemy');
        this._spawnDmgNumber(
          this.app.screen.width * 0.22, this.app.screen.height * 0.45, dmg, 0xff8800,
        );
        // Confirm our HP back to peer
        this._send({ type: 'hp_sync', hp: this.myHero.hp });
        break;
      }
      case 'hp_sync': {
        // Correct the opponent proxy's HP (peer sends their own HP)
        if (typeof msg.hp === 'number') {
          this.opponentProxy.hp    = Math.max(0, msg.hp);
          this.opponentProxy.maxHp = Math.max(this.opponentProxy.maxHp, msg.hp);
        }
        break;
      }
      case 'defend': {
        this.opponentProxy.isDefending = true;
        this._log('對手進入防禦姿態！', 'log-enemy');
        break;
      }
      case 'dead': {
        // Opponent died → I win
        this._endGame(true);
        break;
      }
    }
  }

  /* ================================================================
     Battle lifecycle
     ================================================================ */
  startBattle() {
    this.running = true;
    this.paused  = false;

    const xml     = Storage.loadWorkspaceXml();
    const program = getActionProgramFromXml(xml);

    this.myHero = new Hero();
    this.myHero.setProgram(program);

    const self = this;
    this.opponentProxy = new OpponentProxy((msg) => self._send(msg));

    // Wire data channel
    if (this.conn) {
      this.conn.on('data', (msg) => this._onData(msg));
      this.conn.on('close', () => {
        if (this.running) {
          this._log('⚠️ 連線已中斷。', 'log-system');
          this.running = false;
        }
      });
      // Tell the peer we're ready
      this._send({ type: 'ready' });
    }

    document.getElementById('mp-battle-log-inner').innerHTML = '';
    document.getElementById('mp-result-overlay').classList.add('hidden');
    document.getElementById('mp-btn-pause').textContent = '⏸ 暫停';

    this._updateUI();
    this._log('⚔️ 對戰開始！', 'log-wave');
  }

  _endGame(iWon) {
    if (!this.running) return;
    this.running = false;

    if (!iWon) {
      this._send({ type: 'dead' });
    }

    const title = document.getElementById('mp-result-title');
    const msg   = document.getElementById('mp-result-msg');
    if (iWon) {
      title.textContent = '🏆 勝利！';
      title.style.color = '#f5a623';
      msg.textContent   = '你的英雄戰勝了對手！';
    } else {
      title.textContent = '💀 失敗';
      title.style.color = '#e94560';
      msg.textContent   = '你的英雄倒下了…';
    }
    document.getElementById('mp-result-overlay').classList.remove('hidden');
  }

  /* ================================================================
     Core update loop
     ================================================================ */
  _update(dt) {
    this.myHero.update(dt);
    this.opponentProxy.update(dt);

    // My hero action
    if (this.myHero.isCharged() && this.opponentProxy.isAlive()) {
      const res = this.myHero.executeAction(this.opponentProxy);

      if (res.type === 'damage') {
        const cls = 'log-hero';
        this._log(res.message, cls);
        this._spawnDmgNumber(
          this.app.screen.width * 0.78, this.app.screen.height * 0.45,
          res.value, 0xff4444,
        );
      } else if (res.type === 'heal') {
        this._log(res.message, 'log-heal');
        this._spawnDmgNumber(
          this.app.screen.width * 0.22, this.app.screen.height * 0.45,
          res.value, 0x2ecc71, true,
        );
        // Sync our HP after healing
        this._send({ type: 'hp_sync', hp: this.myHero.hp });
      } else if (res.type === 'defend') {
        this._log(res.message, 'log-hero');
        this._send({ type: 'defend' });
      }
    }

    // Check hero death
    if (!this.myHero.isAlive()) {
      this._endGame(false);
    }

    // Check opponent death (local proxy)
    if (!this.opponentProxy.isAlive()) {
      // We'll confirm via 'dead' from peer, but show optimistic win
      this._endGame(true);
    }

    this._updateUI();
  }

  /* ================================================================
     UI updates
     ================================================================ */
  _updateUI() {
    if (!this.myHero || !this.opponentProxy) return;

    // My hero HP
    const heroHpPct = this.myHero.getHpPct();
    const heroHpBar = document.getElementById('mp-hero-hp-bar');
    heroHpBar.style.width = heroHpPct + '%';
    heroHpBar.className   = 'bar-fill hp-hero' +
      (heroHpPct < 25 ? ' hp-low' : heroHpPct < 50 ? ' hp-medium' : '');
    document.getElementById('mp-hero-hp-text').textContent =
      `${Math.ceil(this.myHero.hp)}/${this.myHero.maxHp}`;

    // My hero charge
    document.getElementById('mp-hero-charge-bar').style.width =
      this.myHero.getChargePct() + '%';

    // My hero next-action label
    const actionDef = ACTION_DEFS[this.myHero.getCurrentAction()];
    document.getElementById('mp-hero-action-label').textContent =
      actionDef ? `準備：${actionDef.label}` : '';

    // Opponent HP
    const oppHpPct = this.opponentProxy.getHpPct();
    const oppHpBar = document.getElementById('mp-opp-hp-bar');
    oppHpBar.style.width = oppHpPct + '%';
    document.getElementById('mp-opp-hp-text').textContent =
      `${Math.ceil(this.opponentProxy.hp)}/${this.opponentProxy.maxHp}`;

    document.getElementById('mp-opp-action-label').textContent =
      this.opponentProxy.isDefending ? '🛡️ 防禦中' : '';
  }

  /* ================================================================
     Battle log
     ================================================================ */
  _log(message, cssClass = 'log-system') {
    const container = document.getElementById('mp-battle-log-inner');
    const entry     = document.createElement('div');
    entry.className = `log-entry ${cssClass}`;
    entry.textContent = message;
    container.appendChild(entry);

    while (container.children.length > LOG_MAX) {
      container.removeChild(container.firstChild);
    }
    container.scrollTop = container.scrollHeight;
  }

  /* ================================================================
     Button wiring
     ================================================================ */
  _setupButtons() {
    document.getElementById('mp-btn-pause').addEventListener('click', () => {
      this.paused = !this.paused;
      document.getElementById('mp-btn-pause').textContent =
        this.paused ? '▶ 繼續' : '⏸ 暫停';
    });

    document.getElementById('mp-btn-forfeit').addEventListener('click', () => {
      if (window.confirm('確定要放棄這場對戰嗎？')) {
        this.running = false;
        this.game.goToMpLobby();
      }
    });

    document.getElementById('mp-btn-to-lobby').addEventListener('click', () => {
      this.running = false;
      this.game.goToMpLobby();
    });

    document.getElementById('mp-btn-edit').addEventListener('click', () => {
      this.running = false;
      this.game.goToBlockly();
    });

    document.getElementById('mp-btn-to-title').addEventListener('click', () => {
      this.running = false;
      this.game.goToTitle();
    });
  }

  /* ================================================================
     Lifecycle
     ================================================================ */
  show() {
    this.el.classList.add('active');
    // conn is set on the game object before show() is called
    this.conn = this.game._mpConn;
    this.startBattle();
    this.app.ticker.start();
  }

  hide() {
    this.el.classList.remove('active');
    this.running = false;
    // Clear any stale data listeners from old connections
    if (this.conn) {
      try { this.conn.removeAllListeners?.('data'); } catch (_) {}
    }
    this.conn = null;
  }

  destroy() {
    window.removeEventListener('resize', this._resizeHandler);
    this.app.destroy(false);
  }
}
