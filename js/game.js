'use strict';

// ─── Game ────────────────────────────────────────────────────────────────────
class Game {
  constructor() {
    this.screen      = 'loading';
    this.canvas      = null;
    this.ctx         = null;
    this.bgCanvas    = null;
    this.bgCtx       = null;

    this.battle      = null;
    this.ai          = null;
    this.network     = null;
    this.audio       = new AudioSystem();
    this.pathfinder  = new Pathfinder();
    this.particles   = new ParticleSystem();

    this.progression = { trophies:0, gold:500, cards:{}, deck: [...DEFAULT_DECK], settings:{sfx:true,music:true,fps:false} };

    this.lastTime   = 0;
    this.animFrame  = null;
    this.totalTime  = 0;

    // Input state
    this.drag = null; // { cardIdx, startX, startY, ghostEl }
    this._pointerMoveHandler = null;
    this._pointerUpHandler   = null;

    // Deck builder state
    this._dbFilter = 'all';
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  init() {
    this.canvas  = document.getElementById('game-canvas');
    this.ctx     = this.canvas.getContext('2d');
    this.bgCanvas= document.createElement('canvas');
    this.bgCtx   = this.bgCanvas.getContext('2d');

    this.audio.init();
    this._loadProgression();
    this._setupResize();
    this._resize();

    // Start render loop (idle mode for menus)
    this._loop(0);

    // Hide loading after a moment
    setTimeout(() => {
      document.getElementById('loading-overlay').classList.add('hidden');
      this.showScreen('main-menu');
    }, 1200);
  }

  _loadProgression() {
    try {
      const saved = JSON.parse(localStorage.getItem('cc_progress') || '{}');
      Object.assign(this.progression, saved);
      if (!Array.isArray(this.progression.deck) || this.progression.deck.length !== 8) {
        this.progression.deck = [...DEFAULT_DECK];
      }
    } catch (_) {}
    this._applySettings();
  }

  _saveProgression() {
    try { localStorage.setItem('cc_progress', JSON.stringify(this.progression)); } catch (_) {}
  }

  _applySettings() {
    const s = this.progression.settings || {};
    this.audio.toggle('sfx',   s.sfx   !== false);
    this.audio.toggle('music', s.music  !== false);
  }

  // ── Screen management ─────────────────────────────────────────────────────
  showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(`screen-${name}`);
    if (el) el.classList.add('active');
    this.screen = name;
    this.audio.buttonClick();

    if (name === 'main-menu')   this._initMainMenu();
    if (name === 'deck-builder') this._initDeckBuilder();
    if (name === 'settings')    this._initSettings();
  }

  _initMainMenu() {
    const p = this.progression;
    const nameEl = document.getElementById('main-player-name');
    if (nameEl) nameEl.textContent = p.playerName || 'Player';
    const trEl = document.getElementById('main-trophies');
    if (trEl) trEl.textContent = p.trophies || 0;
    document.getElementById('gold-display') && (document.getElementById('gold-display').textContent = p.gold || 0);
  }

  // ── Matchmaking ───────────────────────────────────────────────────────────
  startMatchmaking() {
    this.showScreen('matchmaking');
    document.getElementById('mm-player-name').textContent = this.progression.playerName || 'You';
    document.getElementById('mm-trophies').textContent    = this.progression.trophies   || 0;

    // Try real WebSocket matchmaking; fall back to CPU after 3s
    if (window.GameNetwork) {
      this.network = new GameNetwork(this);
      this.network.connect();
    } else {
      setTimeout(() => this._startVsCPU(), 2500 + Math.random() * 1500);
    }
  }

  cancelMatchmaking() {
    if (this.network) { this.network.disconnect(); this.network = null; }
    this.showScreen('main-menu');
  }

  _startVsCPU() {
    if (this.screen !== 'matchmaking') return;
    const names = ['CrystalKing','ArenaLord','CardMaster','ElixirGod','TroopBoss','DragonRider'];
    const oppName = names[Math.floor(Math.random() * names.length)];
    const oppTrophies = Math.max(0, (this.progression.trophies || 0) + Math.floor((Math.random() - 0.5) * 200));

    document.getElementById('mm-opponent-name').textContent = oppName;
    document.getElementById('mm-opponent-avatar').textContent = ['⚔️','🛡️','🏹','🔥','⚡'][Math.floor(Math.random()*5)];

    this.audio.matchFound();
    setTimeout(() => this.startBattle({ vsCPU: true, oppName, oppTrophies }), 800);
  }

