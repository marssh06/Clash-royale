'use strict';

const C = Object.freeze({
  COLS: 18,
  ROWS: 32,

  RIVER_TOP: 14,
  RIVER_BOTTOM: 17,

  // Columns within river rows where ground units may cross
  BRIDGE_LEFT:  [4, 5],
  BRIDGE_RIGHT: [12, 13],

  TOWER_POS: {
    player: {
      king:  { col: 9,  row: 28 },
      left:  { col: 3,  row: 23 },
      right: { col: 15, row: 23 }
    },
    enemy: {
      king:  { col: 9,  row: 3 },
      left:  { col: 3,  row: 8  },
      right: { col: 15, row: 8  }
    }
  },

  DEPLOY_ROW_MIN: 16, // player may place cards below this row
  DEPLOY_ROW_MAX: 31,

  MAX_ELIXIR: 10,
  ELIXIR_RATE_NORMAL: 1.0,  // per second
  ELIXIR_RATE_DOUBLE: 2.0,
  DOUBLE_ELIXIR_AT: 60,     // seconds remaining when double elixir kicks in

  MATCH_DURATION: 180,      // seconds
  OVERTIME_DURATION: 60,

  // Visual palette
  CLR: {
    grassDark:    '#2e7d32',
    grassMid:     '#388e3c',
    grassLight:   '#43a047',
    river:        '#0d47a1',
    riverShimmer: '#1565c0',
    bridge:       '#6d4c41',
    bridgeEdge:   '#4e342e',
    playerSide:   'rgba(13,71,161,0.12)',
    enemySide:    'rgba(183,28,28,0.12)',
    playerTower:  '#1565c0',
    enemyTower:   '#b71c1c',
    kingGold:     '#f9a825',
    hpGreen:      '#43a047',
    hpYellow:     '#fdd835',
    hpRed:        '#e53935',
    elixirBar:    '#9c27b0',
    elixirFill:   '#ce93d8',
    textLight:    '#ffffff',
    textGold:     '#ffd54f',
    shadow:       'rgba(0,0,0,0.5)',
  },

  // Tower base stats (scaled by level in real game; fixed here for MVP)
  TOWER_STATS: {
    king: {
      hp: 4000, damage: 130, atkSpeed: 1.0, range: 7.0,
      radius: 1.0, splash: false
    },
    princess: {
      hp: 2000, damage: 90, atkSpeed: 0.9, range: 6.5,
      radius: 0.7, splash: false
    }
  },

  // Projectile speed (cells/sec)
  PROJ_SPEED: 14,

  // Visual
  UNIT_SHADOW_ALPHA: 0.35,
  TOWER_ANIM_BOB: 0.04,  // subtle tower breathing scale

  // AI timing (seconds between card decisions)
  AI_THINK_MIN: 1.8,
  AI_THINK_MAX: 4.5,
});
