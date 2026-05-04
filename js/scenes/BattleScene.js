import { Hero }   from '../entities/Hero.js';
import { Enemy }  from '../entities/Enemy.js';
import { Storage } from '../utils/Storage.js';
import { ACTION_DEFS, getActionProgramFromXml } from '../utils/BlocklyConfig.js';

const LOG_MAX = 30;
/** Fraction of maxHp the hero recovers between waves. */
const WAVE_REGEN_PERCENT = 0.10;

/**
 * BattleScene – Endless-mode battle screen.
 *
 * Mechanic:  Both hero and enemy have a CHARGE bar that fills over time.
 *   Hero:    When charge reaches chargeRequired for the current block-action
 *            the action fires, charge resets, and the next block is loaded.
 *   Enemy:   When charge reaches 100, the enemy attacks and resets.
 *
 * Waves escalate continuously.  The game ends when the hero's HP reaches 0.
 */
export class BattleScene {
  constructor(game) {
    this.game   = game;
    this.el     = document.getElementById('battle-screen');
    this.canvas = document.getElementById('battle-canvas');
    this.app    = null;

    // Battle state
    this.hero     = null;
    this.enemy    = null;
    this.wave     = 1;
    this.score    = 0;
    this.running  = false;
    this.paused   = false;
    this.spawning = false;   // true while waiting before next wave

    this._dmgNumbers = [];   // floating damage number sprites
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

    // Layers (back → front)
    this._layerBg      = new PIXI.Container(); // background graphics
    this._layerChars   = new PIXI.Container(); // hero & enemy
    this._layerFx      = new PIXI.Container(); // hit-flash effects
    this._layerDmgNums = new PIXI.Container(); // floating damage numbers

    this.app.stage.addChild(this._layerBg, this._layerChars, this._layerFx, this._layerDmgNums);

    this._bgGfx    = new PIXI.Graphics(); this._layerBg.addChild(this._bgGfx);
    this._heroGfx  = new PIXI.Graphics(); this._layerChars.addChild(this._heroGfx);
    this._enemyGfx = new PIXI.Graphics(); this._layerChars.addChild(this._enemyGfx);

    this._drawBackground();

    // Ticker
    this.app.ticker.add(() => {
      const dt = this.app.ticker.deltaMS / 1000;
      if (this.running && !this.paused) this._update(dt);
      this._renderCharacters();
      this._updateDmgNumbers(dt);
    });

    window.addEventListener('resize', this._resizeHandler);
  }

  /* ================================================================
     Background
     ================================================================ */
  _drawBackground() {
    const g = this._bgGfx;
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const groundY = H * 0.68;

    g.clear();

    // Sky gradient strips
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

    // Ground
    g.beginFill(0x07071a);
    g.drawRect(0, groundY, W, H - groundY);
    g.endFill();

    // Ground edge
    g.lineStyle(2, 0x2a2a5a, 0.8);
    g.moveTo(0, groundY);
    g.lineTo(W, groundY);

    // Distant "pillars" decoration
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
    this._drawHero();
    this._drawEnemy();
  }