  startOnlineMatch(oppData) {
    this.startBattle({ vsCPU: false, oppName: oppData.name, oppTrophies: oppData.trophies, network: this.network });
  }

  // ── Battle start ──────────────────────────────────────────────────────────
  startBattle(opts = {}) {
    this.showScreen('battle');
    this._resize();
    this._buildBgCanvas();
    this._initBattleHUD(opts);

    this.particles = new ParticleSystem();
    this.pathfinder.invalidate();

    const deck = [...this.progression.deck];
    // Shuffle deck
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const aiDeck = [...DEFAULT_DECK].sort(() => Math.random() - 0.5);

    const tp = C.TOWER_POS;
    this.battle = {
      vsCPU: opts.vsCPU !== false,
      oppName: opts.oppName || 'Opponent',
      timeLeft: C.MATCH_DURATION,
      overtime: false,
      doubleElixir: false,
      result: null,

      playerElixir: 5,
      aiElixir:     5,

      deck,
      deckIdx: 4,
      hand: [deck[0], deck[1], deck[2], deck[3]],
      nextCard: deck[4],

      aiDeck,
      aiDeckIdx: 4,
      aiHand: [aiDeck[0], aiDeck[1], aiDeck[2], aiDeck[3]],
      aiNextCard: aiDeck[4],

      towers: {
        player: {
          king:  new Tower('king',     'king',     tp.player.king.col,  tp.player.king.row,  'player'),
          left:  new Tower('princess', 'princess', tp.player.left.col,  tp.player.left.row,  'player'),
          right: new Tower('princess', 'princess', tp.player.right.col, tp.player.right.row, 'player'),
        },
        enemy: {
          king:  new Tower('king',     'king',     tp.enemy.king.col,  tp.enemy.king.row,  'enemy'),
          left:  new Tower('princess', 'princess', tp.enemy.left.col,  tp.enemy.left.row,  'enemy'),
          right: new Tower('princess', 'princess', tp.enemy.right.col, tp.enemy.right.row, 'enemy'),
        }
      },

      units:       [],
      projectiles: [],
      spellEffects:[],

      stats: { playerCrowns: 0, aiCrowns: 0 },
      elixirWasMax: false,
    };

    if (opts.vsCPU !== false) {
      this.ai = new AI('normal');
    }

    this._setupBattleInput();
    this._renderCardBar();
    this.audio.startBattleMusic();
  }

  _initBattleHUD(opts) {
    const pname = this.progression.playerName || 'You';
    document.getElementById('player-name-hud').textContent   = pname;
    document.getElementById('opponent-name').textContent = opts.oppName || 'Opponent';
    document.getElementById('player-crowns').textContent = '0 👑';
    document.getElementById('opponent-crowns').textContent = '0 👑';
    document.getElementById('battle-timer').textContent = '3:00';
    document.getElementById('double-elixir-badge').style.display = 'none';
    document.getElementById('emote-panel').style.display = 'none';
  }

  // ── Main loop ─────────────────────────────────────────────────────────────
  _loop(ts) {
    const dt = this.lastTime ? Math.min((ts - this.lastTime) / 1000, 0.05) : 0;
    this.lastTime = ts;
    this.totalTime += dt;

    if (this.screen === 'battle' && this.battle && !this.battle.result) {
      this._updateBattle(dt);
    }

    this._render(dt);
    this.animFrame = requestAnimationFrame(t => this._loop(t));
  }

