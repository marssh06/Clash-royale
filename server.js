'use strict';

const { WebSocketServer } = require('ws');
const { createServer }    = require('http');
const { randomUUID }      = require('crypto');
const path = require('path');
const fs   = require('fs');

const PORT = process.env.PORT || 3000;

// ─── HTTP server (serves static files) ───────────────────────────────────────
const httpServer = createServer((req, res) => {
  const base = path.join(__dirname);
  let filePath = path.join(base, req.url === '/' ? 'index.html' : req.url);

  // Security: prevent directory traversal
  if (!filePath.startsWith(base)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404); res.end('Not found');
      } else {
        res.writeHead(500); res.end('Server error');
      }
      return;
    }

    const ext = path.extname(filePath);
    const mime = {
      '.html':'text/html', '.css':'text/css',
      '.js':'application/javascript', '.json':'application/json',
      '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml'
    }[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

// ─── WebSocket matchmaking ────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });

const players = new Map();   // id → { ws, name, trophies, roomId }
const rooms   = new Map();   // roomId → { p1, p2, state }
const queue   = [];          // waiting player ids

wss.on('connection', (ws) => {
  const id = randomUUID();
  players.set(id, { ws, id, name: 'Player', trophies: 0, roomId: null });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }
    handleMessage(id, msg);
  });

  ws.on('close', () => {
    const p = players.get(id);
    if (p?.roomId) {
      const room = rooms.get(p.roomId);
      if (room) {
        const opp = [room.p1, room.p2].find(x => x !== id);
        if (opp) sendTo(opp, { type: 'opp_disconnected' });
        rooms.delete(p.roomId);
      }
    }
    // Remove from queue
    const qi = queue.indexOf(id);
    if (qi !== -1) queue.splice(qi, 1);
    players.delete(id);
    console.log(`[Server] Player disconnected. Online: ${players.size}`);
  });

  ws.on('error', () => {});

  console.log(`[Server] Player connected. Online: ${players.size}`);
});

function handleMessage(id, msg) {
  const p = players.get(id);
  if (!p) return;

  switch (msg.type) {
    case 'join':
      p.name     = (msg.name    || 'Player').slice(0, 16);
      p.trophies = Math.max(0, parseInt(msg.trophies) || 0);
      matchmake(id);
      break;

    case 'card_play':
      if (!p.roomId) return;
      // Validate: col/row in bounds, card index 0-3
      if (!Number.isInteger(msg.col) || !Number.isInteger(msg.row)) return;
      if (msg.cardIdx < 0 || msg.cardIdx > 3) return;

      // Relay to opponent
      const room = rooms.get(p.roomId);
      if (!room) return;
      const oppId = room.p1 === id ? room.p2 : room.p1;
      sendTo(oppId, {
        type: 'card_play',
        cardIdx: msg.cardIdx,
        col: msg.col,
        row: msg.row
      });
      break;

    case 'chat':
      const rm = rooms.get(p.roomId);
      if (!rm) return;
      const oId = rm.p1 === id ? rm.p2 : rm.p1;
      sendTo(oId, { type: 'chat', name: p.name, text: String(msg.text).slice(0, 80) });
      break;
  }
}

function matchmake(id) {
  // Remove any existing entry
  const qi = queue.indexOf(id);
  if (qi !== -1) queue.splice(qi, 1);

  // Find best trophy match in queue
  const p = players.get(id);
  let bestIdx = -1, bestDiff = Infinity;

  for (let i = 0; i < queue.length; i++) {
    const q = players.get(queue[i]);
    if (!q) continue;
    const diff = Math.abs((q.trophies || 0) - (p.trophies || 0));
    if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
  }

  if (bestIdx !== -1) {
    const oppId = queue.splice(bestIdx, 1)[0];
    createRoom(id, oppId);
  } else {
    queue.push(id);
    sendTo(id, { type: 'queued' });
    console.log(`[Server] ${p.name} queued. Queue length: ${queue.length}`);
  }
}

function createRoom(p1Id, p2Id) {
  const roomId = randomUUID();
  const p1 = players.get(p1Id);
  const p2 = players.get(p2Id);
  if (!p1 || !p2) return;

  p1.roomId = roomId;
  p2.roomId = roomId;
  rooms.set(roomId, { p1: p1Id, p2: p2Id, startTime: Date.now() });

  sendTo(p1Id, { type: 'matched', oppName: p2.name, oppTrophies: p2.trophies, side: 'player' });
  sendTo(p2Id, { type: 'matched', oppName: p1.name, oppTrophies: p1.trophies, side: 'enemy'  });

  console.log(`[Server] Match created: ${p1.name} vs ${p2.name} (room ${roomId})`);
}

function sendTo(id, msg) {
  const p = players.get(id);
  if (p?.ws.readyState === 1) {
    try { p.ws.send(JSON.stringify(msg)); } catch (_) {}
  }
}

// ─── Leaderboard endpoint ─────────────────────────────────────────────────────
// Simple in-memory score tracking (resets on server restart)
const leaderboard = [];

function updateLeaderboard(name, trophies) {
  const existing = leaderboard.find(e => e.name === name);
  if (existing) existing.trophies = Math.max(existing.trophies, trophies);
  else leaderboard.push({ name, trophies });
  leaderboard.sort((a, b) => b.trophies - a.trophies);
  if (leaderboard.length > 100) leaderboard.splice(100);
}

// ─── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`\n🎮 Crown Clash server running at http://localhost:${PORT}`);
  console.log(`   Open in browser to play vs CPU, or use two tabs for local online!\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => { httpServer.close(); process.exit(0); });
process.on('SIGINT',  () => { httpServer.close(); process.exit(0); });
