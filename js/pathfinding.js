'use strict';

// ─── A* pathfinding on the arena grid ──────────────────────────────────────
// Bridges: ground units may cross the river only at LEFT_BRIDGE and RIGHT_BRIDGE columns.
// Flying units pass all cells freely.

class Pathfinder {
  constructor() {
    this._cache = new Map();
  }

  // Returns array of {col,row} steps from start → goal (exclusive of start).
  // blockedBuildings: array of {col,row} for placed buildings to avoid.
  find(startCol, startRow, goalCol, goalRow, flying, blockedBuildings = []) {
    const key = `${startCol},${startRow}→${goalCol},${goalRow},${flying}`;
    if (this._cache.has(key)) return this._cache.get(key);

    const path = this._aStar(
      Math.round(startCol), Math.round(startRow),
      Math.round(goalCol),  Math.round(goalRow),
      flying, blockedBuildings
    );
    // Cache but evict old entries to prevent unbounded growth
    if (this._cache.size > 800) this._cache.clear();
    this._cache.set(key, path);
    return path;
  }

  invalidate() { this._cache.clear(); }

  _aStar(sc, sr, gc, gr, flying, blocked) {
    const cols = C.COLS, rows = C.ROWS;

    // Fast out-of-bounds guard
    if (gc < 0 || gc >= cols || gr < 0 || gr >= rows) return [];
    if (sc === gc && sr === gr) return [];

    const blockedSet = new Set(blocked.map(b => `${b.col},${b.row}`));

    const h = (c, r) => Math.abs(c - gc) + Math.abs(r - gr);

    const open = new MinHeap((a, b) => a.f - b.f);
    const gCost = new Float32Array(rows * cols).fill(Infinity);
    const parent = new Int32Array(rows * cols).fill(-1);

    const idx = (c, r) => r * cols + c;
    const startIdx = idx(sc, sr);

    gCost[startIdx] = 0;
    open.push({ f: h(sc, sr), c: sc, r: sr });

    const dirs = [
      [0,-1],[0,1],[-1,0],[1,0],
      [-1,-1],[1,-1],[-1,1],[1,1]
    ];
    const diagCost = Math.SQRT2;

    while (!open.empty()) {
      const cur = open.pop();
      const { c, r } = cur;

      if (c === gc && r === gr) break;

      for (const [dc, dr] of dirs) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
        if (!flying && this._isBlocked(nc, nr, blockedSet)) continue;

        const cost = (dc !== 0 && dr !== 0) ? diagCost : 1;
        const ng = gCost[idx(c, r)] + cost;
        const ni = idx(nc, nr);

        if (ng < gCost[ni]) {
          gCost[ni] = ng;
          parent[ni] = idx(c, r);
          open.push({ f: ng + h(nc, nr), c: nc, r: nr });
        }
      }
    }

    // Reconstruct
    const path = [];
    let cur = idx(gc, gr);
    if (parent[cur] === -1 && (gc !== sc || gr !== sr)) return []; // no path

    while (cur !== idx(sc, sr)) {
      const c = cur % cols;
      const r = Math.floor(cur / cols);
      path.unshift({ col: c, row: r });
      cur = parent[cur];
      if (cur === -1) break;
    }
    return path;
  }

  _isBlocked(col, row, blockedSet) {
    if (blockedSet.has(`${col},${row}`)) return true;
    const rt = C.RIVER_TOP, rb = C.RIVER_BOTTOM;
    if (row < rt || row > rb) return false;  // not in river band

    // In river — only allowed at bridge columns
    const inLeft  = C.BRIDGE_LEFT.includes(col);
    const inRight = C.BRIDGE_RIGHT.includes(col);
    return !(inLeft || inRight);
  }
}

// ─── Minimal binary min-heap ────────────────────────────────────────────────
class MinHeap {
  constructor(cmp) {
    this._cmp = cmp;
    this._data = [];
  }
  push(val) {
    this._data.push(val);
    this._bubbleUp(this._data.length - 1);
  }
  pop() {
    const top = this._data[0];
    const last = this._data.pop();
    if (this._data.length > 0) {
      this._data[0] = last;
      this._siftDown(0);
    }
    return top;
  }
  empty() { return this._data.length === 0; }
  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._cmp(this._data[i], this._data[parent]) < 0) {
        [this._data[i], this._data[parent]] = [this._data[parent], this._data[i]];
        i = parent;
      } else break;
    }
  }
  _siftDown(i) {
    const n = this._data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this._cmp(this._data[l], this._data[smallest]) < 0) smallest = l;
      if (r < n && this._cmp(this._data[r], this._data[smallest]) < 0) smallest = r;
      if (smallest === i) break;
      [this._data[i], this._data[smallest]] = [this._data[smallest], this._data[i]];
      i = smallest;
    }
  }
}

// Nearest bridge entry point for a given column
function nearestBridgeEntry(col, owner) {
  // owner 'player' moves UP (decreasing row), enemy moves DOWN (increasing row)
  const leftCols  = C.BRIDGE_LEFT;
  const rightCols = C.BRIDGE_RIGHT;
  const leftCenter  = (leftCols[0]  + leftCols[leftCols.length - 1])  / 2;
  const rightCenter = (rightCols[0] + rightCols[rightCols.length - 1]) / 2;
  const useLeft = Math.abs(col - leftCenter) <= Math.abs(col - rightCenter);
  const bridgeCols = useLeft ? leftCols : rightCols;
  const bridgeRow  = owner === 'player' ? C.RIVER_TOP + 1 : C.RIVER_BOTTOM - 1;
  return { col: bridgeCols[Math.floor(bridgeCols.length / 2)], row: bridgeRow };
}
