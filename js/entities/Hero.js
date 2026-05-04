import { ACTION_DEFS } from '../utils/BlocklyConfig.js';

/**
 * Hero – player-controlled character.
 * Charge-to-action mechanic: charge fills over time; when it reaches
 * chargeRequired for the current block, the action fires and charge resets.
 */
export class Hero {
  constructor() {
    this.name    = '英雄';
    this.maxHp   = 100;
    this.hp      = 100;
    this.atk     = 20;
    this.def     = 5;
    /** units of charge gained per second */
    this.chargeRate = 40;

    /** Sequence of action keys from Blockly */
    this.actions      = ['hero_attack'];
    this.actionIndex  = 0;

    /** Current charge amount (0 → chargeRequired) */
    this.currentCharge   = 0;
    this.chargeRequired  = ACTION_DEFS['hero_attack'].chargeRequired;

    // Status modifiers
    this.isDefending   = false;  // reduces next incoming damage by 50 %
    this.defendStacks  = 0;      // number of incoming hits before guard expires

    // Visual flags
    this.isAttacking = false;
    this.attackTimer = 0;
    this.isHurt      = false;
    this.hurtTimer   = 0;
  }

  /** Replace action sequence (call before battle start). */
  setActions(actions) {
    this.actions          = (actions && actions.length > 0) ? actions : ['hero_attack'];
    this.actionIndex      = 0;
    this.currentCharge    = 0;
    this._syncChargeRequired();
  }

  _syncChargeRequired() {
    const def = ACTION_DEFS[this.actions[this.actionIndex % this.actions.length]];
    this.chargeRequired = def ? def.chargeRequired : 50;
  }

  getCurrentAction() {
    return this.actions[this.actionIndex % this.actions.length];
  }

  /** Advance charge by dt seconds. */
  update(dt) {
    this.currentCharge = Math.min(this.currentCharge + this.chargeRate * dt, this.chargeRequired);

    if (this.isAttacking && (this.attackTimer -= dt) <= 0) this.isAttacking = false;
    if (this.isHurt      && (this.hurtTimer  -= dt) <= 0) this.isHurt      = false;
  }

  /** True when charge is full and action can fire. */
  isCharged() {
    return this.currentCharge >= this.chargeRequired;
  }

  /** Fire the current action; returns a result descriptor. */
  executeAction(enemy) {
    const actionKey = this.getCurrentAction();
    this.currentCharge  = 0;
    this.isAttacking    = true;
    this.attackTimer    = 0.4;

    const result = { actionKey, actor: 'hero', type: 'misc', message: '' };

    switch (actionKey) {
      case 'hero_attack': {
        const dmg = Math.max(1, this.atk - enemy.def);
        enemy.takeDamage(dmg);
        result.type    = 'damage';
        result.value   = dmg;
        result.message = `英雄普通攻擊 ${enemy.name}，造成 ${dmg} 傷害！`;
        break;
      }
      case 'hero_power_attack': {
        const dmg = Math.max(1, this.atk * 2 - enemy.def);
        enemy.takeDamage(dmg);
        result.type    = 'damage';
        result.value   = dmg;
        result.message = `英雄強力攻擊！對 ${enemy.name} 造成 ${dmg} 傷害！`;
        break;
      }
      case 'hero_quick_attack': {
        const dmg = Math.max(1, Math.ceil(this.atk * 0.6) - Math.floor(enemy.def * 0.5));
        enemy.takeDamage(dmg);
        result.type    = 'damage';
        result.value   = dmg;
        result.message = `英雄快速攻擊！造成 ${dmg} 傷害！`;
        break;
      }
      case 'hero_defend': {
        this.isDefending  = true;
        this.defendStacks = 2;
        result.type    = 'defend';
        result.message = '英雄進入防禦姿態！下次受到的傷害減半。';
        break;
      }
      case 'hero_heal': {
        const amt = Math.floor(this.maxHp * 0.2);
        this.hp    = Math.min(this.maxHp, this.hp + amt);
        result.type    = 'heal';
        result.value   = amt;
        result.message = `英雄治療，恢復 ${amt} HP！`;
        break;
      }
      default:
        result.message = '英雄行動…';
    }

    // Advance action pointer
    this.actionIndex = (this.actionIndex + 1) % this.actions.length;
    this._syncChargeRequired();

    return result;
  }

  /** Accept incoming damage; returns actual damage taken. */
  takeDamage(rawDamage) {
    let dmg = Math.max(1, rawDamage - this.def);
    if (this.isDefending) {
      dmg = Math.ceil(dmg * 0.5);
      this.defendStacks--;
      if (this.defendStacks <= 0) this.isDefending = false;
    }
    this.hp       = Math.max(0, this.hp - dmg);
    this.isHurt   = true;
    this.hurtTimer = 0.3;
    return dmg;
  }

  isAlive()        { return this.hp > 0; }
  getHpPct()       { return (this.hp / this.maxHp) * 100; }
  getChargePct()   { return this.chargeRequired > 0 ? (this.currentCharge / this.chargeRequired) * 100 : 100; }
}
