/**
 * BlocklyConfig.js
 *   - Custom hero-action block definitions
 *   - Character stat value block definitions
 *   - Toolbox XML
 *   - Helpers to extract the action program (AST) from the workspace
 */

/** Action definitions shared between Blockly and the battle engine. */
export const ACTION_DEFS = {
  hero_attack: {
    label:         '⚔️ 普通攻擊',
    color:         0,        // Blockly hue
    chipColor:     '#c0392b',
    chargeRequired: 50,
    description:   '對敵人造成普通傷害（集氣：50）',
  },
  hero_power_attack: {
    label:         '💥 強力攻擊',
    color:         30,
    chipColor:     '#e67e22',
    chargeRequired: 100,
    description:   '造成 2× 傷害（集氣：100）',
  },
  hero_quick_attack: {
    label:         '🗡️ 快速攻擊',
    color:         15,
    chipColor:     '#e74c3c',
    chargeRequired: 25,
    description:   '造成 0.6× 傷害，速度快（集氣：25）',
  },
  hero_defend: {
    label:         '🛡️ 防禦姿態',
    color:         210,
    chipColor:     '#2980b9',
    chargeRequired: 30,
    description:   '使下次受到的傷害減半（集氣：30）',
  },
  hero_heal: {
    label:         '💊 治療',
    color:         120,
    chipColor:     '#27ae60',
    chargeRequired: 80,
    description:   '恢復 20% 最大 HP（集氣：80）',
  },
};

/** Valid action block types as a Set for fast lookup. */
const VALID_ACTIONS = new Set(Object.keys(ACTION_DEFS));

/** Maximum number of iterations the repeat block is allowed to unroll. */
const MAX_REPEAT_COUNT = 20;

/**
 * HP value block type → runtime value expression type.
 * These blocks output a Number and can be used as condition inputs.
 * Kept for backward compatibility with saved workspace XML.
 */
const HP_BLOCK_MAP = {
  hero_get_hp:     'hero_hp',
  hero_get_hp_pct: 'hero_hp_pct',
  hero_get_max_hp: 'hero_max_hp',
  enemy_get_hp:    'enemy_hp',
  enemy_get_hp_pct:'enemy_hp_pct',
  enemy_get_max_hp:'enemy_max_hp',
};

/**
 * Combined character-stat block: maps (CHAR, STAT) dropdown values to
 * the runtime value-expression type string.
 */
function _charStatToValueType(char, stat) {
  const prefix = char === 'HERO' ? 'hero' : 'enemy';
  const suffixMap = {
    HP:     'hp',
    HP_PCT: 'hp_pct',
    MAX_HP: 'max_hp',
    ATK:    'atk',
    DEF:    'def',
  };
  return `${prefix}_${suffixMap[stat] || 'hp'}`;
}

/* ------------------------------------------------------------------
   Toolbox XML (Blockly v9 – XML format still supported)
   ------------------------------------------------------------------ */
export const TOOLBOX_XML = `
<xml id="toolbox">
  <category name="⚔️ 攻擊" colour="0">
    <block type="hero_attack"></block>
    <block type="hero_power_attack"></block>
    <block type="hero_quick_attack"></block>
  </category>
  <category name="🛡️ 防禦" colour="210">
    <block type="hero_defend"></block>
  </category>
  <category name="💊 輔助" colour="120">
    <block type="hero_heal"></block>
  </category>
  <category name="🔢 數值" colour="160">
    <block type="get_character_stat">
      <field name="CHAR">HERO</field>
      <field name="STAT">HP_PCT</field>
    </block>
    <block type="get_character_stat">
      <field name="CHAR">ENEMY</field>
      <field name="STAT">HP_PCT</field>
    </block>
    <block type="math_number"><field name="NUM">50</field></block>
  </category>
  <category name="🔁 流程控制" colour="120">
    <block type="controls_repeat_ext">
      <value name="TIMES">
        <shadow type="math_number">
          <field name="NUM">3</field>
        </shadow>
      </value>
    </block>
    <block type="controls_if"></block>
    <block type="controls_if">
      <mutation else="1"></mutation>
    </block>
  </category>
  <category name="⚖️ 比較" colour="210">
    <block type="logic_compare">
      <field name="OP">LT</field>
      <value name="A">
        <shadow type="get_character_stat">
          <field name="CHAR">HERO</field>
          <field name="STAT">HP_PCT</field>
        </shadow>
      </value>
      <value name="B">
        <shadow type="math_number"><field name="NUM">50</field></shadow>
      </value>
    </block>
    <block type="logic_compare">
      <field name="OP">GT</field>
      <value name="A">
        <shadow type="get_character_stat">
          <field name="CHAR">ENEMY</field>
          <field name="STAT">HP_PCT</field>
        </shadow>
      </value>
      <value name="B">
        <shadow type="math_number"><field name="NUM">50</field></shadow>
      </value>
    </block>
  </category>
</xml>
`;

