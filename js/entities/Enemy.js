/**
 * Enemy – AI-controlled opponent.
 * Enemy type escalates with wave number; stats scale continuously.
 * Charge fills automatically; when full (100) the enemy attacks.
 */

const ENEMY_TYPES = [
  { name: '哥布林', icon: '👺', color: 0x2ecc71, baseHp:  50, baseAtk:  8, baseDef: 1, baseRate: 22 },
  { name: '獸 人', icon: '👹', color: 0xe67e22, baseHp: 100, baseAtk: 15, baseDef: 4, baseRate: 20 },
  { name: '骷髏兵', icon: '💀', color: 0xbdc3c7, baseHp:  80, baseAtk: 20, baseDef: 0, baseRate: 32 },
  { name: '巨 魔', icon: '🗿', color: 0x7f8c8d, baseHp: 180, baseAtk: 22, baseDef: 8, baseRate: 18 },
  { name: '黑暗法師', icon: '🧙', color: 0x8e44ad, baseHp: 130, baseAtk: 28, baseDef: 3, baseRate: 25 },
  { name: '龍',   icon: '🐉', color: 0xe74c3c, baseHp: 280, baseAtk: 35, baseDef: 12, baseRate: 16 },
];

export class Enemy {
  /**
   * @param {number} wave  1-based wave number
   */
  constructor(wave) {
    const typeIndex = Math.min(Math.floor((wave - 1) / 2), ENEMY_TYPES.length - 1);
    const t = ENEMY_TYPES[typeIndex];
    const m = 1 + (wave - 1) * 0.3;   // hp   multiplier per wave
    const a = 1 + (wave - 1) * 0.18;  // atk  multiplier
    const r = 1 + (wave - 1) * 0.04;  // rate multiplier (enemies speed up)

    this.wave  = wave;
    this.name  = t.name;
    this.icon  = t.icon;
    this.color = t.color;

    this.maxHp     = Math.floor(t.baseHp  * m);
    this.hp        = this.maxHp;
    this.atk       = Math.floor(t.baseAtk * a);
    this.def       = Math.floor(t.baseDef * (1 + (wave - 1) * 0.07));
    this.chargeRate = t.baseRate * r;   // units per second (reaches 100 = attack)

    this.currentCharge = 0;

    // Visual flags
    this.isAttacking = false;
    this.attackTimer = 0;
    this.isHurt      = false;
    this.hurtTimer   = 0;
  }

  update(dt) {
    this.currentCharge = Math.min(100, this.currentCharge + this.chargeRate * dt);
    if (this.isAttacking && (this.attackTimer -= dt) <= 0) this.isAttacking = false;
    if (this.isHurt      && (this.hurtTimer  -= dt) <= 0) this.isHurt      = false;
  }

  isCharged() { return this.currentCharge >= 100; }

  /** Attack the hero; returns a result descriptor. */
  executeAttack(hero) {
    this.currentCharge  = 0;
    this.isAttacking    = true;
    this.attackTimer    = 0.4;

    const dmg = hero.takeDamage(this.atk);
    return {
      actor:   'enemy',
      type:    'damage',
      value:   dmg,
      message: `${this.name} 攻擊英雄，造成 ${dmg} 傷害！`,
    };
  }

  takeDamage(amount) {
    this.hp      = Math.max(0, this.hp - amount);
    this.isHurt  = true;
    this.hurtTimer = 0.3;
  }

  isAlive()      { return this.hp > 0; }
  getHpPct()     { return (this.hp / this.maxHp) * 100; }
  getChargePct() { return this.currentCharge; }
}
