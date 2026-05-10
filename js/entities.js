'use strict';

let _eid = 0;
const nextId = () => ++_eid;

// ─── Projectile ─────────────────────────────────────────────────────────────
class Projectile {
  constructor(sx, sy, target, dmg, splash, splashR, clr, owner) {
    this.id     = nextId();
    this.x      = sx; this.y = sy;
    this.target = target;        // Unit or Tower reference
    this.dmg    = dmg;
    this.splash = splash;
    this.splashR= splashR || 0;
    this.clr    = clr || '#ffd54f';
    this.owner  = owner;         // 'player' | 'enemy'
    this.speed  = C.PROJ_SPEED;  // cells/sec
    this.dead   = false;
    this.r      = 0.12;          // visual radius in cells
  }

  update(dt, units, towers, particles, cs) {
    if (this.dead || !this.target || this.target.dead) {
      this.dead = true; return;
    }
    const tx = this.target.x, ty = this.target.y;
    const dx = tx - this.x, dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;

    if (dist <= step + 0.01) {
      // Impact
      this.dead = true;
      this._impact(tx, ty, units, towers, particles, cs);
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  _impact(x, y, units, towers, particles, cs) {
    const px = x * cs, py = y * cs;
    if (this.splash) {
      // Damage all enemies in splash radius
      const foes = units.filter(u => u.owner !== this.owner && !u.dead);
      for (const u of foes) {
        if (Math.hypot(u.x - x, u.y - y) <= this.splashR) {
          u.takeDamage(this.dmg);
          particles.hit(u.x * cs, u.y * cs, this.clr);
        }
      }
      particles.explosion(px, py, this.splashR * cs);
    } else {
      if (!this.target.dead) {
        this.target.takeDamage(this.dmg);
        particles.hit(px, py, this.clr);
      }
    }
  }

  draw(ctx, cs) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x * cs, this.y * cs, this.r * cs, 0, Math.PI * 2);
    ctx.fillStyle = this.clr;
    ctx.fill();
    // Glow
    ctx.shadowBlur  = 6;
    ctx.shadowColor = this.clr;
    ctx.fill();
    ctx.restore();
  }
}

// ─── SpellEffect ─────────────────────────────────────────────────────────────
class SpellEffect {
  constructor(x, y, card, owner, units, towers, particles, cs) {
    this.x = x; this.y = y;
    this.owner = owner;
    this.dead  = false;
    this.life  = 0;

    const sp = card.spell;
    this.duration = sp.delay || 0.5;
    this.clr = sp.clr || '#fff';
    this.r   = sp.r || 2;
    this.alpha = 0.6;

    // Resolve after delay
    setTimeout(() => {
      if (sp.type === 'area')   this._area(sp, units, towers, particles, cs);
      if (sp.type === 'chain')  this._chain(sp, units, towers, particles, cs);
      if (sp.type === 'freeze') this._freeze(sp, units, towers, particles, cs);
    }, (sp.delay || 0.5) * 1000);
  }

  _area(sp, units, towers, particles, cs) {
    const foes = units.filter(u => u.owner !== this.owner && !u.dead);
    const foeTowers = this._foeTowers(towers);
    const cx = this.x, cy = this.y;

    for (const u of foes) {
      if (Math.hypot(u.x - cx, u.y - cy) <= sp.r) {
        u.takeDamage(sp.dmg);
        if (sp.stun) u.frozen = (u.frozen || 0) + sp.stun;
        particles.hit(u.x * cs, u.y * cs, sp.clr);
      }
    }
    for (const t of foeTowers) {
      if (!t.dead && Math.hypot(t.col - cx, t.row - cy) <= sp.r) {
        t.takeDamage(sp.dmg);
      }
    }
    particles.explosion(cx * cs, cy * cs, sp.r * cs * 0.7);
  }