  _drawHero() {
    const g = this.hero ? this._heroGfx : null;
    if (!g) return;

    g.clear();
    const hero = this.hero;
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const groundY = H * 0.68;
    const scale   = Math.min(W, H) / 700;
    const S       = 60 * scale;

    const cx = W * 0.22;
    const cy = groundY;

    const atk = hero.isAttacking ? 18 * scale : 0;
    const hurtShake = hero.isHurt ? Math.sin(Date.now() / 30) * 6 * scale : 0;
    const bob  = Math.sin(Date.now() / 500) * 3 * scale;
    const ox = cx + atk + hurtShake;
    const oy = cy + bob;

    const bodyColor = hero.isDefending ? 0x2980b9 : 0x4a90d9;

    // Glow ring when charged
    if (hero.isCharged()) {
      g.lineStyle(3, 0xf5a623, 0.7 + 0.3 * Math.sin(Date.now() / 150));
      g.drawCircle(ox, oy - S * 0.7, S * 0.85);
    }

    // Legs
    g.lineStyle(0);
    g.beginFill(0x2c3e50);
    g.drawRect(ox - S * 0.28, oy - S * 0.38, S * 0.22, S * 0.38);
    g.drawRect(ox + S * 0.06, oy - S * 0.38, S * 0.22, S * 0.38);
    g.endFill();

    // Body
    g.beginFill(bodyColor);
    g.drawRoundedRect(ox - S * 0.38, oy - S * 1.05, S * 0.76, S * 0.67, 5 * scale);
    g.endFill();

    // Shield (when defending)
    if (hero.isDefending) {
      g.beginFill(0x3498db, 0.85);
      g.drawRoundedRect(ox - S * 0.60, oy - S, S * 0.28, S * 0.55, 4 * scale);
      g.endFill();
      g.lineStyle(1.5, 0x85c1e9);
      g.drawRoundedRect(ox - S * 0.60, oy - S, S * 0.28, S * 0.55, 4 * scale);
    }

    // Sword
    g.lineStyle(0);
    g.beginFill(0xaeb6bf);
    g.drawRect(ox + S * 0.35, oy - S * 1.1, 3 * scale, S * 0.72);
    g.endFill();
    // Guard
    g.beginFill(0x7f8c8d);
    g.drawRect(ox + S * 0.26, oy - S * 0.63, 20 * scale, 4 * scale);
    g.endFill();

    // Head
    g.beginFill(0xf5cba7);
    g.drawCircle(ox, oy - S * 1.05, S * 0.21);
    g.endFill();

    // Helmet
    g.beginFill(0x566573);
    g.drawRect(ox - S * 0.22, oy - S * 1.28, S * 0.44, S * 0.24);
    g.endFill();
  }

  _drawEnemy() {
    const g = this.enemy ? this._enemyGfx : null;
    if (!g || !this.enemy.isAlive()) { if (g) g.clear(); return; }

    g.clear();
    const enemy = this.enemy;
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const groundY = H * 0.68;
    const scale   = Math.min(W, H) / 700;
    const S       = 65 * scale;

    const cx = W * 0.78;
    const cy = groundY;

    const atk  = enemy.isAttacking ? -22 * scale : 0;
    const hurt  = enemy.isHurt ? Math.sin(Date.now() / 30) * 6 * scale : 0;
    const bob   = Math.sin(Date.now() / 480 + 1) * 3 * scale;
    const ox = cx + atk + hurt;
    const oy = cy + bob;

    const col = enemy.color;

    // Charge glow
    if (enemy.isCharged()) {
      g.lineStyle(3, 0xe74c3c, 0.7 + 0.3 * Math.sin(Date.now() / 120));
      g.drawCircle(ox, oy - S * 0.7, S * 0.9);
    }

    g.lineStyle(0);

    // Legs
    g.beginFill(this._darken(col, 0.6));
    g.drawRect(ox - S * 0.28, oy - S * 0.34, S * 0.24, S * 0.34);
    g.drawRect(ox + S * 0.04, oy - S * 0.34, S * 0.24, S * 0.34);
    g.endFill();

    // Body
    g.beginFill(col);
    g.drawRoundedRect(ox - S * 0.4, oy - S * 1.05, S * 0.8, S * 0.71, 5 * scale);
    g.endFill();

    // Arms
    g.beginFill(this._darken(col, 0.8));
    g.drawRect(ox - S * 0.65, oy - S * 0.98, S * 0.25, S * 0.52);
    g.drawRect(ox + S * 0.4,  oy - S * 0.98, S * 0.25, S * 0.52);
    g.endFill();

    // Head
    g.beginFill(col);
    g.drawCircle(ox, oy - S * 1.07, S * 0.26);
    g.endFill();

    // Eyes
    g.beginFill(0xff2020);
    g.drawCircle(ox - S * 0.09, oy - S * 1.12, 3 * scale);
    g.drawCircle(ox + S * 0.09, oy - S * 1.12, 3 * scale);
    g.endFill();

    // Weapon (axe / claws)
    g.beginFill(0x7f8c8d);
    g.drawRect(ox + S * 0.6, oy - S * 0.95, 4 * scale, S * 0.6);
    g.drawRect(ox + S * 0.55, oy - S * 0.95, 18 * scale, 4 * scale);
    g.endFill();
  }

  /** Multiply RGB channels of a 0xRRGGBB colour by factor. */
  _darken(hex, factor) {
    const r = Math.floor(((hex >> 16) & 0xff) * factor);
    const g = Math.floor(((hex >>  8) & 0xff) * factor);
    const b = Math.floor(( hex        & 0xff) * factor);
    return (r << 16) | (g << 8) | b;
  }

