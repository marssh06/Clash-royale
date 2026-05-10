'use strict';

// ─── Unit stat templates ───────────────────────────────────────────────────
const UNIT_DEF = {
  knight: {
    name:'Knight', hp:1400, dmg:160, atkSpd:1.1, spd:2.0,
    range:0.85, splash:false, fly:false, pref:'any',
    r:0.38, clr:'#5c6bc0', clr2:'#283593', icon:'⚔️'
  },
  giant: {
    name:'Giant', hp:4600, dmg:200, atkSpd:1.5, spd:1.2,
    range:0.85, splash:false, fly:false, pref:'buildings',
    r:0.52, clr:'#8d6e63', clr2:'#4e342e', icon:'🦶'
  },
  musketeer: {
    name:'Musketeer', hp:700, dmg:220, atkSpd:1.1, spd:2.0,
    range:5.5, splash:false, fly:false, pref:'any',
    r:0.30, clr:'#ab47bc', clr2:'#6a1b9a', icon:'🔫'
  },
  archer: {
    name:'Archer', hp:308, dmg:80, atkSpd:0.9, spd:2.2,
    range:4.5, splash:false, fly:false, pref:'any',
    r:0.25, clr:'#66bb6a', clr2:'#2e7d32', icon:'🏹', count:2,
    offsets:[{dx:-0.4,dy:0},{dx:0.4,dy:0}]
  },
  minion: {
    name:'Minion', hp:200, dmg:90, atkSpd:0.85, spd:3.2,
    range:1.2, splash:false, fly:true, pref:'any',
    r:0.22, clr:'#8e24aa', clr2:'#4a148c', icon:'👾', count:3,
    offsets:[{dx:0,dy:0},{dx:-0.5,dy:0.3},{dx:0.5,dy:0.3}]
  },
  pekka: {
    name:'P.E.K.K.A', hp:7000, dmg:780, atkSpd:1.8, spd:1.5,
    range:0.90, splash:false, fly:false, pref:'any',
    r:0.52, clr:'#263238', clr2:'#000000', icon:'🤖'
  },
  babyDragon: {
    name:'Baby Dragon', hp:1400, dmg:150, atkSpd:1.5, spd:2.5,
    range:3.0, splash:true, splashR:1.6, fly:true, pref:'any',
    r:0.40, clr:'#00acc1', clr2:'#006064', icon:'🐲'
  },
  goblin: {
    name:'Goblin', hp:210, dmg:110, atkSpd:0.85, spd:3.2,
    range:0.75, splash:false, fly:false, pref:'any',
    r:0.22, clr:'#00e676', clr2:'#00600f', icon:'👺', count:3,
    offsets:[{dx:0,dy:0},{dx:-0.45,dy:0.3},{dx:0.45,dy:0.3}]
  },
  witch: {
    name:'Witch', hp:800, dmg:120, atkSpd:1.0, spd:2.0,
    range:5.0, splash:true, splashR:1.2, fly:false, pref:'any',
    r:0.35, clr:'#7b1fa2', clr2:'#4a148c', icon:'🧙',
    spawner:{unit:'skeleton', interval:7}
  },
  skeleton: {
    name:'Skeleton', hp:67, dmg:67, atkSpd:1.0, spd:3.5,
    range:0.65, splash:false, fly:false, pref:'any',
    r:0.20, clr:'#eeeeee', clr2:'#9e9e9e', icon:'💀'
  },
  balloon: {
    name:'Balloon', hp:3000, dmg:650, atkSpd:2.5, spd:1.5,
    range:1.2, splash:true, splashR:2.2, fly:true, pref:'buildings',
    r:0.50, clr:'#e53935', clr2:'#b71c1c', icon:'🎈'
  },
  prince: {
    name:'Prince', hp:2000, dmg:320, atkSpd:1.2, spd:2.5,
    range:0.90, splash:false, fly:false, pref:'any',
    r:0.40, clr:'#ef6c00', clr2:'#bf360c', icon:'🤺',
    chargeMulti:2.5
  },
  skeletonArmy: {
    name:'Skel. Army', hp:67, dmg:67, atkSpd:1.0, spd:3.5,
    range:0.65, splash:false, fly:false, pref:'any',
    r:0.20, clr:'#eeeeee', clr2:'#9e9e9e', icon:'💀', count:15
  },
  // Buildings
  cannon: {
    name:'Cannon', hp:800, dmg:180, atkSpd:0.8, spd:0,
    range:5.5, splash:false, fly:false, pref:'ground',
    r:0.40, clr:'#607d8b', clr2:'#37474f', icon:'💣', building:true
  },
  bombTower: {
    name:'Bomb Tower', hp:1200, dmg:200, atkSpd:1.5, spd:0,
    range:4.5, splash:true, splashR:1.5, fly:false, pref:'ground',
    r:0.40, clr:'#ff7043', clr2:'#bf360c', icon:'💥', building:true
  },
  goblinHut: {
    name:'Goblin Hut', hp:1000, dmg:0, atkSpd:0, spd:0,
    range:0, splash:false, fly:false, pref:'none',
    r:0.45, clr:'#8d6e63', clr2:'#4e342e', icon:'🏚️', building:true,
    spawner:{unit:'goblin', interval:5}
  },
};

