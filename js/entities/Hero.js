import { ACTION_DEFS, executeProgram } from '../utils/BlocklyConfig.js';

// Elemental action tuning constants
const ICE_FREEZE_DURATION  = 3;    // seconds the freeze lasts
const ICE_FREEZE_RATE_MULT = 0.3;  // enemy chargeRate reduced to 30% of base (70% reduction)
const FIRE_BURN_DURATION   = 4;    // seconds the burn lasts
const FIRE_BURN_DPS_MULT   = 0.15; // burn deals this fraction of hero.atk per second
const THUNDER_DMG_MULT     = 1.8;  // damage multiplier for thunder strike
const THUNDER_DEF_MULT     = 0.4;  // fraction of enemy.def that applies (60 % ignored)

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
    this.chargeRate      = 40;
    this._baseChargeRate = 40;

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

    // Speed boost
    this.isSpeedBoosted  = false;
    this.speedBoostTimer = 0;    // seconds remaining

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
      heroHpPct:   hero.maxHp > 0 ? (hero.hp / hero.maxHp) * 100 : 0,
      heroAtk:     hero.atk,
      heroDef:     hero.def,
      enemyHp:     hero._currentEnemy?.hp     ?? 0,
      enemyMaxHp:  hero._currentEnemy?.maxHp  ?? 1,
      enemyHpPct:  (hero._currentEnemy && hero._currentEnemy.maxHp > 0)
                     ? (hero._currentEnemy.hp / hero._currentEnemy.maxHp) * 100
                     : 100,
      enemyAtk:    hero._currentEnemy?.atk ?? 0,
      enemyDef:    hero._currentEnemy?.def ?? 0,
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

    if (this.isSpeedBoosted) {
      this.speedBoostTimer -= dt;
      if (this.speedBoostTimer <= 0) {
        this.isSpeedBoosted = false;
        this.chargeRate     = this._baseChargeRate;
      }
    }

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
        this.defendStacks = 3;
        result.type    = 'defend';
        result.message = '英雄進入防禦姿態！接下來 3 次受到的傷害減少 50%！';
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
      case 'hero_speed_boost': {
        const duration = 5;
        this.isSpeedBoosted  = true;
        this.speedBoostTimer = duration;
        this.chargeRate      = this._baseChargeRate * 2.5;
        result.type    = 'speed_boost';
        result.message = `英雄進入快速充能狀態！攻擊速度提升 2.5 倍，持續 ${duration} 秒！`;
        break;
      }
      case 'hero_ice_attack': {
        const dmg = Math.max(1, this.atk - enemy.def);
        enemy.takeDamage(dmg);
        enemy.applyFreeze?.(ICE_FREEZE_DURATION, ICE_FREEZE_RATE_MULT);
        result.type    = 'damage';
        result.value   = dmg;
        result.element = 'ice';
        result.message = `英雄冰凍打擊 ${enemy.name}，造成 ${dmg} 傷害並凍結 ${ICE_FREEZE_DURATION} 秒！`;
        break;
      }
      case 'hero_fire_attack': {
        const dmg = Math.max(1, Math.floor(this.atk * 0.8) - enemy.def);
        enemy.takeDamage(dmg);
        enemy.applyBurn?.(FIRE_BURN_DURATION, this.atk * FIRE_BURN_DPS_MULT);
        result.type    = 'damage';
        result.value   = dmg;
        result.element = 'fire';
        result.message = `英雄火焰攻擊 ${enemy.name}，造成 ${dmg} 傷害並點燃 ${FIRE_BURN_DURATION} 秒！`;
        break;
      }
      case 'hero_thunder_attack': {
        const dmg = Math.max(1, Math.floor(this.atk * THUNDER_DMG_MULT) - Math.floor(enemy.def * THUNDER_DEF_MULT));
        enemy.takeDamage(dmg);
        result.type    = 'damage';
        result.value   = dmg;
        result.element = 'thunder';
        result.message = `英雄雷電打擊 ${enemy.name}，穿透防禦造成 ${dmg} 傷害！`;
        break;
      }
      default:
        result.message = '英雄行動…';
    }

    // Pre-fetch the next action so chargeRequired is ready immediately
    this._advanceGen();

    return result;
  }

  /** Accept incoming damage; returns actual damage taken plus defend info. */
  takeDamage(rawDamage) {
    let dmg = Math.max(1, rawDamage - this.def);
    let wasDefended   = false;
    let blockedAmount = 0;
    if (this.isDefending) {
      const reduced  = Math.ceil(dmg * 0.5);
      blockedAmount  = dmg - reduced;
      dmg            = reduced;
      wasDefended    = true;
      this.defendStacks--;
      if (this.defendStacks <= 0) this.isDefending = false;
    }
    this.hp       = Math.max(0, this.hp - dmg);
    this.isHurt   = true;
    this.hurtTimer = 0.3;
    return { dmg, wasDefended, blockedAmount };
  }

  isAlive()        { return this.hp > 0; }
  getHpPct()       { return (this.hp / this.maxHp) * 100; }
  getChargePct()   { return this.chargeRequired > 0 ? (this.currentCharge / this.chargeRequired) * 100 : 100; }
}