  /* ================================================================
     Floating damage numbers
     ================================================================ */
  _spawnDmgNumber(x, y, value, color, isHeal = false) {
    const style = new PIXI.TextStyle({
      fontSize:        28,
      fontWeight:      'bold',
      fill:            color,
      stroke:          0x000000,
      strokeThickness: 4,
      dropShadow:      true,
      dropShadowAlpha: 0.5,
      dropShadowBlur:  3,
      dropShadowDistance: 2,
    });
    const label = (isHeal ? '+' : '-') + value;
    const text  = new PIXI.Text(label, style);
    text.anchor.set(0.5);
    text.x = x + (Math.random() - 0.5) * 40;
    text.y = y - 20;
    text._vy   = -(90 + Math.random() * 30);
    text._life = 0;
    text._maxLife = 1.2;
    this._layerDmgNums.addChild(text);
    this._dmgNumbers.push(text);
  }

  _updateDmgNumbers(dt) {
    for (let i = this._dmgNumbers.length - 1; i >= 0; i--) {
      const t = this._dmgNumbers[i];
      t._life += dt;
      t.y += t._vy * dt;
      t._vy *= (1 - 3 * dt);           // decelerate
      t.alpha = 1 - (t._life / t._maxLife);
      t.scale.set(0.9 + 0.1 * (t._life / t._maxLife));
      if (t._life >= t._maxLife) {
        this._layerDmgNums.removeChild(t);
        this._dmgNumbers.splice(i, 1);
      }
    }
  }

  /* ================================================================
     Battle lifecycle
     ================================================================ */
  startBattle() {
    this.wave     = 1;
    this.score    = 0;
    this.running  = true;
    this.paused   = false;
    this.spawning = false;

    // Get action sequence from saved workspace
    const xml     = Storage.loadWorkspaceXml();
    const program = getActionProgramFromXml(xml);

    this.hero = new Hero();
    this.hero.setProgram(program);

    this.enemy = new Enemy(this.wave);

    // Clear log
    document.getElementById('battle-log-inner').innerHTML = '';
    document.getElementById('gameover-overlay').classList.add('hidden');
    document.getElementById('btn-pause').textContent = '⏸ 暫停';

    this._updateUI();
    this._log(`⚔️ 無盡模式開始！第 ${this.wave} 波：${this.enemy.icon} ${this.enemy.name} 出現！`, 'log-wave');
  }