// ─── Card catalogue ─────────────────────────────────────────────────────────
const CARD_DEF = {
  knight:      { id:'knight',      name:'Knight',      cost:3, kind:'troop',    unit:'knight'      },
  giant:       { id:'giant',       name:'Giant',       cost:5, kind:'troop',    unit:'giant'       },
  musketeer:   { id:'musketeer',   name:'Musketeer',   cost:4, kind:'troop',    unit:'musketeer'   },
  archers:     { id:'archers',     name:'Archers',     cost:3, kind:'troop',    unit:'archer'      },
  minions:     { id:'minions',     name:'Minions',     cost:3, kind:'troop',    unit:'minion'      },
  pekka:       { id:'pekka',       name:'P.E.K.K.A',  cost:7, kind:'troop',    unit:'pekka'       },
  babyDragon:  { id:'babyDragon',  name:'Baby Dragon', cost:4, kind:'troop',    unit:'babyDragon'  },
  goblins:     { id:'goblins',     name:'Goblins',     cost:2, kind:'troop',    unit:'goblin'      },
  witch:       { id:'witch',       name:'Witch',       cost:5, kind:'troop',    unit:'witch'       },
  balloon:     { id:'balloon',     name:'Balloon',     cost:5, kind:'troop',    unit:'balloon'     },
  prince:      { id:'prince',      name:'Prince',      cost:5, kind:'troop',    unit:'prince'      },
  skeletonArmy:{ id:'skeletonArmy',name:'Skel. Army',  cost:3, kind:'troop',    unit:'skeletonArmy'},
  fireball:    { id:'fireball',    name:'Fireball',    cost:4, kind:'spell',
                  spell:{ type:'area', dmg:800, r:2.5, clr:'#ff5722', delay:0.6 } },
  lightning:   { id:'lightning',   name:'Lightning',   cost:6, kind:'spell',
                  spell:{ type:'chain', dmg:700, count:3, clr:'#fdd835', delay:0.4 } },
  arrows:      { id:'arrows',      name:'Arrows',      cost:3, kind:'spell',
                  spell:{ type:'area', dmg:300, r:4.0, clr:'#8bc34a', delay:0.5 } },
  zap:         { id:'zap',         name:'Zap',         cost:2, kind:'spell',
                  spell:{ type:'area', dmg:160, r:2.0, clr:'#ffc107', delay:0.1, stun:0.5 } },
  freeze:      { id:'freeze',      name:'Freeze',      cost:4, kind:'spell',
                  spell:{ type:'freeze', dmg:0, r:3.0, clr:'#81d4fa', delay:0.3, duration:4 } },
  cannon:      { id:'cannon',      name:'Cannon',      cost:3, kind:'building', unit:'cannon'      },
  bombTower:   { id:'bombTower',   name:'Bomb Tower',  cost:4, kind:'building', unit:'bombTower'   },
  goblinHut:   { id:'goblinHut',   name:'Goblin Hut',  cost:4, kind:'building', unit:'goblinHut'   },
};

const DEFAULT_DECK = [
  'knight','giant','musketeer','archers',
  'fireball','arrows','cannon','zap'
];

const ALL_CARD_IDS = Object.keys(CARD_DEF);

// ─── Card renderer (draws card art onto a ctx) ──────────────────────────────
function drawCardArt(ctx, cardId, cx, cy, size) {
  const card = CARD_DEF[cardId];
  if (!card) return;

  ctx.save();
  ctx.translate(cx, cy);

  if (card.unit && UNIT_DEF[card.unit]) {
    _drawUnitIcon(ctx, card.unit, 0, 0, size * 0.4);
  } else if (card.kind === 'spell') {
    _drawSpellIcon(ctx, card, 0, 0, size * 0.4);
  }

  ctx.restore();
}

function _drawUnitIcon(ctx, unitId, x, y, r) {
  const u = UNIT_DEF[unitId];
  if (!u) return;

  // Shadow
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.6, r * 0.6, r * 0.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fill();

  // Body
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = u.clr;
  ctx.fill();
  ctx.strokeStyle = u.clr2;
  ctx.lineWidth = r * 0.15;
  ctx.stroke();

  // Eyes
  const ey = y - r * 0.2;
  [-0.28, 0.28].forEach(ex => {
    ctx.beginPath();
    ctx.arc(x + r * ex, ey, r * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + r * ex + r * 0.04, ey + r * 0.04, r * 0.09, 0, Math.PI * 2);
    ctx.fillStyle = '#333';
    ctx.fill();
  });

  // Flying indicator
  if (u.fly) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = `bold ${Math.round(r * 0.8)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', x, y + r * 0.55);
  }
}

function _drawSpellIcon(ctx, card, x, y, r) {
  const sp = card.spell;
  const clr = sp.clr || '#ffffff';

  // Glow ring
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, clr);
  grad.addColorStop(1, 'transparent');
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Icon character
  const icons = { fireball:'🔥', lightning:'⚡', arrows:'🏹', zap:'⚡', freeze:'❄️' };
  ctx.font = `${Math.round(r * 1.2)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icons[card.id] || '✨', x, y);
}

// Expose for unit rendering in game.js
function drawUnitShape(ctx, unitId, x, y, r, animPhase) {
  _drawUnitIcon(ctx, unitId, x, y, r);
}
