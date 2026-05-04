/**
 * BlocklyConfig.js
 *   - Custom hero-action block definitions
 *   - Toolbox XML
 *   - Helper to extract the flat action sequence from the workspace
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
  <category name="🔁 控制" colour="120">
    <block type="controls_repeat_ext">
      <value name="TIMES">
        <shadow type="math_number">
          <field name="NUM">3</field>
        </shadow>
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
}

/* ------------------------------------------------------------------
   Extract action sequence from workspace DOM
   (works even when Blockly is not loaded yet – parses raw XML)
   ------------------------------------------------------------------ */

/**
 * Walk a chain of connected blocks starting from `block` and push
 * matching action types into `out`.
 */
function walkChain(block, out) {
  if (!block) return;
  const type = block.type;

  if (VALID_ACTIONS.has(type)) {
    out.push(type);
  } else if (type === 'controls_repeat_ext') {
    const timesBlock = block.getInputTargetBlock('TIMES');
    const times = timesBlock
      ? Math.min(Math.max(1, parseInt(timesBlock.getFieldValue('NUM'), 10) || 1), MAX_REPEAT_COUNT)
      : 1;
    const inner = [];
    let b = block.getInputTargetBlock('DO');
    while (b) {
      if (VALID_ACTIONS.has(b.type)) inner.push(b.type);
      b = b.getNextBlock();
    }
    for (let i = 0; i < times; i++) out.push(...inner);
  }

  walkChain(block.getNextBlock(), out);
}

/** Extract action sequence from a live Blockly workspace. */
export function getActionSequenceFromWorkspace(workspace) {
  const topBlocks = workspace.getTopBlocks(true);
  const actions = [];
  if (topBlocks.length > 0) walkChain(topBlocks[0], actions);
  return actions.length > 0 ? actions : ['hero_attack'];
}

/** Extract action sequence by parsing a raw workspace XML string (no Blockly needed). */
export function getActionSequenceFromXml(xmlString) {
  if (!xmlString) return ['hero_attack'];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');
    const actions = [];

    function processBlockEl(el) {
      if (!el) return;
      const type = el.getAttribute('type');

      if (VALID_ACTIONS.has(type)) {
        actions.push(type);
        const nextEl = el.querySelector(':scope > next > block');
        processBlockEl(nextEl);
      } else if (type === 'controls_repeat_ext') {
        const numEl = el.querySelector(':scope > value[name="TIMES"] block[type="math_number"] > field[name="NUM"]');
        const times = numEl
          ? Math.min(Math.max(1, parseInt(numEl.textContent, 10) || 1), MAX_REPEAT_COUNT)
          : 1;
        const inner = [];
        let b = el.querySelector(':scope > statement[name="DO"] > block');
        while (b) {
          if (VALID_ACTIONS.has(b.getAttribute('type'))) inner.push(b.getAttribute('type'));
          b = b.querySelector(':scope > next > block');
        }
        for (let i = 0; i < times; i++) actions.push(...inner);
        const nextEl = el.querySelector(':scope > next > block');
        processBlockEl(nextEl);
      }
    }

    doc.querySelectorAll('xml > block').forEach(b => processBlockEl(b));
    return actions.length > 0 ? actions : ['hero_attack'];
  } catch (e) {
    console.warn('[BlocklyConfig] XML parse error:', e);
    return ['hero_attack'];
  }
}