  _spawnNextWave() {
    if (this.spawning) return;
    this.spawning = true;
    this._log(`✨ ${this.enemy.name} 被擊敗！獲得 ${this.wave * 100} 分！`, 'log-hero');
    this.score += this.wave * 100;

    setTimeout(() => {
      if (!this.running) return;
      this.wave++;
      this.enemy = new Enemy(this.wave);

      // Small HP recovery between waves (10 % of max)
      const regen = Math.floor(this.hero.maxHp * WAVE_REGEN_PERCENT);
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + regen);
      if (regen > 0) {
        this._log(`💚 波次間回復 ${regen} HP。`, 'log-heal');
      }

      this.spawning = false;
      this._updateUI();
      this._log(`🌊 第 ${this.wave} 波：${this.enemy.icon} ${this.enemy.name} 出現！HP ${this.enemy.maxHp}`, 'log-wave');
    }, 1800);
  }

  _endGame() {
    this.running = false;
    document.getElementById('go-wave').textContent  = this.wave;
    document.getElementById('go-score').textContent = this.score;
    document.getElementById('gameover-overlay').classList.remove('hidden');
    this._log('💀 英雄倒下了…', 'log-enemy');
  }

  /* ================================================================
     Core update loop
     ================================================================ */
  _update(dt) {
    this.hero.update(dt);

    // Only update enemy if it's alive and we're not between waves
    if (this.enemy.isAlive() && !this.spawning) {
      this.enemy.update(dt);
    }

    // Hero action
    if (this.hero.isCharged() && !this.spawning && this.enemy.isAlive()) {
      const res = this.hero.executeAction(this.enemy);
      const cls = res.type === 'heal' ? 'log-heal' : 'log-hero';
      this._log(res.message, cls);

      if (res.type === 'damage') {
        this._spawnDmgNumber(this.app.screen.width * 0.78, this.app.screen.height * 0.45, res.value, 0xff4444);
      } else if (res.type === 'heal') {
        this._spawnDmgNumber(this.app.screen.width * 0.22, this.app.screen.height * 0.45, res.value, 0x2ecc71, true);
      }
    }

    // Enemy action
    if (!this.spawning && this.enemy.isAlive() && this.enemy.isCharged() && this.hero.isAlive()) {
      const res = this.enemy.executeAttack(this.hero);
      this._log(res.message, 'log-enemy');
      if (res.type === 'damage') {
        this._spawnDmgNumber(this.app.screen.width * 0.22, this.app.screen.height * 0.45, res.value, 0xff8800);
      }
    }

    // Check enemy death
    if (!this.enemy.isAlive() && !this.spawning) {
      this._spawnNextWave();
    }

    // Check hero death
    if (!this.hero.isAlive()) {
      this._endGame();
    }

    this._updateUI();
  }

  /* ================================================================
     HTML UI updates (called every frame)
     ================================================================ */
  _updateUI() {
    if (!this.hero || !this.enemy) return;

    // Wave / score
    document.getElementById('wave-number').textContent    = `第 ${this.wave} 波`;
    document.getElementById('score-display').textContent  = `得分：${this.score}`;

    // Hero HP
    const heroHpPct = this.hero.getHpPct();
    const heroHpBar = document.getElementById('hero-hp-bar');
    heroHpBar.style.width = heroHpPct + '%';
    heroHpBar.className   = 'bar-fill hp-hero' +
      (heroHpPct < 25 ? ' hp-low' : heroHpPct < 50 ? ' hp-medium' : '');
    document.getElementById('hero-hp-text').textContent =
      `${Math.ceil(this.hero.hp)}/${this.hero.maxHp}`;

    // Hero charge
    document.getElementById('hero-charge-bar').style.width = this.hero.getChargePct() + '%';

    // Hero next-action label
    const actionDef = ACTION_DEFS[this.hero.getCurrentAction()];
    document.getElementById('hero-action-label').textContent =
      actionDef ? `準備：${actionDef.label}` : '';

    // Enemy HP
    const enemyHpPct = this.enemy.getHpPct();
    const enemyHpBar = document.getElementById('enemy-hp-bar');
    enemyHpBar.style.width = enemyHpPct + '%';
    document.getElementById('enemy-hp-text').textContent =
      `${Math.ceil(this.enemy.hp)}/${this.enemy.maxHp}`;
    document.getElementById('enemy-panel-title').textContent =
      `${this.enemy.icon} ${this.enemy.name}`;

    // Enemy charge
    document.getElementById('enemy-charge-bar').style.width = this.enemy.getChargePct() + '%';
    document.getElementById('enemy-action-label').textContent =
      this.enemy.isCharged() ? '⚡ 即將攻擊！' : '';
  }

  /* ================================================================
     Battle log
     ================================================================ */
  _log(message, cssClass = 'log-system') {
    const container = document.getElementById('battle-log-inner');
    const entry = document.createElement('div');
    entry.className = `log-entry ${cssClass}`;
    entry.textContent = message;
    container.appendChild(entry);

    // Prune old entries
    while (container.children.length > LOG_MAX) {
      container.removeChild(container.firstChild);
    }
    container.scrollTop = container.scrollHeight;
  }

  /* ================================================================
     Button wiring
     ================================================================ */
  _setupButtons() {
    document.getElementById('btn-pause').addEventListener('click', () => {
      this.paused = !this.paused;
      document.getElementById('btn-pause').textContent = this.paused ? '▶ 繼續' : '⏸ 暫停';
    });

    document.getElementById('btn-forfeit').addEventListener('click', () => {
      if (window.confirm('確定要放棄這場戰鬥嗎？')) {
        this.running = false;
        this.game.goToTitle();
      }
    });

    document.getElementById('btn-retry').addEventListener('click', () => {
      this.startBattle();
    });

    document.getElementById('btn-edit-post').addEventListener('click', () => {
      this.running = false;
      this.game.goToBlockly();
    });

    document.getElementById('btn-to-title').addEventListener('click', () => {
      this.running = false;
      this.game.goToTitle();
    });
  }

  /* ================================================================
     Lifecycle
     ================================================================ */
  show() {
    this.el.classList.add('active');
    this.startBattle();
    this.app.ticker.start();
  }

  hide() {
    this.el.classList.remove('active');
    this.running = false;
  }

  destroy() {
    window.removeEventListener('resize', this._resizeHandler);
    this.app.destroy(false);
  }
}
