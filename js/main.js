'use strict';

// ─── Entry point ─────────────────────────────────────────────────────────────
window.game = null;

document.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
  window.game.init();

  // Fake loading bar animation
  const bar = document.getElementById('loading-bar');
  if (bar) {
    let progress = 0;
    const tick = () => {
      progress = Math.min(100, progress + Math.random() * 18);
      bar.style.width = `${progress}%`;
      if (progress < 100) setTimeout(tick, 80);
    };
    tick();
  }
});

// ─── Network client (optional – used if a server is running) ────────────────
class GameNetwork {
  constructor(game) {
    this.game = game;
    this.ws   = null;
    this._retries = 0;
  }

  connect() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${location.host}`;
    try {
      this.ws = new WebSocket(url);
    } catch (_) {
      // Fall back to CPU; let matchmaking timeout handle it
      return;
    }

    this.ws.onopen = () => {
      const p = window.game.progression;
      this._send({ type: 'join', name: p.playerName || 'Player', trophies: p.trophies || 0 });
    };

    this.ws.onmessage = (e) => {
      try { this._onMessage(JSON.parse(e.data)); } catch (_) {}
    };

    this.ws.onclose = () => {
      if (this.game.screen === 'battle' && this.game.battle && !this.game.battle.result) {
        this.game._showToast('Connection lost – continuing vs CPU', 'red');
        this.game.ai = new AI('normal');
        this.game.battle.vsCPU = true;
      }
    };
  }

  disconnect() {
    if (this.ws) { this.ws.close(); this.ws = null; }
  }

  _send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  _onMessage(msg) {
    const g = this.game;
    switch (msg.type) {
      case 'matched':
        g.startOnlineMatch({ name: msg.oppName, trophies: msg.oppTrophies });
        break;
      case 'card_play':
        if (g.battle) {
          g._playCard('enemy', msg.cardIdx, msg.col, msg.row);
        }
        break;
      case 'chat':
        g._showToast(`${msg.name}: ${msg.text}`, 'info');
        break;
    }
  }

  sendCardPlay(cardIdx, col, row) {
    this._send({ type: 'card_play', cardIdx, col, row });
  }
}