/** Default workspace XML used when no saved data exists. */
export const DEFAULT_WORKSPACE_XML = `
<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="hero_attack" x="40" y="40">
    <next>
      <block type="hero_attack">
        <next>
          <block type="hero_power_attack">
            <next>
              <block type="hero_defend">
                <next>
                  <block type="hero_heal"></block>
                </next>
              </block>
            </next>
          </block>
        </next>
      </block>
    </next>
  </block>
</xml>
`;

/* ------------------------------------------------------------------
   Register custom blocks with Blockly
   ------------------------------------------------------------------ */
export function defineCustomBlocks() {
  // Action blocks (statement: prev + next connections)
  for (const [type, def] of Object.entries(ACTION_DEFS)) {
    Blockly.Blocks[type] = {
      init() {
        this.appendDummyInput().appendField(def.label);
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(def.color);
        this.setTooltip(def.description);
        this.setHelpUrl('');
      },
    };
  }

  // HP value blocks (output: Number) – kept for backward compatibility with saved workspaces
  const hpBlockDefs = [
    { type: 'hero_get_hp',     label: '🗡️ 英雄當前HP',   colour: 160, tip: '返回英雄當前血量' },
    { type: 'hero_get_hp_pct', label: '🗡️ 英雄HP百分比', colour: 160, tip: '返回英雄HP百分比（0–100）' },
    { type: 'hero_get_max_hp', label: '🗡️ 英雄最大HP',   colour: 160, tip: '返回英雄最大血量' },
    { type: 'enemy_get_hp',     label: '👺 敵人當前HP',   colour: 10,  tip: '返回敵人當前血量' },
    { type: 'enemy_get_hp_pct', label: '👺 敵人HP百分比', colour: 10,  tip: '返回敵人HP百分比（0–100）' },
    { type: 'enemy_get_max_hp', label: '👺 敵人最大HP',   colour: 10,  tip: '返回敵人最大血量' },
  ];
  for (const d of hpBlockDefs) {
    Blockly.Blocks[d.type] = {
      init() {
        this.appendDummyInput().appendField(d.label);
        this.setOutput(true, 'Number');
        this.setColour(d.colour);
        this.setTooltip(d.tip);
        this.setHelpUrl('');
      },
    };
  }

  // Combined character-stat block: "取得 [英雄/敵人] 的 [屬性]"
  Blockly.Blocks['get_character_stat'] = {
    init() {
      this.appendDummyInput()
        .appendField('取得')
        .appendField(new Blockly.FieldDropdown([
          ['🗡️ 英雄', 'HERO'],
          ['👺 敵人', 'ENEMY'],
        ]), 'CHAR')
        .appendField('的')
        .appendField(new Blockly.FieldDropdown([
          ['當前HP',  'HP'],
          ['HP百分比', 'HP_PCT'],
          ['最大HP',  'MAX_HP'],
          ['攻擊力',  'ATK'],
          ['防禦力',  'DEF'],
        ]), 'STAT');
      this.setOutput(true, 'Number');
      this.setColour(160);
      this.setTooltip('取得角色的屬性數值');
      this.setHelpUrl('');
    },
  };
}

/* ------------------------------------------------------------------
   Runtime program execution (generator-based)

   AST node types
   ──────────────
   string                        → action key, e.g. 'hero_attack'
   { type:'repeat', times, body }
   { type:'if', condition, body, elseBody }

   Condition
   ─────────
   { op: 'EQ'|'NEQ'|'LT'|'LTE'|'GT'|'GTE', left: ValueExpr, right: ValueExpr }

   ValueExpr
   ─────────
   { type:'number', value }
   { type:'hero_hp'|'hero_hp_pct'|'hero_max_hp'|'hero_atk'|'hero_def'
         |'enemy_hp'|'enemy_hp_pct'|'enemy_max_hp'|'enemy_atk'|'enemy_def' }
   ------------------------------------------------------------------ */