  // ── Update ────────────────────────────────────────────────────────────────
  _updateBattle(dt) {
    const b = this.battle;

    // Timer
    b.timeLeft -= dt;

    if (!b.doubleElixir && b.timeLeft <= C.DOUBLE_ELIXIR_AT) {
      b.doubleElixir = true;
      document.getElementById('double-elixir-badge').style.display = 'flex';
    }

    if (b.timeLeft <= 0 && !b.overtime) {
      if (b.stats.playerCrowns === b.stats.aiCrowns) {
        b.overtime = true;
        b.timeLeft = C.OVERTIME_DURATION;
        this._showToast('⏱ OVERTIME!', 'gold');
      } else {
        this._endBattle();
        return;
      }
    }

    if (b.overtime && b.timeLeft <= 0) {
      this._endBattle();
      return;
    }

    // Elixir
    const rate = b.doubleElixir ? C.ELIXIR_RATE_DOUBLE : C.ELIXIR_RATE_NORMAL;
    b.playerElixir = Math.min(C.MAX_ELIXIR, b.playerElixir + rate * dt);
    b.aiElixir     = Math.min(C.MAX_ELIXIR, b.aiElixir     + rate * dt);

    if (b.playerElixir >= C.MAX_ELIXIR && !b.elixirWasMax) {
      b.elixirWasMax = true;
      this.audio.elixirFull();
    } else if (b.playerElixir < C.MAX_ELIXIR) {
      b.elixirWasMax = false;
    }

    // AI play
    if (b.vsCPU && this.ai) {
      const play = this.ai.update(dt, b);
      if (play) this._playCard('enemy', play.cardIdx, play.col, play.row);
    }

    // Handle unit spawn requests (from spawners)
    for (const u of b.units) {
      if (u._spawnRequest) {
        const req = u._spawnRequest;
        u._spawnRequest = null;
        const offX = (Math.random() - 0.5) * 1.5;
        const offY = (Math.random() - 0.5) * 1.5;
        b.units.push(new Unit(req.unitId, req.x + offX, req.y + offY, u.owner));
      }
    }

    const cs = this._cellSize();

    // Update units
    for (const u of b.units) {
      u.update(dt, b.units, b.towers, b.projectiles, this.particles, this.pathfinder, cs);
    }

    // Update towers
    for (const side of ['player', 'enemy']) {
      for (const tw of Object.values(b.towers[side])) {
        const wasDead = tw.dead;
        tw.update(dt, b.units, b.projectiles, this.particles, cs);
        if (!wasDead && tw.dead) this._onTowerDestroyed(tw, side);
      }
    }

    // Update projectiles
    for (const p of b.projectiles) {
      p.update(dt, b.units, b.towers, this.particles, cs);
    }

    // Update spell effects
    for (const s of b.spellEffects) s.update(dt);

    // Update particles
    this.particles.update(dt);

    // Cull dead entities
    b.units       = b.units.filter(u => !(u.dead && u.deathT > 0.6));
    b.projectiles = b.projectiles.filter(p => !p.dead);
    b.spellEffects= b.spellEffects.filter(s => !s.dead);

    // Win check
    if (b.towers.enemy.king.dead || b.towers.player.king.dead) {
      this._endBattle();
    }

    this._updateHUD();
  }

