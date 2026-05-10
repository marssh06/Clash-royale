'use strict';

// ─── AI Opponent ─────────────────────────────────────────────────────────────
// Simulates an opponent who builds up elixir and plays cards strategically.

class AI {
  constructor(difficulty = 'normal') {
    this.difficulty = difficulty;
    this._timer = this._nextThink();
    this._pendingPlay = null;
  }

  _nextThink() {
    const [mn, mx] = {
      easy:   [3.5, 6.0],
      normal: [C.AI_THINK_MIN, C.AI_THINK_MAX],
      hard:   [1.0, 2.5],
    }[this.difficulty] || [C.AI_THINK_MIN, C.AI_THINK_MAX];
    return mn + Math.random() * (mx - mn);
  }

  // Called every frame; returns a play {cardIdx, col, row} or null
  update(dt, battle) {
    this._timer -= dt;
    if (this._timer > 0) return null;

    this._timer = this._nextThink();
    return this._choosePlay(battle);
  }

  _choosePlay(battle) {
    const hand     = battle.aiHand;        // array of card ids
    const elixir   = battle.aiElixir;
    const units    = battle.units;
    const towers   = battle.towers;

    // Filter playable cards
    const playable = hand
      .map((id, idx) => ({ id, idx, cost: CARD_DEF[id]?.cost || 99 }))
      .filter(c => c.cost <= elixir);

    if (playable.length === 0) return null;

    // Situational logic
    const playerUnits = units.filter(u => u.owner === 'player' && !u.dead);
    const aiUnits     = units.filter(u => u.owner === 'enemy'  && !u.dead);

    let chosen = null;

    // 1. Defensive: counter a player push
    if (playerUnits.length >= 3) {
      chosen = this._prefer(playable, ['cannon','bombTower','pekka','witch','goblins','archers','minions']);
    }

    // 2. Counter with spell if many player units clumped
    if (!chosen && playerUnits.length >= 5) {
      chosen = this._prefer(playable, ['fireball','arrows','zap','lightning']);
    }

    // 3. Push: launch a big threat when no player units on AI side
    if (!chosen && playerUnits.filter(u => u.y < 16).length === 0) {
      chosen = this._prefer(playable, ['giant','pekka','balloon','prince','babyDragon','witch']);
    }

    // 4. Support a current push
    if (!chosen && aiUnits.length > 0) {
      chosen = this._prefer(playable, ['musketeer','archers','witch','minions','goblins','babyDragon']);
    }

    // 5. Fallback: cheapest available card
    if (!chosen) {
      chosen = playable.sort((a, b) => a.cost - b.cost)[0];
    }

    if (!chosen) return null;

    const { col, row } = this._pickPlacement(chosen.id, towers, aiUnits, playerUnits);
    return { cardIdx: chosen.idx, col, row };
  }

  _prefer(playable, preference) {
    for (const pref of preference) {
      const found = playable.find(c => c.id === pref);
      if (found) return found;
    }
    return null;
  }

  _pickPlacement(cardId, towers, aiUnits, playerUnits) {
    const card  = CARD_DEF[cardId];
    const min   = C.ENEMY_DEPLOY_ROW_MIN ?? 0;
    const max   = C.TOWER_POS.enemy.king.row - 1;

    // Buildings go near the river on AI's side
    if (card.kind === 'building') {
      const bCol = 4 + Math.floor(Math.random() * 10);
      return { col: bCol, row: C.RIVER_TOP - 3 };
    }

    // Spells: aim at player units or player towers
    if (card.kind === 'spell') {
      if (playerUnits.length > 0) {
        const cluster = this._findCluster(playerUnits);
        return { col: cluster.col, row: cluster.row };
      }
      // Target player king princess tower closest to AI
      const pt = towers.player.left.dead ? towers.player.right : towers.player.left;
      return { col: pt.col + (Math.random() > 0.5 ? 1 : -1), row: pt.row };
    }

    // Troops: choose a lane
    const useLeft = Math.random() < 0.5;
    const col = useLeft
      ? 2 + Math.floor(Math.random() * 3)   // left lane
      : 13 + Math.floor(Math.random() * 3);  // right lane

    // Row: just below the river or at a push position
    const row = Math.min(max, C.RIVER_TOP - 1 - Math.floor(Math.random() * 3));
    return { col, row };
  }

  _findCluster(units) {
    const cx = units.reduce((s, u) => s + u.x, 0) / units.length;
    const cy = units.reduce((s, u) => s + u.y, 0) / units.length;
    return { col: Math.round(cx), row: Math.round(cy) };
  }
}