function _evalValue(expr, ctx) {
  if (!expr) return 0;
  if (expr.type === 'number') return expr.value;
  switch (expr.type) {
    case 'hero_hp':      return ctx.heroHp;
    case 'hero_hp_pct':  return ctx.heroHpPct;
    case 'hero_max_hp':  return ctx.heroMaxHp;
    case 'hero_atk':     return ctx.heroAtk;
    case 'hero_def':     return ctx.heroDef;
    case 'enemy_hp':     return ctx.enemyHp;
    case 'enemy_hp_pct': return ctx.enemyHpPct;
    case 'enemy_max_hp': return ctx.enemyMaxHp;
    case 'enemy_atk':    return ctx.enemyAtk;
    case 'enemy_def':    return ctx.enemyDef;
    default: return 0;
  }
}

function _evalCondition(condition, ctx) {
  if (!condition) return true;
  const l = _evalValue(condition.left,  ctx);
  const r = _evalValue(condition.right, ctx);
  switch (condition.op) {
    case 'EQ':  return l === r;
    case 'NEQ': return l !== r;
    case 'LT':  return l <   r;
    case 'LTE': return l <=  r;
    case 'GT':  return l >   r;
    case 'GTE': return l >=  r;
    default: return true;
  }
}

/**
 * Generator that yields action keys from an AST program.
 * @param {Array}    nodes      - program AST (array of nodes)
 * @param {Function} getContext - called just-in-time to supply battle state for condition evaluation
 */
export function* executeProgram(nodes, getContext) {
  for (const node of nodes) {
    if (typeof node === 'string') {
      yield node;
    } else if (node.type === 'repeat') {
      for (let i = 0; i < node.times; i++) {
        yield* executeProgram(node.body, getContext);
      }
    } else if (node.type === 'if') {
      const branch = _evalCondition(node.condition, getContext())
        ? node.body
        : (node.elseBody || []);
      yield* executeProgram(branch, getContext);
    }
  }
}

/* ------------------------------------------------------------------
   Parse condition / value helpers (shared by XML + live-workspace parsers)
   ------------------------------------------------------------------ */

function _parseValueFromBlock(block) {
  if (!block) return { type: 'number', value: 0 };
  if (block.type === 'math_number') {
    return { type: 'number', value: parseFloat(block.getFieldValue('NUM')) || 0 };
  }
  if (block.type === 'get_character_stat') {
    const char = block.getFieldValue('CHAR') || 'HERO';
    const stat = block.getFieldValue('STAT') || 'HP';
    return { type: _charStatToValueType(char, stat) };
  }
  if (HP_BLOCK_MAP[block.type]) {
    return { type: HP_BLOCK_MAP[block.type] };
  }
  return { type: 'number', value: 0 };
}

function _parseConditionFromBlock(block) {
  if (!block || block.type !== 'logic_compare') return null;
  const op    = block.getFieldValue('OP') || 'EQ';
  const left  = _parseValueFromBlock(block.getInputTargetBlock('A'));
  const right = _parseValueFromBlock(block.getInputTargetBlock('B'));
  return { op, left, right };
}

function _parseValueFromEl(el) {
  if (!el) return { type: 'number', value: 0 };
  const type = el.getAttribute('type');
  if (type === 'math_number') {
    const numEl = el.querySelector(':scope > field[name="NUM"]');
    return { type: 'number', value: parseFloat(numEl?.textContent || '0') || 0 };
  }
  if (type === 'get_character_stat') {
    const charEl = el.querySelector(':scope > field[name="CHAR"]');
    const statEl = el.querySelector(':scope > field[name="STAT"]');
    const char = charEl?.textContent || 'HERO';
    const stat = statEl?.textContent || 'HP';
    return { type: _charStatToValueType(char, stat) };
  }
  if (HP_BLOCK_MAP[type]) {
    return { type: HP_BLOCK_MAP[type] };
  }
  return { type: 'number', value: 0 };
}

function _parseConditionFromEl(el) {
  if (!el || el.getAttribute('type') !== 'logic_compare') return null;
  const opEl  = el.querySelector(':scope > field[name="OP"]');
  const op    = opEl?.textContent || 'EQ';
  const aEl   = el.querySelector(':scope > value[name="A"] > block');
  const bEl   = el.querySelector(':scope > value[name="B"] > block');
  return { op, left: _parseValueFromEl(aEl), right: _parseValueFromEl(bEl) };
}

/* ------------------------------------------------------------------
   Walk helpers for live Blockly workspace
   ------------------------------------------------------------------ */

/**
 * Walk a statement chain starting at `block`, building an AST program.
 */
