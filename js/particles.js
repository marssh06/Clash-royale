'use strict';

// ─── Particle ───────────────────────────────────────────────────────────────
class Particle {
  constructor(x, y, opts = {}) {
    this.x  = x; this.y = y;
    this.vx = opts.vx || (Math.random() - 0.5) * (opts.spread || 80);
    this.vy = opts.vy || (Math.random() - 0.5) * (opts.spread || 80);
    this.gravity = opts.gravity ?? 60;
    this.life  = 0;
    this.maxLife = opts.life || (0.4 + Math.random() * 0.5);
    this.r     = opts.r || (4 + Math.random() * 6);
    this.clr   = opts.clr || '#ffffff';
    this.alpha = 1;
    this.dead  = false;
    this.shape = opts.shape || 'circle';  // 'circle' | 'star' | 'spark'
    this.rot   = Math.random() * Math.PI * 2;
    this.rotV  = (Math.random() - 0.5) * 8;
  }

  update(dt) {
    this.life += dt;
    if (this.life >= this.maxLife) { this.dead = true; return; }
    const t = this.life / this.maxLife;
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.vy += this.gravity * dt;
    this.rot += this.rotV * dt;
    this.alpha = 1 - t;
    this.r *= 0.992;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.fillStyle = this.clr;

    if (this.shape === 'star') {
      _drawStar(ctx, 0, 0, this.r * 0.5, this.r, 5);
    } else if (this.shape === 'spark') {
      ctx.beginPath();
      ctx.moveTo(-this.r * 1.8, 0);
      ctx.lineTo(this.r * 1.8, 0);
      ctx.strokeStyle = this.clr;
      ctx.lineWidth = this.r * 0.4;
      ctx.lineCap = 'round';
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, this.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function _drawStar(ctx, x, y, r1, r2, pts) {
  ctx.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const a = (i * Math.PI) / pts - Math.PI / 2;
    const r = i % 2 === 0 ? r2 : r1;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else         ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
}

// ─── ParticleSystem ─────────────────────────────────────────────────────────
class ParticleSystem {
  constructor() {
    this._pool = [];
    this._active = [];
  }

  _get(x, y, opts) {
    const p = this._pool.pop() || new Particle(0, 0);
    Object.assign(p, new Particle(x, y, opts));
    return p;
  }

  _burst(x, y, count, opts) {
    for (let i = 0; i < count; i++) {
      this._active.push(this._get(x, y, opts));
    }
  }

  // Public effect emitters

  hit(x, y, clr = '#ffcc00') {
    this._burst(x, y, 8, { clr, spread: 90, r: 5, life: 0.35, gravity: 80 });
    this._burst(x, y, 4, { clr:'#ffffff', spread:60, r:3, shape:'spark', life:0.25, gravity:0 });
  }

  death(x, y, clr = '#888', r = 20) {
    this._burst(x, y, 16, { clr, spread: 140, r: r * 0.4, life: 0.7, gravity: 100 });
    this._burst(x, y, 8,  { clr:'#ffffff', spread: 80, r: 4, shape:'star', life: 0.6, gravity: 40 });
  }

  explosion(x, y, radius = 60) {
    const clrs = ['#ff5722','#ff9800','#fdd835','#ff1744'];
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2;
      const spd = 60 + Math.random() * radius * 1.4;
      this._active.push(this._get(x, y, {
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        clr: clrs[i % clrs.length],
        r: 6 + Math.random() * 8,
        life: 0.6 + Math.random() * 0.4,
        gravity: 120,
        shape: 'circle'
      }));
    }
    // Smoke puffs
    for (let i = 0; i < 6; i++) {
      this._active.push(this._get(x, y, {
        vx: (Math.random() - 0.5) * 40,
        vy: -30 - Math.random() * 50,
        clr: '#9e9e9e',
        r: 14 + Math.random() * 10,
        life: 0.9 + Math.random() * 0.4,
        gravity: -20
      }));
    }
  }

  lightning(x1, y1, x2, y2) {
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const mx = x1 + (x2 - x1) * t + (Math.random() - 0.5) * 30;
      const my = y1 + (y2 - y1) * t + (Math.random() - 0.5) * 30;
      this._active.push(this._get(mx, my, {
        vx: (Math.random() - 0.5) * 30,
        vy: (Math.random() - 0.5) * 30,
        clr: '#ffd54f',
        r: 4 + Math.random() * 4,
        life: 0.25,
        gravity: 0,
        shape: 'star'
      }));
    }
  }

  freeze(x, y, r = 50) {
    const clrs = ['#81d4fa','#b3e5fc','#e1f5fe','#ffffff'];
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist  = Math.random() * r;
      this._active.push(this._get(
        x + Math.cos(angle) * dist,
        y + Math.sin(angle) * dist, {
          vx: Math.cos(angle) * 15,
          vy: Math.sin(angle) * 15 - 20,
          clr: clrs[i % clrs.length],
          r: 3 + Math.random() * 4,
          life: 0.8 + Math.random() * 0.4,
          gravity: 10,
          shape: 'star'
        }
      ));
    }
  }

  elixirDrop(x, y) {
    this._burst(x, y, 5, {
      clr:'#ce93d8', spread:50, r:4, life:0.5,
      gravity: -30, shape:'circle'
    });
  }

  crown(x, y) {
    const clrs = ['#ffd54f','#ffb300','#ffe082','#fff9c4'];
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2;
      this._active.push(this._get(x, y, {
        vx: Math.cos(angle) * (80 + Math.random() * 80),
        vy: Math.sin(angle) * (80 + Math.random() * 80) - 60,
        clr: clrs[i % clrs.length],
        r: 6 + Math.random() * 8,
        life: 1.0 + Math.random() * 0.5,
        gravity: 100,
        shape: 'star'
      }));
    }
  }

  arrows(x, y, r = 60) {
    const clrs = ['#8bc34a','#33691e','#aed581'];
    for (let i = 0; i < 14; i++) {
      this._active.push(this._get(
        x + (Math.random() - 0.5) * r * 2,
        y + (Math.random() - 0.5) * r * 2, {
          vx: (Math.random() - 0.5) * 40,
          vy: -40 - Math.random() * 60,
          clr: clrs[i % clrs.length],
          r: 3,
          life: 0.5,
          gravity: 200,
          shape: 'spark'
        }
      ));
    }
  }

  towerShake(x, y, clr) {
    this._burst(x, y, 12, { clr, spread:100, r:8, life:0.8, gravity:80 });
    this._burst(x, y, 6, { clr:'#ffffff', spread:60, r:5, shape:'star', life:0.6, gravity:30 });
  }

  update(dt) {
    for (let i = this._active.length - 1; i >= 0; i--) {
      this._active[i].update(dt);
      if (this._active[i].dead) {
        this._pool.push(this._active.splice(i, 1)[0]);
      }
    }
  }

  draw(ctx) {
    for (const p of this._active) p.draw(ctx);
  }
}