  _onTowerDestroyed(tower, side) {
    const b = this.battle;
    const cs = this._cellSize();
    this.particles.crown(tower.col * cs, tower.row * cs);
    this.particles.explosion(tower.col * cs, tower.row * cs, 120);
    this.audio.towerDestroy();

    if (side === 'player') {
      b.stats.aiCrowns++;
      document.getElementById('opponent-crowns').textContent = `${b.stats.aiCrowns} 👑`;
      this._showToast('😱 Tower Lost!', 'red');
    } else {
      b.stats.playerCrowns++;
      document.getElementById('player-crowns').textContent = `${b.stats.playerCrowns} 👑`;
      this._showToast('👑 Tower Destroyed!', 'gold');
    }

    // If Princess destroyed, activate King
    if (tower.type === 'princess') {
      b.towers[side].king.activated = true;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  _render(dt) {
    if (this.screen !== 'battle') return;

    const ctx = this.ctx;
    const canvas = this.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    if (this.bgCanvas.width > 0) {
      ctx.drawImage(this.bgCanvas, 0, 0);
    }

    if (!this.battle) return;

    const cs = this._cellSize();

    // Deployment zone highlight while dragging
    if (this.drag) this._drawDeployZone(ctx, cs);

    // Spell effects (under units)
    for (const s of this.battle.spellEffects) s.draw(ctx, cs);

    // Towers
    for (const side of ['player', 'enemy']) {
      for (const tw of Object.values(this.battle.towers[side])) tw.draw(ctx, cs);
    }

    // Units (sorted by row for pseudo-depth)
    const sorted = [...this.battle.units].sort((a, b) => a.y - b.y);
    for (const u of sorted) u.draw(ctx, cs);

    // Projectiles
    for (const p of this.battle.projectiles) p.draw(ctx, cs);

    // Particles (on top)
    this.particles.draw(ctx);

    // Place preview ring
    if (this.drag?.col !== undefined) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.drag.col * cs, this.drag.row * cs, cs * 0.6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.restore();
    }

    // FPS counter
    if (this.progression.settings?.fps && dt > 0) {
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.fillText(`${Math.round(1/dt)} fps`, 6, 16);
    }
  }

  _drawDeployZone(ctx, cs) {
    const minR = C.DEPLOY_ROW_MIN, maxR = C.DEPLOY_ROW_MAX;
    ctx.save();
    ctx.fillStyle = 'rgba(100,200,100,0.10)';
    ctx.strokeStyle = 'rgba(100,220,100,0.35)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.rect(0, minR * cs, C.COLS * cs, (maxR - minR + 1) * cs);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── Background canvas ─────────────────────────────────────────────────────
  _buildBgCanvas() {
    const cs = this._cellSize();
    const w = C.COLS * cs, h = C.ROWS * cs;
    this.bgCanvas.width  = w;
    this.bgCanvas.height = h;
    const ctx = this.bgCtx;

    // Grass checkerboard
    for (let r = 0; r < C.ROWS; r++) {
      for (let c = 0; c < C.COLS; c++) {
        const isRiver = r >= C.RIVER_TOP && r <= C.RIVER_BOTTOM;
        if (isRiver) continue;
        ctx.fillStyle = (r + c) % 2 === 0 ? C.CLR.grassDark : C.CLR.grassMid;
        ctx.fillRect(c * cs, r * cs, cs, cs);
      }
    }

    // Player/enemy zone tints
    ctx.fillStyle = C.CLR.playerSide;
    ctx.fillRect(0, C.DEPLOY_ROW_MIN * cs, w, (C.ROWS - C.DEPLOY_ROW_MIN) * cs);
    ctx.fillStyle = C.CLR.enemySide;
    ctx.fillRect(0, 0, w, C.DEPLOY_ROW_MIN * cs);

    // River
    for (let r = C.RIVER_TOP; r <= C.RIVER_BOTTOM; r++) {
      for (let c = 0; c < C.COLS; c++) {
        const inLeft  = C.BRIDGE_LEFT.includes(c);
        const inRight = C.BRIDGE_RIGHT.includes(c);
        if (inLeft || inRight) {
          // Bridge
          ctx.fillStyle = C.CLR.bridge;
          ctx.fillRect(c * cs, r * cs, cs, cs);
          // Stone texture
          ctx.fillStyle = C.CLR.bridgeEdge;
          ctx.fillRect(c * cs + 1, r * cs + 1, cs - 2, 2);
          ctx.fillRect(c * cs + 1, r * cs + cs - 3, cs - 2, 2);
        } else {
          // Water shimmer pattern
          ctx.fillStyle = (c + r) % 3 === 0 ? C.CLR.riverShimmer : C.CLR.river;
          ctx.fillRect(c * cs, r * cs, cs, cs);
        }
      }
    }

    // River border lines
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, C.RIVER_TOP * cs);
    ctx.lineTo(w, C.RIVER_TOP * cs);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, (C.RIVER_BOTTOM + 1) * cs);
    ctx.lineTo(w, (C.RIVER_BOTTOM + 1) * cs);
    ctx.stroke();

    // Center divider line
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, (C.ROWS / 2) * cs);
    ctx.lineTo(w, (C.ROWS / 2) * cs);
    ctx.stroke();
    ctx.setLineDash([]);

