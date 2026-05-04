/**
 * TitleScene – animated star-field title screen powered by Pixi.js.
 */
export class TitleScene {
  constructor(game) {
    this.game  = game;
    this.el    = document.getElementById('title-screen');
    this.app   = null;
    this.stars = [];
    this._resizeHandler = () => this._onResize();
    this._initPixi();
    this._setupButtons();
  }

  /* ---- Pixi setup ---- */
  _initPixi() {
    const canvas = document.getElementById('title-canvas');
    this.app = new PIXI.Application({
      view:             canvas,
      width:            window.innerWidth,
      height:           window.innerHeight,
      backgroundAlpha:  0,
      antialias:        true,
      resolution:       window.devicePixelRatio || 1,
      autoDensity:      true,
    });

    this._buildStarfield();
    this._buildFloatingParticles();
    this.app.ticker.add(() => this._tick());
    window.addEventListener('resize', this._resizeHandler);
  }

  _buildStarfield() {
    const { width, height } = this.app.screen;
    const container = new PIXI.Container();
    this.app.stage.addChild(container);
    this._starContainer = container;

    for (let i = 0; i < 180; i++) {
      const g = new PIXI.Graphics();
      const r = Math.random() * 1.6 + 0.3;
      const alpha = Math.random() * 0.75 + 0.2;
      g.beginFill(0xffffff, alpha);
      g.drawCircle(0, 0, r);
      g.endFill();
      g.x = Math.random() * width;
      g.y = Math.random() * height;
      g._speed  = Math.random() * 18 + 4;
      g._phase  = Math.random() * Math.PI * 2;
      g._baseAlpha = alpha;
      container.addChild(g);
      this.stars.push(g);
    }
  }

  _buildFloatingParticles() {
    const container = new PIXI.Container();
    this.app.stage.addChild(container);
    this._particleContainer = container;
    this._particles = [];

    const colors = [0xe94560, 0xf5a623, 0x4fc3f7, 0x2ecc71];
    for (let i = 0; i < 30; i++) {
      const g = new PIXI.Graphics();
      const color = colors[Math.floor(Math.random() * colors.length)];
      const r = Math.random() * 3 + 1;
      g.beginFill(color, Math.random() * 0.5 + 0.2);
      g.drawCircle(0, 0, r);
      g.endFill();
      g.x = Math.random() * window.innerWidth;
      g.y = Math.random() * window.innerHeight;
      g._vx = (Math.random() - 0.5) * 25;
      g._vy = -(Math.random() * 30 + 10);
      g._life = Math.random();
      container.addChild(g);
      this._particles.push(g);
    }
  }

  _tick() {
    const t  = Date.now() / 1000;
    const dt = this.app.ticker.deltaMS / 1000;
    const { width, height } = this.app.screen;

    // Stars: gentle downward drift + twinkle
    for (const s of this.stars) {
      s.y += s._speed * dt;
      if (s.y > height) { s.y = 0; s.x = Math.random() * width; }
      s.alpha = s._baseAlpha * (0.5 + 0.5 * Math.sin(t * 1.8 + s._phase));
    }

    // Floating colour particles
    for (const p of this._particles) {
      p._life += dt * 0.4;
      p.x += p._vx * dt;
      p.y += p._vy * dt;
      p.alpha = Math.max(0, 1 - p._life);
      if (p._life >= 1) {
        p._life = 0;
        p.x = Math.random() * width;
        p.y = height + 10;
        p._vx = (Math.random() - 0.5) * 25;
        p._vy = -(Math.random() * 30 + 10);
      }
    }
  }

  _onResize() {
    if (!this.app) return;
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
  }

  /* ---- Button wiring ---- */
  _setupButtons() {
    document.getElementById('btn-start').addEventListener('click', () => {
      this.game.goToBattle();
    });
    document.getElementById('btn-edit-code').addEventListener('click', () => {
      this.game.goToBlockly();
    });
  }

  /* ---- Lifecycle ---- */
  show() {
    this.el.classList.add('active');
    this.app.ticker.start();
  }

  hide() {
    this.el.classList.remove('active');
    this.app.ticker.stop();
  }

  destroy() {
    window.removeEventListener('resize', this._resizeHandler);
    this.app.destroy(false);
  }
}