function _walkStatementToProgram(block, out) {
  let b = block;
  while (b) {
    const type = b.type;

    if (VALID_ACTIONS.has(type)) {
      out.push(type);

    } else if (type === 'controls_repeat_ext') {
      const timesBlock = b.getInputTargetBlock('TIMES');
      const times = timesBlock
        ? Math.min(Math.max(1, parseInt(timesBlock.getFieldValue('NUM'), 10) || 1), MAX_REPEAT_COUNT)
        : 1;
      const body = [];
      _walkStatementToProgram(b.getInputTargetBlock('DO'), body);
      out.push({ type: 'repeat', times, body });

    } else if (type === 'controls_if') {
      const condition = _parseConditionFromBlock(b.getInputTargetBlock('IF0'));
      const body = [];
      _walkStatementToProgram(b.getInputTargetBlock('DO0'), body);
      const elseBody = [];
      _walkStatementToProgram(b.getInputTargetBlock('ELSE'), elseBody);
      out.push({ type: 'if', condition, body, elseBody: elseBody.length > 0 ? elseBody : null });
    }

    b = b.getNextBlock();
  }
}

/** Extract action program (AST) from a live Blockly workspace. */
export function getActionProgramFromWorkspace(workspace) {
  const topBlocks = workspace.getTopBlocks(true);
  const program = [];
  if (topBlocks.length > 0) _walkStatementToProgram(topBlocks[0], program);
  return program.length > 0 ? program : ['hero_attack'];
}

/**
 * Flatten a program to a simple action-key array (for the preview bar).
 * IF branches: both body and elseBody are included for display.
 */
function _flattenProgram(program) {
  const out = [];
  for (const node of program) {
    if (typeof node === 'string') {
      out.push(node);
    } else if (node.type === 'repeat') {
      const inner = _flattenProgram(node.body);
      for (let i = 0; i < node.times; i++) out.push(...inner);
    } else if (node.type === 'if') {
      out.push(..._flattenProgram(node.body));
      if (node.elseBody) out.push(..._flattenProgram(node.elseBody));
    }
  }
  return out;
}

/** Extract flat action sequence from a live workspace (used for the preview bar). */
export function getActionSequenceFromWorkspace(workspace) {
  const program = getActionProgramFromWorkspace(workspace);
  const flat = _flattenProgram(program);
  return flat.length > 0 ? flat : ['hero_attack'];
}

/* ------------------------------------------------------------------
   XML-based program parser (used in BattleScene – no live Blockly needed)
   ------------------------------------------------------------------ */

/**
 * Walk a block element chain starting at `el`, building an AST program.
 */
function _processChainToProgram(el, out) {
  if (!el) return;
  const type = el.getAttribute('type');

  if (VALID_ACTIONS.has(type)) {
    out.push(type);

  } else if (type === 'controls_repeat_ext') {
    const numEl = el.querySelector(':scope > value[name="TIMES"] block[type="math_number"] > field[name="NUM"]');
    const times = numEl
      ? Math.min(Math.max(1, parseInt(numEl.textContent, 10) || 1), MAX_REPEAT_COUNT)
      : 1;
    const body = [];
    _processChainToProgram(el.querySelector(':scope > statement[name="DO"] > block'), body);
    out.push({ type: 'repeat', times, body });

  } else if (type === 'controls_if') {
    const condEl    = el.querySelector(':scope > value[name="IF0"] > block');
    const condition = _parseConditionFromEl(condEl);
    const body      = [];
    _processChainToProgram(el.querySelector(':scope > statement[name="DO0"] > block'), body);
    const elseBody  = [];
    _processChainToProgram(el.querySelector(':scope > statement[name="ELSE"] > block'), elseBody);
    out.push({ type: 'if', condition, body, elseBody: elseBody.length > 0 ? elseBody : null });
  }

  // Follow the chain
  _processChainToProgram(el.querySelector(':scope > next > block'), out);
}

/** Extract action program (AST) by parsing a raw workspace XML string (no Blockly needed). */
export function getActionProgramFromXml(xmlString) {
  if (!xmlString) return ['hero_attack'];
  try {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(xmlString, 'text/xml');
    const program = [];
    doc.querySelectorAll('xml > block').forEach(b => _processChainToProgram(b, program));
    return program.length > 0 ? program : ['hero_attack'];
  } catch (e) {
    console.warn('[BlocklyConfig] XML parse error:', e);
    return ['hero_attack'];
  }
}

/** Legacy: extract flat action sequence from XML (kept for compatibility). */
export function getActionSequenceFromXml(xmlString) {
  return _flattenProgram(getActionProgramFromXml(xmlString));
}