  _chain(sp, units, towers, particles, cs) {
    const foes = units.filter(u => u.owner !== this.owner && !u.dead)
      .sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y));

    let prev = { x: this.x * cs, y: this.y * cs };
    const hit = new Set();
    let count = 0;
    for (const u of foes) {
      if (hit.has(u.id) || count >= sp.count) break;
      u.takeDamage(sp.dmg);
      hit.add(u.id);
      particles.lightning(prev.x, prev.y, u.x * cs, u.y * cs);
      particles.hit(u.x * cs, u.y * cs, sp.clr);
      prev = { x: u.x * cs, y: u.y * cs };
      count++;
    }
    // Also hit towers
    for (const t of this._foeTowers(towers)) {
      if (!t.dead && count < sp.count) {
        t.takeDamage(sp.dmg);
        particles.lightning(prev.x, prev.y, t.col * cs, t.row * cs);
        count++;
      }
    }
  }

  _freeze(sp, units, towers, particles, cs) {
    const foes = units.filter(u => u.owner !== this.owner && !u.dead);
    for (const u of foes) {
      if (Math.hypot(u.x - this.x, u.y - this.y) <= sp.r) {
        u.frozen = (u.frozen || 0) + sp.duration;
      }
    }
    particles.freeze(this.x * cs, this.y * cs, sp.r * cs);
  }

  _foeTowers(towers) {
    const side = this.owner === 'player' ? towers.enemy : towers.player;
    return [side.king, side.left, side.right].filter(Boolean);
  }

  update(dt) {
    this.life += dt;
    if (this.life >= this.duration + 0.3) this.dead = true;
    this.alpha = Math.max(0, 0.6 - (this.life / (this.duration + 0.3)) * 0.6);
  }

  draw(ctx, cs) {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.beginPath();
    ctx.arc(this.x * cs, this.y * cs, this.r * cs, 0, Math.PI * 2);
    ctx.fillStyle = this.clr;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

// ─── Tower ───────────────────────────────────────────────────────────────────
class Tower {
  constructor(type, kind, col, row, owner) {
    this.id     = nextId();
    this.type   = type;    // 'king' | 'princess'
    this.kind   = kind;    // same as type for clarity
    this.col    = col; this.row = row;
    this.x      = col; this.y = row;  // alias for spell targeting
    this.owner  = owner;  // 'player' | 'enemy'
    this.dead   = false;

    const stats = C.TOWER_STATS[type === 'king' ? 'king' : 'princess'];
    this.maxHp    = stats.hp;
    this.hp       = stats.hp;
    this.dmg      = stats.damage;
    this.atkSpd   = stats.atkSpeed;
    this.range    = stats.range;
    this.radius   = stats.radius;
    this.splash   = stats.splash;

    this.atkTimer = 0;
    this.activated = type === 'king' ? true : false; // princess inactive until hit or king dead

    // Visual
    this.shakeX = 0; this.shakeY = 0;
    this.shakeDur = 0;
    this.deathAlpha = 1;
    this.scale = 1;
    this.animT = Math.random() * Math.PI * 2;
  }

  get hpFraction() { return Math.max(0, this.hp / this.maxHp); }

  takeDamage(dmg) {
    if (this.dead) return;
    this.hp -= dmg;
    this.activated = true;
    this.shakeX = (Math.random() - 0.5) * 8;
    this.shakeY = (Math.random() - 0.5) * 8;
    this.shakeDur = 0.18;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
  }

  update(dt, units, projectiles, particles, cs) {
    this.animT += dt * 1.2;

    if (this.shakeDur > 0) {
      this.shakeDur -= dt;
      if (this.shakeDur <= 0) { this.shakeX = 0; this.shakeY = 0; }
    }

    if (this.dead) {
      this.deathAlpha = Math.max(0, this.deathAlpha - dt * 1.5);
      return;
    }
    if (!this.activated) return;

    // Find target
    this.atkTimer += dt;
    if (this.atkTimer < this.atkSpd) return;

    const foes = units.filter(u =>
      u.owner !== this.owner && !u.dead &&
      (u.fly || !u.fly) &&  // towers attack air and ground
      Math.hypot(u.x - this.col, u.y - this.row) <= this.range
    ).sort((a, b) =>
      Math.hypot(a.x - this.col, a.y - this.row) - Math.hypot(b.x - this.col, b.y - this.row)
    );

    if (foes.length === 0) return;
    this.atkTimer = 0;

    const target = foes[0];
    projectiles.push(new Projectile(
      this.col, this.row, target, this.dmg,
      this.splash, this.splash ? 1.5 : 0,
      this.owner === 'player' ? '#64b5f6' : '#ef9a9a',
      this.owner
    ));
    particles.hit(target.x * cs, target.y * cs, '#fff');
  }

  draw(ctx, cs) {
    if (this.dead && this.deathAlpha <= 0) return;

    const px = this.col * cs + this.shakeX;
    const py = this.row * cs + this.shakeY;
    const isKing = this.type === 'king';
    const w = (isKing ? 1.6 : 1.1) * cs;
    const h = (isKing ? 2.2 : 1.6) * cs;
    const baseClr = this.owner === 'player' ? C.CLR.playerTower : C.CLR.enemyTower;
    const topClr  = isKing ? C.CLR.kingGold : baseClr;

    ctx.save();
    ctx.globalAlpha = this.dead ? this.deathAlpha : 1;

    // Shadow
    ctx.beginPath();
    ctx.ellipse(px, py + h * 0.5, w * 0.4, w * 0.12, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fill();

    // Tower body
    const bob = Math.sin(this.animT) * C.TOWER_ANIM_BOB * cs;
    const bx = px - w / 2, by = py - h + bob;

    // Base stone
    ctx.beginPath();
    ctx.roundRect(bx, by + h * 0.4, w, h * 0.6, [4]);
    ctx.fillStyle = '#5d4037';
    ctx.fill();

    // Middle body
    ctx.beginPath();
    ctx.roundRect(bx + w * 0.1, by, w * 0.8, h * 0.7, [6]);
    ctx.fillStyle = baseClr;
    ctx.fill();

    // Battlements (3 teeth on top)
    const toothW = w * 0.22;
    const toothH = h * 0.16;
    [-0.28, 0, 0.28].forEach(off => {
      ctx.beginPath();
      ctx.rect(bx + w * (0.5 + off) - toothW / 2, by - toothH, toothW, toothH);
      ctx.fillStyle = topClr;
      ctx.fill();
    });

    // Window slit
    ctx.beginPath();
    ctx.rect(px - w * 0.07, by + h * 0.2, w * 0.14, h * 0.18);
    ctx.fillStyle = '#1a1a2e';
    ctx.fill();

    // Crown on King tower
    if (isKing && !this.dead) {
      ctx.font = `${Math.round(w * 0.8)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('👑', px, by - toothH);
    }

    // HP bar
    if (!this.dead) {
      const barW = w * 1.1;
      const barH = cs * 0.14;
      const bx2  = px - barW / 2;
      const by2  = by - h * 0.04 - barH - 4;
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.roundRect(bx2, by2, barW, barH, [3]);
      ctx.fill();

      const f = this.hpFraction;
      const hpClr = f > 0.5 ? C.CLR.hpGreen : f > 0.25 ? C.CLR.hpYellow : C.CLR.hpRed;
      ctx.fillStyle = hpClr;
      ctx.beginPath();
      ctx.roundRect(bx2, by2, barW * f, barH, [3]);
      ctx.fill();

      // HP text
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(cs * 0.12)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.ceil(this.hp), px, by2 + barH / 2);
    }

    ctx.restore();
  }
}

// ─── Unit ────────────────────────────────────────────────────────────────────
class Unit {
  constructor(unitId, col, row, owner) {
    this.id      = nextId();
    this.unitId  = unitId;
    this.owner   = owner;
    this.dead    = false;

    const def    = UNIT_DEF[unitId];
    if (!def) throw new Error(`Unknown unit: ${unitId}`);

    this.name    = def.name;
    this.maxHp   = def.hp;
    this.hp      = def.hp;
    this.dmg     = def.dmg;
    this.atkSpd  = def.atkSpd;
    this.spd     = def.spd;
    this.range   = def.range;
    this.splash  = def.splash || false;
    this.splashR = def.splashR || 0;
    this.fly     = def.fly || false;
    this.pref    = def.pref || 'any';
    this.radius  = def.r;
    this.clr     = def.clr;
    this.clr2    = def.clr2;
    this.building = def.building || false;

    this.x = col; this.y = row;
    this.targetX = col; this.targetY = row;

    this.atkTimer  = 0;
    this.frozen    = 0;
    this.target    = null;   // current attack target (unit or tower)
    this.path      = [];     // array of {col, row}
    this.pathIdx   = 0;

    // Spawner
    this.spawnerDef = def.spawner || null;
    this.spawnTimer = 0;

    // Prince charge
    this.chargeMulti = def.chargeMulti || 1;
    this.charging    = false;

    // Visual
    this.animT   = Math.random() * Math.PI * 2;
    this.deathT  = 0;
    this.hitFlash= 0;
    this.shakeX  = 0; this.shakeY = 0;

    // Death particles already emitted flag
    this._deathFired = false;
  }

  get hpFraction() { return Math.max(0, this.hp / this.maxHp); }

  takeDamage(dmg) {
    if (this.dead) return;
    this.hp -= dmg;
    this.hitFlash = 0.12;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
  }

  update(dt, units, towers, projectiles, particles, pathfinder, cs) {
    this.animT += dt * 3;

    if (this.frozen > 0) {
      this.frozen -= dt;
      return;
    }

    if (this.dead) {
      this.deathT += dt;
      if (!this._deathFired) {
        this._deathFired = true;
        particles.death(this.x * cs, this.y * cs, this.clr, this.radius * cs);
      }
      return;
    }

    if (this.hitFlash > 0) this.hitFlash -= dt;

    // Spawner logic
    if (this.spawnerDef) {
      this.spawnTimer += dt;
      if (this.spawnTimer >= this.spawnerDef.interval) {
        this.spawnTimer = 0;
        // Emitted via event; handled in game.js
        this._spawnRequest = { unitId: this.spawnerDef.unit, x: this.x, y: this.y };
      }
    }

    // Building: stationary
    if (this.building) {
      this._updateCombat(dt, units, towers, projectiles, particles, cs);
      return;
    }

    // Find target
    this.target = this._findTarget(units, towers);

    if (this.target) {
      const tx = this.target.x ?? this.target.col;
      const ty = this.target.y ?? this.target.row;
      const dist = Math.hypot(this.x - tx, this.y - ty);

      if (dist <= this.range) {
        this._updateCombat(dt, units, towers, projectiles, particles, cs);
      } else {
        this._moveToward(tx, ty, dt, units, towers, pathfinder);
      }
    } else {
      // No target yet, advance toward enemy king
      const kingPos = C.TOWER_POS[this.owner === 'player' ? 'enemy' : 'player'].king;
      this._moveToward(kingPos.col, kingPos.row, dt, units, towers, pathfinder);
    }
  }

  _findTarget(units, towers) {
    const foeUnits = units.filter(u =>
      u.owner !== this.owner && !u.dead && (this.fly || !u.fly || this.pref !== 'ground')
    );

    // Units prefer ground-level enemies unless flying pref
    let candidates = foeUnits;
    if (this.pref === 'buildings') {
      // Target enemy towers first
      const foeTowers = this._accessibleTowers(towers);
      if (foeTowers.length > 0) {
        return foeTowers.sort((a, b) =>
          Math.hypot(a.col - this.x, a.row - this.y) -
          Math.hypot(b.col - this.x, b.row - this.y)
        )[0];
      }
    }

    if (candidates.length === 0) {
      return this._accessibleTowers(towers)[0] || null;
    }

    return candidates.sort((a, b) =>
      Math.hypot(a.x - this.x, a.y - this.y) -
      Math.hypot(b.x - this.x, b.y - this.y)
    )[0];
  }

  _accessibleTowers(towers) {
    const side = towers[this.owner === 'player' ? 'enemy' : 'player'];
    const list = [side.left, side.right, side.king];
    // Princess towers block king until they're destroyed
    const princessAlive = !side.left.dead || !side.right.dead;
    return list.filter(t =>
      t && !t.dead && (t.type === 'king' ? !princessAlive : true)
    );
  }

  _moveToward(tx, ty, dt, units, towers, pathfinder) {
    // Use A* pathfinding to navigate
    const sc = Math.round(this.x), sr = Math.round(this.y);
    const gc = Math.round(tx),    gr = Math.round(ty);

    if (Math.abs(sc - this.x) < 0.05 && Math.abs(sr - this.y) < 0.05) {
      // Recompute path
      const blocked = units.filter(u => u.building && !u.dead)
        .map(u => ({ col: Math.round(u.x), row: Math.round(u.y) }));
      this.path = pathfinder.find(sc, sr, gc, gr, this.fly, blocked);
      this.pathIdx = 0;
    }

    // Step along path
    let nextC, nextR;
    if (this.path && this.pathIdx < this.path.length) {
      const step = this.path[this.pathIdx];
      nextC = step.col; nextR = step.row;
      if (Math.hypot(this.x - nextC, this.y - nextR) < 0.08) {
        this.pathIdx++;
        if (this.pathIdx < this.path.length) {
          nextC = this.path[this.pathIdx].col;
          nextR = this.path[this.pathIdx].row;
        }
      }
    } else {
      nextC = tx; nextR = ty;
    }

    const dx = nextC - this.x, dy = nextR - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.01) return;

    const speed = this.charging ? this.spd * this.chargeMulti : this.spd;
    const step  = Math.min(speed * dt, dist);
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
  }

  _updateCombat(dt, units, towers, projectiles, particles, cs) {
    this.atkTimer += dt;
    if (this.atkTimer < this.atkSpd) return;
    this.atkTimer = 0;

    const t = this.target;
    if (!t || (t.dead)) return;

    const tx = t.x ?? t.col;
    const ty = t.y ?? t.row;

    if (this.splash) {
      // Splash: deal damage to area around target
      const foes = units.filter(u =>
        u.owner !== this.owner && !u.dead &&
        Math.hypot(u.x - tx, u.y - ty) <= this.splashR
      );
      for (const u of foes) {
        u.takeDamage(this.dmg);
        particles.hit(u.x * cs, u.y * cs, this.clr);
      }
      // Also damage towers in splash
      const side = towers[this.owner === 'player' ? 'enemy' : 'player'];
      [side.king, side.left, side.right].forEach(tw => {
        if (tw && !tw.dead && Math.hypot(tw.col - tx, tw.row - ty) <= this.splashR) {
          tw.takeDamage(this.dmg);
        }
      });
      particles.explosion(tx * cs, ty * cs, this.splashR * cs * 0.6);
    } else {
      // Launch projectile (or instant melee)
      if (this.range <= 1.0) {
        t.takeDamage(this.dmg);
        particles.hit(tx * cs, ty * cs, this.clr);
      } else {
        projectiles.push(new Projectile(
          this.x, this.y, t, this.dmg,
          false, 0, this.clr, this.owner
        ));
      }
    }
  }

  draw(ctx, cs) {
    if (this.dead && this.deathT > 0.5) return;

    const px = this.x * cs;
    const py = this.y * cs;
    const r  = this.radius * cs;
    const bob = Math.sin(this.animT) * r * 0.08;

    ctx.save();
    if (this.dead) ctx.globalAlpha = Math.max(0, 1 - this.deathT * 2);
    if (this.frozen > 0) ctx.globalAlpha = 0.7;

    // Shadow
    ctx.beginPath();
    ctx.ellipse(px, py + r * 0.65, r * 0.55, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0,0,0,${C.UNIT_SHADOW_ALPHA})`;
    ctx.fill();

    // Hit flash overlay
    if (this.hitFlash > 0) {
      ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.6 + 0.4;
    }

    // Body
    drawUnitShape(ctx, this.unitId, px, py - bob, r, this.animT);

    // Frozen overlay
    if (this.frozen > 0) {
      ctx.beginPath();
      ctx.arc(px, py - bob, r * 1.05, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(129,212,250,0.35)';
      ctx.fill();
    }

    // HP bar (only if damaged)
    if (this.hp < this.maxHp && !this.dead) {
      const bw = r * 2.0, bh = r * 0.22;
      const bx = px - bw / 2, by = py - r * 1.4 - bob;
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, [2]);
      ctx.fill();
      const f = this.hpFraction;
      const hc = f > 0.5 ? C.CLR.hpGreen : f > 0.25 ? C.CLR.hpYellow : C.CLR.hpRed;
      ctx.fillStyle = hc;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw * f, bh, [2]);
      ctx.fill();
    }

    ctx.restore();
  }
}
