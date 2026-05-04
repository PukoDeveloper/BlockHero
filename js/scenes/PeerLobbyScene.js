/**
 * PeerLobbyScene – Connection lobby for two-player PeerJS battles.
 *
 * Flow:
 *   1. On show(), a new Peer is created using the default PeerJS cloud server.
 *   2. The generated Peer ID is displayed for the player to share.
 *   3. The player can enter the opponent's Peer ID and click "Connect".
 *   4. Incoming connections are also accepted (host side).
 *   5. Once a DataConnection is established both sides see the "Start Battle" button.
 *   6. Clicking "Start Battle" calls game.goToMpBattle() which stores the active
 *      Peer + DataConnection on the game object and shows MultiplayerBattleScene.
 */
export class PeerLobbyScene {
  constructor(game) {
    this.game = game;
    this.el   = document.getElementById('peer-lobby-screen');

    /** @type {import('peerjs').Peer | null} */
    this.peer = null;
    /** @type {import('peerjs').DataConnection | null} */
    this.conn = null;

    this._setupButtons();
  }

  /* ------------------------------------------------------------------ */
  _setupButtons() {
    document.getElementById('btn-copy-id').addEventListener('click', () => {
      const id = document.getElementById('lobby-my-id').textContent.trim();
      if (id && id !== '正在取得…') {
        navigator.clipboard?.writeText(id).catch(() => {});
        document.getElementById('lobby-status').textContent = '✅ 已複製 ID！';
      }
    });

    document.getElementById('btn-connect-peer').addEventListener('click', () => {
      const input  = document.getElementById('lobby-peer-id-input');
      const peerId = input.value.trim();
      if (!peerId) { this._setStatus('❌ 請輸入對手的連線 ID。'); return; }
      this._connectTo(peerId);
    });

    // Allow pressing Enter in the input field to connect
    document.getElementById('lobby-peer-id-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btn-connect-peer').click();
    });

    document.getElementById('btn-start-mp').addEventListener('click', () => {
      if (!this.conn || !this.conn.open) {
        this._setStatus('❌ 連線已中斷，請重新連線。');
        return;
      }
      this.game.goToMpBattle(this.peer, this.conn);
    });

    document.getElementById('btn-lobby-back').addEventListener('click', () => {
      this._cleanup();
      this.game.goToTitle();
    });
  }

  /* ------------------------------------------------------------------ */
  _setStatus(msg) {
    document.getElementById('lobby-status').textContent = msg;
  }

  _initPeer() {
    this._setStatus('正在連線至配對伺服器…');

    this.peer = new Peer();

    this.peer.on('open', (id) => {
      document.getElementById('lobby-my-id').textContent = id;
      this._setStatus('等待對手連線，或輸入對手 ID 後點擊「連線」。');
    });

    // Incoming connection (this player is the "host")
    this.peer.on('connection', (conn) => {
      if (this.conn && this.conn.open) {
        // Already connected – reject duplicate
        conn.close();
        return;
      }
      this.conn = conn;
      this._setupConn(conn);
      this._setStatus(`✅ 對手 ${conn.peer} 已連線！按「開始對戰」啟動。`);
      document.getElementById('lobby-ready-section').classList.remove('hidden');
    });

    this.peer.on('error', (err) => {
      this._setStatus(`❌ 錯誤：${err.type} – ${err.message || ''}`);
    });

    this.peer.on('disconnected', () => {
      this._setStatus('⚠️ 已與伺服器斷線，嘗試重連…');
      this.peer.reconnect();
    });
  }

  _connectTo(peerId) {
    if (!this.peer) return;
    this._setStatus('連線中…');
    const conn = this.peer.connect(peerId, { reliable: true });
    this.conn = conn;
    this._setupConn(conn);
  }

  _setupConn(conn) {
    conn.on('open', () => {
      this._setStatus(`✅ 已連線至對手！按「開始對戰」啟動。`);
      document.getElementById('lobby-ready-section').classList.remove('hidden');
    });

    conn.on('error', (err) => {
      this._setStatus(`❌ 連線錯誤：${err}`);
    });

    conn.on('close', () => {
      this._setStatus('⚠️ 連線已關閉。請重新連線。');
      document.getElementById('lobby-ready-section').classList.add('hidden');
      this.conn = null;
    });
  }

  _cleanup() {
    if (this.conn) { try { this.conn.close(); } catch (_) {} this.conn = null; }
    if (this.peer) { try { this.peer.destroy(); } catch (_) {} this.peer = null; }
  }

  /* ------------------------------------------------------------------ */
  show() {
    this.el.classList.add('active');
    // Discard any references left over from a previous session
    // (the game already destroyed them via _closeMpConnection before calling show)
    this.peer = null;
    this.conn = null;
    // Reset UI
    document.getElementById('lobby-my-id').textContent = '正在取得…';
    document.getElementById('lobby-peer-id-input').value = '';
    document.getElementById('lobby-ready-section').classList.add('hidden');
    this._setStatus('等待中…');
    this._initPeer();
  }

  hide() {
    this.el.classList.remove('active');
    // Keep peer/conn alive – battle scene will use them.
    // Cleanup is handled in _cleanup() when navigating away.
  }
}
