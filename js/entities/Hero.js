import { ACTION_DEFS, executeProgram } from '../utils/BlocklyConfig.js';

/**
 * Hero – player-controlled character.
 * Charge-to-action mechanic: charge fills over time; when it reaches
 * chargeRequired for the current block-action the action fires and
 * charge resets.  The action sequence is driven by a generator that
 * walks the Blockly AST (supports repeat + if/else with HP conditions).
 *
 * Look-ahead design: the generator is advanced right after each action
 * fires, so chargeRequired is always correct for the NEXT pending action.
 * IF conditions are evaluated at that advance-point (end of the previous
 * action), which is accurate enough for this game's timing.
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

    /** Program AST from Blockly (array of nodes) */
    this.program = ['hero_attack'];

    /** Generator that yields the next action key */
    this._gen = null;
    /**
     * The next action key to execute (pre-fetched so chargeRequired
     * can be set in advance for the charge bar to display correctly).
     */
    this._pendingAction = 'hero_attack';
    /** Current enemy reference – kept current so IF conditions can read live HP. */
    this._currentEnemy  = null;

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

  /** Replace action sequence with a flat array (backward compat). */
  setActions(actions) {
    this.setProgram((actions && actions.length > 0) ? actions : ['hero_attack']);
  }

  /** Replace the program AST (call before battle start). */
  setProgram(program) {
    this.program        = (program && program.length > 0) ? program : ['hero_attack'];
    this._gen           = null;
    this._currentEnemy  = null;
    this.currentCharge  = 0;
    this._advanceGen();  // pre-fetch first action
  }

  /** Build a fresh generator over this.program. */
  _createGen() {
    const hero = this;
    return executeProgram(this.program, () => ({
      heroHp:      hero.hp,
      heroMaxHp:   hero.maxHp,
      heroHpPct:   (hero.hp / hero.maxHp) * 100,
      enemyHp:     hero._currentEnemy?.hp     ?? 0,
      enemyMaxHp:  hero._currentEnemy?.maxHp  ?? 1,
      enemyHpPct:  hero._currentEnemy
                     ? (hero._currentEnemy.hp / hero._currentEnemy.maxHp) * 100
                     : 100,
    }));
  }

  /**
   * Advance the generator by one step, storing the result in
   * _pendingAction and updating chargeRequired accordingly.
   * Restarts the generator if it has been exhausted.
   */
  _advanceGen() {
    if (!this._gen) this._gen = this._createGen();
    let result = this._gen.next();
    if (result.done) {
      this._gen  = this._createGen();
      result     = this._gen.next();
    }
    const key = result.done ? 'hero_attack' : (result.value || 'hero_attack');
    this._pendingAction = key;
    const def = ACTION_DEFS[key];
    this.chargeRequired = def ? def.chargeRequired : 50;
  }

  /** Returns the pending (next-to-fire) action key (used for the UI label). */
  getCurrentAction() {
    return this._pendingAction;
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

  /** Fire the pending action; returns a result descriptor. */
  executeAction(enemy) {
    this._currentEnemy  = enemy;
    const actionKey     = this._pendingAction;

    this.currentCharge = 0;
    this.isAttacking   = true;
    this.attackTimer   = 0.4;

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

    // Pre-fetch the next action so chargeRequired is ready immediately
    this._advanceGen();

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