    // "Bridge" plank markings
    [C.BRIDGE_LEFT, C.BRIDGE_RIGHT].forEach(bc => {
      for (let r = C.RIVER_TOP; r <= C.RIVER_BOTTOM; r++) {
        for (const c of bc) {
          for (let plank = 0; plank < 4; plank++) {
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.fillRect(c * cs + 2, r * cs + plank * (cs / 4) + 1, cs - 4, 2);
          }
        }
      }
    });
  }

  // ── HUD update ────────────────────────────────────────────────────────────
  _updateHUD() {
    const b = this.battle;
    if (!b) return;

    // Timer
    const tl    = Math.max(0, Math.ceil(b.timeLeft));
    const mins  = Math.floor(tl / 60);
    const secs  = tl % 60;
    const timerEl = document.getElementById('battle-timer');
    if (timerEl) {
      timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
      timerEl.style.color = b.overtime ? '#ff5722' : b.timeLeft < 30 ? '#fdd835' : '#fff';
    }

    // Elixir bar
    const frac = b.playerElixir / C.MAX_ELIXIR;
    const fill = document.getElementById('elixir-fill');
    if (fill) fill.style.width = `${frac * 100}%`;
    const count = document.getElementById('elixir-count');
    if (count) count.textContent = Math.floor(b.playerElixir);

    // Elixir pip dots
    const dots = document.getElementById('elixir-dots');
    if (dots) {
      dots.innerHTML = '';
      for (let i = 1; i <= C.MAX_ELIXIR; i++) {
        const dot = document.createElement('div');
        dot.className = 'elixir-dot' + (b.playerElixir >= i ? ' filled' : '');
        dots.appendChild(dot);
      }
    }
  }

  _renderCardBar() {
    const b = this.battle;
    if (!b) return;

    for (let i = 0; i < 4; i++) {
      const slot = document.getElementById(`card-slot-${i}`);
      if (!slot) continue;
      const cardId = b.hand[i];
      if (!cardId) { slot.innerHTML = ''; continue; }
      slot.innerHTML = this._buildCardHTML(cardId, i);
      this._attachCardDrag(slot, i);
    }

    // Next card preview
    const next = document.getElementById('next-card-preview');
    if (next && b.nextCard) {
      next.innerHTML = this._buildCardHTML(b.nextCard, -1, true);
    }
  }

  _buildCardHTML(cardId, idx, small = false) {
    const card = CARD_DEF[cardId];
    if (!card) return '';
    const cost = card.cost;
    const cls  = small ? 'card-inner card-small' : 'card-inner';
    const kinds= { troop:'🪖', spell:'✨', building:'🏰' };
    return `
      <div class="${cls}" data-card-idx="${idx}" data-card-id="${cardId}">
        <div class="card-cost">${cost}</div>
        <div class="card-art">${card.unit ? (UNIT_DEF[card.unit]?.icon || '?') : (kinds[card.kind] || '?')}</div>
        <div class="card-name">${card.name}</div>
      </div>`;
  }

  _attachCardDrag(slot, idx) {
    const inner = slot.querySelector('.card-inner');
    if (!inner) return;

    const onDown = (e) => {
      e.preventDefault();
      const rect = inner.getBoundingClientRect();
      const cx = e.clientX ?? e.touches?.[0].clientX;
      const cy = e.clientY ?? e.touches?.[0].clientY;
      this._startDrag(idx, cx, cy, rect);
    };

    inner.addEventListener('pointerdown', onDown, { passive: false });
  }

  _startDrag(cardIdx, clientX, clientY, cardRect) {
    const b = this.battle;
    if (!b || b.result) return;
    const card = CARD_DEF[b.hand[cardIdx]];
    if (!card) return;
    if (b.playerElixir < card.cost) {
      this._showToast('Not enough elixir!', 'red');
      return;
    }

    const ghost = document.getElementById('drag-ghost');
    ghost.innerHTML = this._buildCardHTML(b.hand[cardIdx], cardIdx);
    ghost.style.display = 'block';
    ghost.style.left = `${clientX - 35}px`;
    ghost.style.top  = `${clientY - 35}px`;

    this.drag = { cardIdx, clientX, clientY };

    const onMove = (e) => {
      const cx = e.clientX ?? e.touches?.[0].clientX ?? clientX;
      const cy = e.clientY ?? e.touches?.[0].clientY ?? clientY;
      ghost.style.left = `${cx - 35}px`;
      ghost.style.top  = `${cy - 80}px`;

      // Convert to grid coords for preview
      const grid = this._screenToGrid(cx, cy - 80);
      if (grid) { this.drag.col = grid.col; this.drag.row = grid.row; }
    };

    const onUp = (e) => {
      const cx = e.clientX ?? e.changedTouches?.[0].clientX ?? clientX;
      const cy = e.clientY ?? e.changedTouches?.[0].clientY ?? clientY;
      ghost.style.display = 'none';
      delete this.drag.col; delete this.drag.row;

      const grid = this._screenToGrid(cx, cy - 80);
      if (grid) this._tryPlayCard(cardIdx, grid.col, grid.row);
      this.drag = null;

      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup',   onUp);
  }

  _screenToGrid(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width  / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const cx = (clientX - rect.left)  * scaleX;
    const cy = (clientY - rect.top)   * scaleY;
    const cs = this._cellSize();
    const col = Math.floor(cx / cs);
    const row = Math.floor(cy / cs);
    if (col < 0 || col >= C.COLS || row < 0 || row >= C.ROWS) return null;
    return { col, row };
  }

  _tryPlayCard(cardIdx, col, row) {
    const b = this.battle;
    if (!b) return;
    const cardId = b.hand[cardIdx];
    const card   = CARD_DEF[cardId];
    if (!card) return;

    // Validate placement zone
    if (row < C.DEPLOY_ROW_MIN || row > C.DEPLOY_ROW_MAX) {
      this._showToast('Place cards on your side!', 'red');
      return;
    }
    if (b.playerElixir < card.cost) {
      this._showToast('Not enough elixir!', 'red');
      return;
    }

    this._playCard('player', cardIdx, col, row);
  }

  _playCard(owner, cardIdx, col, row) {
    const b = this.battle;
    const isPlayer = owner === 'player';
    const hand  = isPlayer ? b.hand     : b.aiHand;
    const deck  = isPlayer ? b.deck     : b.aiDeck;
    const elixir = isPlayer ? b.playerElixir : b.aiElixir;
    const deckIdxKey = isPlayer ? 'deckIdx' : 'aiDeckIdx';
    const nextKey    = isPlayer ? 'nextCard' : 'aiNextCard';

    const cardId = hand[cardIdx];
    const card   = CARD_DEF[cardId];
    if (!card) return;
    if (elixir < card.cost) return;

    // Deduct elixir
    if (isPlayer) b.playerElixir -= card.cost;
    else          b.aiElixir     -= card.cost;

    const cs = this._cellSize();

    // Spawn
    if (card.kind === 'troop' || card.kind === 'building') {
      const udef = UNIT_DEF[card.unit];
      const count = udef?.count || 1;
      const offsets = udef?.offsets || [{ dx: 0, dy: 0 }];

      for (let i = 0; i < count; i++) {
        const off = offsets[i % offsets.length] || { dx: 0, dy: 0 };
        const spread = count > 1 && !offsets[i] ? { dx: (Math.random() - 0.5) * 1.4, dy: (Math.random() - 0.5) * 1.4 } : off;
        const u = new Unit(card.unit, col + spread.dx, row + spread.dy, owner);
        b.units.push(u);
        this.particles.elixirDrop(
          (col + spread.dx) * cs,
          (row + spread.dy) * cs
        );
      }
      if (isPlayer) this.audio.cardPlace();
    } else if (card.kind === 'spell') {
      const effect = new SpellEffect(col, row, card, owner, b.units, b.towers, this.particles, cs);
      b.spellEffects.push(effect);
      if (isPlayer) {
        const names = { fireball: 'fireball', lightning: 'lightning', freeze: 'freeze' };
        (this.audio[names[cardId]] || this.audio.cardPlace).call(this.audio);
      }
    }

    // Advance hand
    const next = b[nextKey];
    hand[cardIdx] = next;
    const ni = b[deckIdxKey] % deck.length;
    b[nextKey] = deck[ni];
    b[deckIdxKey]++;

    if (isPlayer) {
      this._renderCardBar();
      this.pathfinder.invalidate();
    }
  }

  // ── Battle end ────────────────────────────────────────────────────────────
  _endBattle() {
    const b = this.battle;
    if (b.result) return;
    b.result = 'ended';

    this.audio.stopBattleMusic();

    const pc = b.stats.playerCrowns, ac = b.stats.aiCrowns;
    let outcome;
    if (pc > ac)       outcome = 'victory';
    else if (ac > pc)  outcome = 'defeat';
    else               outcome = 'draw';

    // Trophy change
    const delta = outcome === 'victory' ? 30 : outcome === 'defeat' ? -20 : 5;
    this.progression.trophies = Math.max(0, (this.progression.trophies || 0) + delta);
    this.progression.gold     = (this.progression.gold || 0) + (outcome === 'victory' ? 50 : 10);
    this._saveProgression();

    if (outcome === 'victory') this.audio.victory();
    else                       this.audio.defeat();

    setTimeout(() => this._showResult(outcome, pc, ac, delta), 1800);
  }

  _showResult(outcome, pc, ac, trophyDelta) {
    this.showScreen('battle-result');
    const banner = document.getElementById('result-banner');
    const text   = document.getElementById('result-text');
    const crowns = document.getElementById('result-crowns');
    const change = document.getElementById('trophies-change');

    if (outcome === 'victory') {
      banner.className = 'result-banner result-victory';
      text.textContent = '🏆 VICTORY!';
    } else if (outcome === 'defeat') {
      banner.className = 'result-banner result-defeat';
      text.textContent = '💀 DEFEAT';
    } else {
      banner.className = 'result-banner result-draw';
      text.textContent = '🤝 DRAW';
    }

    crowns.textContent = `${pc} 👑 vs ${ac} 👑`;
    change.textContent = `${trophyDelta >= 0 ? '+' : ''}${trophyDelta} 🏆`;
    change.style.color = trophyDelta >= 0 ? '#ffd54f' : '#ef9a9a';
  }

  // ── Deck Builder ──────────────────────────────────────────────────────────
  _initDeckBuilder() {
    this._renderDeckSlots();
    this._renderCollection();
    this._updateDeckAvg();

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._dbFilter = btn.dataset.filter;
        this._renderCollection();
      });
    });
  }

  _renderDeckSlots() {
    const container = document.getElementById('deck-slots');
    if (!container) return;
    const deck = this.progression.deck;
    container.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const card = deck[i] ? CARD_DEF[deck[i]] : null;
      const div = document.createElement('div');
      div.className = 'deck-slot-item' + (card ? ' filled' : ' empty');
      div.innerHTML = card
        ? `<div class="ds-cost">${card.cost}</div>
           <div class="ds-icon">${UNIT_DEF[card.unit]?.icon || '✨'}</div>
           <div class="ds-name">${card.name}</div>`
        : `<div class="ds-empty">+</div>`;
      if (card) {
        div.addEventListener('click', () => {
          this.progression.deck[i] = null;
          this._saveProgression();
          this._initDeckBuilder();
        });
      }
      container.appendChild(div);
    }
  }

  _renderCollection() {
    const grid = document.getElementById('collection-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const filter = this._dbFilter;
    const inDeck = new Set(this.progression.deck.filter(Boolean));

    ALL_CARD_IDS.forEach(id => {
      const card = CARD_DEF[id];
      if (!card) return;
      if (filter !== 'all' && card.kind !== filter) return;

      const div = document.createElement('div');
      const inD = inDeck.has(id);
      div.className = 'coll-card' + (inD ? ' in-deck' : '');
      div.innerHTML = `
        <div class="coll-cost">${card.cost}💧</div>
        <div class="coll-icon">${UNIT_DEF[card.unit]?.icon || '✨'}</div>
        <div class="coll-name">${card.name}</div>
        ${inD ? '<div class="coll-badge">✓</div>' : ''}`;

      div.addEventListener('click', () => {
        if (inD) {
          this.progression.deck = this.progression.deck.filter(d => d !== id);
        } else {
          const slot = this.progression.deck.indexOf(null);
          if (this.progression.deck.length < 8 && slot === -1) {
            this.progression.deck.push(id);
          } else if (slot !== -1) {
            this.progression.deck[slot] = id;
          } else {
            this._showToast('Deck is full! Remove a card first.', 'red');
            return;
          }
        }
        this._saveProgression();
        this._initDeckBuilder();
      });

      grid.appendChild(div);
    });
  }

  _updateDeckAvg() {
    const el = document.getElementById('deck-avg-elixir');
    if (!el) return;
    const deck = this.progression.deck.filter(Boolean);
    if (deck.length === 0) { el.textContent = '0.0'; return; }
    const avg = deck.reduce((s, id) => s + (CARD_DEF[id]?.cost || 0), 0) / deck.length;
    el.textContent = avg.toFixed(1);
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  _initSettings() {
    const s = this.progression.settings || {};
    const nameEl = document.getElementById('setting-name');
    if (nameEl) nameEl.value = this.progression.playerName || '';
    this._setToggle('sfx', s.sfx !== false);
    this._setToggle('music', s.music !== false);
    this._setToggle('fps', s.fps === true);
  }

  _setToggle(key, on) {
    const el = document.getElementById(`toggle-${key}`);
    if (el) el.classList.toggle('active', on);
  }

  toggleSetting(key) {
    const s = this.progression.settings || {};
    s[key] = !s[key];
    this.progression.settings = s;
    this._setToggle(key, s[key]);
    if (key === 'sfx'   ) this.audio.toggle('sfx',   s.sfx);
    if (key === 'music' ) this.audio.toggle('music',  s.music);
  }

  saveSettings() {
    const nameEl = document.getElementById('setting-name');
    if (nameEl && nameEl.value.trim()) {
      this.progression.playerName = nameEl.value.trim().slice(0, 12);
    }
    this._saveProgression();
    this._applySettings();
    this._showToast('Settings saved!', 'gold');
    this.showScreen('main-menu');
  }

  // ── Chest / Shop ──────────────────────────────────────────────────────────
  openChest(type) {
    const costs = { silver: 50, gold: 200, magical: 500 };
    const cost = costs[type] || 50;
    if ((this.progression.gold || 0) < cost) {
      this._showToast('Not enough gold!', 'red');
      return;
    }
    this.progression.gold -= cost;
    const goldGain = Math.floor(cost * 0.3 + Math.random() * cost * 0.5);
    this.progression.gold += goldGain;
    this._saveProgression();
    this._showToast(`Opened ${type} chest! +${goldGain} 💰`, 'gold');
    document.getElementById('gold-display') &&
      (document.getElementById('gold-display').textContent = this.progression.gold);
  }

  // ── Emotes ────────────────────────────────────────────────────────────────
  showEmotes() {
    const panel = document.getElementById('emote-panel');
    if (!panel) return;
    const visible = panel.style.display !== 'none';
    panel.style.display = visible ? 'none' : 'grid';
    if (!visible) {
      const grid = document.getElementById('emotes-grid');
      const emotes = ['👍','😂','😱','😢','🔥','👑','💪','🤦'];
      grid.innerHTML = emotes.map(e =>
        `<button class="emote-btn-item" onclick="window.game._sendEmote('${e}')">${e}</button>`
      ).join('');
    }
  }

  _sendEmote(emote) {
    document.getElementById('emote-panel').style.display = 'none';
    this._showToast(emote, 'none', 1500);
  }

  // ── Utilities ─────────────────────────────────────────────────────────────
  _cellSize() {
    return this.canvas ? this.canvas.width / C.COLS : 20;
  }

  _setupBattleInput() {
    // Handled by card slot drag
  }

  _setupResize() {
    window.addEventListener('resize', () => {
      this._resize();
      if (this.battle) this._buildBgCanvas();
    });
  }

  _resize() {
    if (!this.canvas) return;
    const screen = document.getElementById('screen-battle');
    if (!screen || !screen.classList.contains('active')) return;

    const aw = screen.clientWidth;
    const ah = screen.clientHeight;
    const aspect = C.COLS / C.ROWS; // 18/32 = 9/16

    let cw, ch;
    if (aw / ah < aspect) {
      cw = aw;
      ch = aw / aspect;
    } else {
      ch = ah;
      cw = ah * aspect;
    }

    this.canvas.width  = Math.round(cw);
    this.canvas.height = Math.round(ch);
    this.canvas.style.width  = `${cw}px`;
    this.canvas.style.height = `${ch}px`;
  }

  _showToast(msg, type = 'info', dur = 2500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, dur);
  }
}
