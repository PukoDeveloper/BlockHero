import { Storage } from '../utils/Storage.js';
import {
  defineCustomBlocks,
  TOOLBOX_XML,
  DEFAULT_WORKSPACE_XML,
  ACTION_DEFS,
  getActionSequenceFromWorkspace,
} from '../utils/BlocklyConfig.js';

/**
 * BlocklyScene – workspace for designing hero action sequences.
 * Workspace state auto-saves to localStorage on every change.
 */
export class BlocklyScene {
  constructor(game) {
    this.game        = game;
    this.el          = document.getElementById('blockly-screen');
    this.workspace   = null;
    this._initialized = false;
    this._resizeObserver = null;

    this._setupButtons();
  }

  /* ---- Button wiring ---- */
  _setupButtons() {
    document.getElementById('btn-save-code').addEventListener('click', () => {
      this._saveCode();
      this._showSavedToast();
    });

    document.getElementById('btn-clear-code').addEventListener('click', () => {
      if (window.confirm('確定要清除所有積木並恢復預設嗎？')) {
        this._clearCode();
      }
    });

    document.getElementById('btn-back-to-title').addEventListener('click', () => {
      this._saveCode();
      this.game.goToTitle();
    });

    document.getElementById('btn-go-battle').addEventListener('click', () => {
      this._saveCode();
      this.game.goToBattle();
    });
  }

  /* ---- Blockly initialisation (lazy, once) ---- */
  _initBlockly() {
    if (this._initialized) return;
    this._initialized = true;

    defineCustomBlocks();

    // Build dark theme
    const darkTheme = Blockly.Theme.defineTheme('blockhero_dark', {
      base: Blockly.Themes ? Blockly.Themes.Classic : undefined,
      componentStyles: {
        workspaceBackgroundColour: '#1a1a2e',
        toolboxBackgroundColour:   '#0d0d1a',
        toolboxForegroundColour:   '#e8e8f0',
        flyoutBackgroundColour:    '#111120',
        flyoutForegroundColour:    '#e8e8f0',
        flyoutOpacity:             0.97,
        scrollbarColour:           '#3a3a5e',
        scrollbarOpacity:          0.6,
        insertionMarkerColour:     '#ffffff',
        insertionMarkerOpacity:    0.3,
        cursorColour:              '#f5a623',
      },
    });

    this.workspace = Blockly.inject('blocklyDiv', {
      toolbox:   TOOLBOX_XML,
      theme:     darkTheme,
      scrollbars: true,
      trashcan:  true,
      zoom: {
        controls:   true,
        wheel:      true,
        startScale: 1.0,
        maxScale:   2.5,
        minScale:   0.4,
        scaleSpeed: 1.2,
      },
      grid: {
        spacing: 24,
        length:  3,
        colour:  'rgba(255,255,255,0.06)',
        snap:    true,
      },
      sounds: false,
    });

    // Load saved or default XML
    const savedXml = Storage.loadWorkspaceXml();
    this._loadXml(savedXml || DEFAULT_WORKSPACE_XML);

    // Auto-save + preview on every change
    this.workspace.addChangeListener(() => {
      this._saveCode(/* silent */ true);
      this._updatePreview();
    });

    this._updatePreview();

    // Keep Blockly sized to its container via ResizeObserver
    const mainEl = document.getElementById('blockly-main');
    if (window.ResizeObserver) {
      this._resizeObserver = new ResizeObserver(() => {
        if (this.workspace) Blockly.svgResize(this.workspace);
      });
      this._resizeObserver.observe(mainEl);
    }
  }

  _loadXml(xmlString) {
    try {
      this.workspace.clear();
      const dom = Blockly.Xml.textToDom(xmlString);
      Blockly.Xml.domToWorkspace(dom, this.workspace);
    } catch (e) {
      console.warn('[BlocklyScene] Could not load XML:', e);
    }
  }

  /* ---- Save / Clear ---- */
  _saveCode(silent = false) {
    if (!this.workspace) return;
    try {
      const xml = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(this.workspace));
      Storage.saveWorkspaceXml(xml);
    } catch (e) {
      if (!silent) console.error('[BlocklyScene] save failed:', e);
    }
  }

  _clearCode() {
    Storage.clearWorkspace();
    if (this.workspace) this._loadXml(DEFAULT_WORKSPACE_XML);
    this._updatePreview();
  }

  _showSavedToast() {
    const btn = document.getElementById('btn-save-code');
    const orig = btn.textContent;
    btn.textContent = '✓ 已儲存';
    btn.style.color = '#2ecc71';
    setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1600);
  }

  /* ---- Action preview ---- */
  _updatePreview() {
    if (!this.workspace) return;
    const actions = getActionSequenceFromWorkspace(this.workspace);
    const list = document.getElementById('action-preview-list');
    list.innerHTML = '';

    if (actions.length === 0) {
      list.innerHTML = '<span style="color:var(--text-muted)">尚未設定任何行動</span>';
      return;
    }

    actions.forEach(key => {
      const def = ACTION_DEFS[key];
      if (!def) return;
      const chip = document.createElement('span');
      chip.className = 'action-chip';
      chip.textContent = def.label;
      chip.title = def.description;
      chip.style.borderColor = def.chipColor;
      chip.style.color        = def.chipColor;
      list.appendChild(chip);
    });
  }

  /* ---- Lifecycle ---- */
  show() {
    this.el.classList.add('active');
    // Defer so the container has layout before Blockly measures it
    setTimeout(() => {
      this._initBlockly();
      if (this.workspace) Blockly.svgResize(this.workspace);
    }, 60);
  }

  hide() {
    this._saveCode(true);
    this.el.classList.remove('active');
  }
}
