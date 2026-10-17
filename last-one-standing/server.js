'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.ALLOWED_ORIGIN || '*' }, pingInterval: 25000, pingTimeout: 20000 });
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, game: 'Last One Standing', rooms: rooms.size }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const rooms = new Map();
const MAX_PLAYERS = 8;
const W = 1000, H = 650;
const COLORS = ['#47f5ff','#ff4fd8','#b7ff4a','#ffb84d','#a78bfa','#ff5d73','#5dffa8','#f6f06d'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const makeCode = () => { let c; do { c = crypto.randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(c)); return c; };
function publicState(room) {
  return { code: room.code, phase: room.phase, timeLeft: Math.max(0, Math.ceil((room.endsAt - Date.now()) / 1000)), radius: room.radius,
    players: [...room.players.values()].map(p => ({ id:p.id, name:p.name, x:p.x, y:p.y, hp:p.hp, alive:p.alive, color:p.color, dashReady: Date.now() >= p.dashUntil })), winner: room.winner || null, minPlayers: 2, maxPlayers: MAX_PLAYERS };
}
function broadcast(room) { io.to(room.code).emit('state', publicState(room)); }
function resetPlayer(p, i) {
  const a = (Math.PI * 2 * i) / Math.max(2, MAX_PLAYERS);
  p.x = W/2 + Math.cos(a)*190; p.y = H/2 + Math.sin(a)*145;
  p.hp = 100; p.alive = true; p.vx = 0; p.vy = 0; p.dashUntil = 0; p.invulnUntil = Date.now()+1500;
}
function startGame(room) {
  if (room.players.size < 2 || room.phase !== 'lobby') return;
  room.phase = 'playing'; room.startedAt = Date.now(); room.endsAt = room.startedAt + 120000; room.radius = 285; room.winner = null;
  [...room.players.values()].forEach((p,i) => resetPlayer(p,i));
  io.to(room.code).emit('notice', 'Arena live! Stay inside the safe zone and be the last survivor.'); broadcast(room);
}
function leaveRoom(socket, silent=false) {
  const code = socket.data.roomCode; if (!code) return;
  const room = rooms.get(code); socket.leave(code); socket.data.roomCode = null;
  if (!room) return;
  room.players.delete(socket.id);
  if (!silent) io.to(code).emit('notice', `${socket.data.playerName || 'A player'} left the arena.`);
  if (room.players.size === 0) { clearInterval(room.loop); rooms.delete(code); return; }
  if (room.phase === 'playing') {
    const alive = [...room.players.values()].filter(p=>p.alive);
    if (alive.length <= 1) { room.phase='ended'; room.winner=alive[0]?.name || null; }
  }
  broadcast(room);
}
function createRoom(socket, name) {
  const code = makeCode(); const room = { code, players:new Map(), phase:'lobby', radius:285, winner:null, endsAt:0, startedAt:0, loop:null };
  rooms.set(code, room); joinRoom(socket, code, name);
  room.loop = setInterval(() => tick(room), 50);
  return room;
}
function joinRoom(socket, code, name) {
  const room = rooms.get(String(code || '').trim().toUpperCase());
  if (!room) return socket.emit('errorMessage', 'Room not found. Check the code and try again.');
  if (room.phase === 'playing' || room.phase === 'ended') return socket.emit('errorMessage', 'This match has already started. Create a new room for the next round.');
  if (room.players.size >= MAX_PLAYERS) return socket.emit('errorMessage', 'This room is full (8 players maximum).');
  leaveRoom(socket, true);
  const cleanName = String(name || 'Runner').replace(/[<>]/g,'').trim().slice(0,16) || 'Runner';
  const p = { id:socket.id, name:cleanName, x:W/2, y:H/2, hp:100, alive:true, color:COLORS[room.players.size % COLORS.length], vx:0, vy:0, dashUntil:0, invulnUntil:Date.now()+1500, input:{x:0,y:0,dash:false} };
  room.players.set(socket.id,p); socket.join(room.code); socket.data.roomCode=room.code; socket.data.playerName=cleanName;
  socket.emit('joined', { code:room.code, id:socket.id });
  io.to(room.code).emit('notice', `${cleanName} joined (${room.players.size}/${MAX_PLAYERS}).`); broadcast(room);
}
function tick(room) {
  if (room.phase !== 'playing') return;
  const now=Date.now(), elapsed=now-room.startedAt;
  room.radius=Math.max(65,285 - Math.max(0,elapsed-8000)/112000*220);
  const cx=W/2, cy=H/2;
  for (const p of room.players.values()) {
    if (!p.alive) continue;
    const input=p.input || {x:0,y:0,dash:false};
    let ix=clamp(Number(input.x)||0,-1,1), iy=clamp(Number(input.y)||0,-1,1);
    const mag=Math.hypot(ix,iy); if(mag>1){ix/=mag;iy/=mag;}
    let speed=205;
    if(input.dash && now>=p.dashUntil && mag>0.1){ speed=510; p.dashUntil=now+2200; p.invulnUntil=now+180; }
    p.vx=ix*speed; p.vy=iy*speed;
    p.x=clamp(p.x+p.vx*0.05,18,W-18); p.y=clamp(p.y+p.vy*0.05,18,H-18);
    const dist=Math.hypot(p.x-cx,p.y-cy);
    if(dist>room.radius && now>p.invulnUntil){ p.hp-= dist>room.radius+65 ? 1.6 : 0.65; if(p.hp<=0){p.hp=0;p.alive=false;io.to(room.code).emit('notice',`${p.name} was lost in the neon storm.`);} }
    else if(dist<room.radius-20) p.hp=Math.min(100,p.hp+0.10);
  }
  // Close-range contact bumps: dashers can knock opponents away, but cannot instantly eliminate them.
  const alive=[...room.players.values()].filter(p=>p.alive);
  for(let i=0;i<alive.length;i++) for(let j=i+1;j<alive.length;j++){
    const a=alive[i],b=alive[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
    if(d>0 && d<27){const push=(27-d)*0.55; a.x=clamp(a.x-dx/d*push,18,W-18);a.y=clamp(a.y-dy/d*push,18,H-18);b.x=clamp(b.x+dx/d*push,18,W-18);b.y=clamp(b.y+dy/d*push,18,H-18);}
  }
  const survivors=[...room.players.values()].filter(p=>p.alive);
  if(survivors.length<=1){room.phase='ended';room.winner=survivors[0]?.name||null;io.to(room.code).emit('notice',room.winner?`🏆 ${room.winner} is the last one standing!`:'Nobody survived the neon storm.');}
  else if(now>=room.endsAt){survivors.sort((a,b)=>a.hp-b.hp);const best=survivors[survivors.length-1];room.phase='ended';room.winner=best?.name||null;io.to(room.code).emit('notice',`Time is up! ${room.winner||'No one'} wins with the most health.`);}
  if(now%200<55 || room.phase==='ended') broadcast(room);
}

io.on('connection', socket => {
  socket.emit('welcome',{maxPlayers:MAX_PLAYERS});
  socket.on('createRoom', data => { const name=typeof data==='string'?data:data?.name; const room=createRoom(socket,name); socket.emit('created',{code:room.code}); });
  socket.on('joinRoom', data => joinRoom(socket,data?.code,data?.name));
  socket.on('input', data => {const room=rooms.get(socket.data.roomCode);const p=room?.players.get(socket.id);if(!p||room.phase!=='playing')return;p.input={x:clamp(Number(data?.x)||0,-1,1),y:clamp(Number(data?.y)||0,-1,1),dash:!!data?.dash};});
  socket.on('startGame', () => {const room=rooms.get(socket.data.roomCode);if(!room)return;if(room.players.size<2)return socket.emit('errorMessage','You need at least 2 players to start. Share your room code with a friend.');startGame(room);});
  socket.on('playAgain', () => {const room=rooms.get(socket.data.roomCode);if(!room||room.phase!=='ended')return;room.phase='lobby';room.winner=null;room.radius=285;for(const p of room.players.values()){p.hp=100;p.alive=true;p.input={x:0,y:0,dash:false};}broadcast(room);io.to(room.code).emit('notice','New round ready. The host can start when everyone is ready.');});
  socket.on('disconnect',()=>leaveRoom(socket));
});
const port=process.env.PORT||3000;
server.listen(port,'0.0.0.0',()=>console.log(`Last One Standing running on port ${port}`));
