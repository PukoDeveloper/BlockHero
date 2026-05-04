/**
 * Storage.js – Wrapper around localStorage for persisting Blockly workspace.
 */
export const Storage = {
  KEY_WORKSPACE: 'blockhero_workspace_xml',

  /** Save Blockly workspace XML string. Returns true on success. */
  saveWorkspaceXml(xml) {
    try {
      localStorage.setItem(this.KEY_WORKSPACE, xml);
      return true;
    } catch (e) {
      console.warn('[Storage] save failed:', e);
      return false;
    }
  },

  /** Load previously saved workspace XML, or null if none. */
  loadWorkspaceXml() {
    try {
      return localStorage.getItem(this.KEY_WORKSPACE);
    } catch (e) {
      console.warn('[Storage] load failed:', e);
      return null;
    }
  },

  /** Remove saved workspace. */
  clearWorkspace() {
    try {
      localStorage.removeItem(this.KEY_WORKSPACE);
    } catch (e) {
      console.warn('[Storage] clear failed:', e);
    }
  },

  /** True when a saved workspace exists. */
  hasWorkspace() {
    try {
      return !!localStorage.getItem(this.KEY_WORKSPACE);
    } catch {
      return false;
    }
  },
};
