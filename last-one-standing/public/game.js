'use strict';
(() => {
  const socket = io();
  const $ = id => document.getElementById(id);
  const home=$('home'), roomScreen=$('roomScreen'), canvas=$('gameCanvas'), ctx=canvas.getContext('2d');
  const state={id:null,code:null,phase:'lobby',players:[],timeLeft:120,radius:285,winner:null,keys:{},touch:{x:0,y:0},dash:false,toastTimer:null,notice:'',lastInput:0};
  const COLORS=['#47f5ff','#ff4fd8','#b7ff4a','#ffb84d','#a78bfa','#ff5d73','#5dffa8','#f6f06d'];
  function err(msg){$('formError').textContent=msg;}
  function showToast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>el.classList.remove('show'),2600);}
  function name(){return $('playerName').value.trim().slice(0,16)||'Runner';}
  $('createBtn').addEventListener('click',()=>{err('');socket.emit('createRoom',{name:name()});$('createBtn').disabled=true;setTimeout(()=>$('createBtn').disabled=false,1200);});
  $('joinBtn').addEventListener('click',()=>{err('');const code=$('roomCode').value.trim().toUpperCase();if(code.length!==6){err('Enter the 6-character room code.');return;}socket.emit('joinRoom',{code,name:name()});});
  $('roomCode').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6));
  $('roomCode').addEventListener('keydown',e=>{if(e.key==='Enter')$('joinBtn').click();});
  socket.on('connect',()=>{if(!$('createBtn').disabled)err('');});
  socket.on('connect_error',()=>err('Cannot connect to the game server. Refresh and try again.'));
  socket.on('created',data=>{state.code=data.code;$('roomCode').value=data.code;});
  socket.on('joined',data=>{state.code=data.code;state.id=data.id;home.classList.add('hidden');roomScreen.classList.remove('hidden');$('copyCode').innerHTML=`${data.code} <b>⧉</b>`;err('');draw();});
  socket.on('errorMessage',msg=>{err(msg);showToast(msg);});
  socket.on('notice',msg=>{state.notice=msg;showToast(msg);});
  socket.on('state',s=>{state.code=s.code;state.phase=s.phase;state.players=s.players;state.timeLeft=s.timeLeft;state.radius=s.radius;state.winner=s.winner;renderUI();draw();});
  $('copyCode').addEventListener('click',async()=>{if(!state.code)return;try{await navigator.clipboard.writeText(state.code);showToast('Room code copied. Send it to your friends!');}catch{const el=document.createElement('textarea');el.value=state.code;document.body.appendChild(el);el.select();document.execCommand('copy');el.remove();showToast('Room code copied!');}});
  $('startBtn').addEventListener('click',()=>{if(state.phase==='ended')socket.emit('playAgain');else socket.emit('startGame');});
  $('leaveBtn').addEventListener('click',()=>{socket.disconnect();location.reload();});
  $('dashBtn').addEventListener('pointerdown',e=>{e.preventDefault();state.dash=true;sendInput();});
  $('dashBtn').addEventListener('pointerup',()=>{state.dash=false;});$('dashBtn').addEventListener('pointercancel',()=>state.dash=false);
  $('dashBtn').addEventListener('pointerleave',()=>state.dash=false);
  function renderUI(){
    $('playerCount').textContent=`${state.players.length.toString().padStart(2,'0')} / 08`;
    $('timer').textContent=`${Math.floor(state.timeLeft/60).toString().padStart(2,'0')}:${(state.timeLeft%60).toString().padStart(2,'0')}`;
    $('timer').classList.toggle('danger',state.timeLeft<=20);
    $('phaseLabel').textContent=state.phase==='lobby'?'WAITING FOR PLAYERS':state.phase==='playing'?'● MATCH IN PROGRESS':'MATCH COMPLETE';
    const overlay=$('gameOverlay');overlay.classList.toggle('hidden',state.phase==='playing');
    const h3=overlay.querySelector('h3'),p=overlay.querySelector('p'),btn=$('startBtn');
    if(state.phase==='lobby'){h3.textContent='YOUR SQUAD IS FORMING';p.textContent=state.players.length<2?'Invite a friend to join. The match starts with at least two players.':'Squad ready. Start when everyone is in position.';btn.textContent='START MATCH ↗';btn.classList.remove('hidden');btn.disabled=state.players.length<2;}
    else if(state.phase==='ended'){h3.textContent=state.winner?`${state.winner.toUpperCase()} WINS!`:'NO SURVIVORS';p.textContent='The arena has spoken. Ready to run it back?';btn.textContent='PLAY AGAIN ↻';btn.classList.remove('hidden');btn.disabled=false;}
    else {h3.textContent='MATCH IN PROGRESS';btn.classList.add('hidden');}
    const list=$('playerList');list.innerHTML='';
    state.players.slice().sort((a,b)=>Number(b.alive)-Number(a.alive)||b.hp-a.hp).forEach((pl,i)=>{
      const row=document.createElement('div');row.className='player-row';const sw=document.createElement('span');sw.className='player-swatch';sw.style.background=pl.color;sw.style.boxShadow=`0 0 9px ${pl.color}55`;
      const info=document.createElement('div');info.className='player-info';const nm=document.createElement('div');nm.className='player-name';nm.textContent=pl.name+(pl.id===state.id?' (YOU)':'');const meta=document.createElement('div');meta.className='player-meta';meta.textContent=pl.alive?`${Math.ceil(pl.hp)} HP`:'ELIMINATED';info.append(nm,meta);
      const hp=document.createElement('div');hp.className='hp-track';const fill=document.createElement('div');fill.className='hp-fill';fill.style.width=`${pl.hp}%`;fill.style.background=pl.color;hp.append(fill);info.append(hp);row.append(sw,info);if(!pl.alive){const dead=document.createElement('span');dead.className='dead-label';dead.textContent='OUT';row.append(dead);}list.append(row);
    });
  }
  function sendInput(){if(state.phase!=='playing')return;let x=(state.keys.d||state.keys.ArrowRight?1:0)-(state.keys.a||state.keys.ArrowLeft?1:0)+state.touch.x;let y=(state.keys.s||state.keys.ArrowDown?1:0)-(state.keys.w||state.keys.ArrowUp?1:0)+state.touch.y;const mag=Math.hypot(x,y);if(mag>1){x/=mag;y/=mag;}socket.emit('input',{x,y,dash:state.dash||state.keys[' ']||false});}
  window.addEventListener('keydown',e=>{const k=e.key.length===1?e.key.toLowerCase():e.key;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();state.keys[k]=true;sendInput();});
  window.addEventListener('keyup',e=>{const k=e.key.length===1?e.key.toLowerCase():e.key;state.keys[k]=false;sendInput();});
  window.addEventListener('blur',()=>{state.keys={};state.touch={x:0,y:0};state.dash=false;sendInput();});
  document.querySelectorAll('[data-dir]').forEach(btn=>{const dirs={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};const start=e=>{e.preventDefault();state.touch={x:dirs[btn.dataset.dir][0],y:dirs[btn.dataset.dir][1]};sendInput();};const end=e=>{e.preventDefault();state.touch={x:0,y:0};sendInput();};btn.addEventListener('pointerdown',start);btn.addEventListener('pointerup',end);btn.addEventListener('pointercancel',end);btn.addEventListener('pointerleave',end);});
  setInterval(()=>{if(state.phase==='playing')sendInput();},60);
  function draw(){
    const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='#080b1a';ctx.fillRect(0,0,w,h);
    ctx.save();ctx.strokeStyle='#19203c';ctx.lineWidth=1;for(let x=0;x<=w;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=0;y<=h;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    // outer border and animated ambient beacons
    ctx.strokeStyle='#32375a';ctx.lineWidth=2;ctx.strokeRect(12,12,w-24,h-24);
    const t=performance.now()/1000;for(let i=0;i<8;i++){const a=t*.24+i*Math.PI/4;const x=w/2+Math.cos(a)*470,y=h/2+Math.sin(a)*300;ctx.fillStyle=i%2?'#ff4fd8':'#47f5ff';ctx.shadowBlur=12;ctx.shadowColor=ctx.fillStyle;ctx.fillRect(x-2,y-2,4,4);}ctx.shadowBlur=0;
    const radius=state.radius;ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.arc(w/2,h/2,radius,0,Math.PI*2,true);ctx.fillStyle='rgba(255,65,130,.105)';ctx.fill('evenodd');ctx.restore();
    ctx.beginPath();ctx.arc(w/2,h/2,radius,0,Math.PI*2);ctx.strokeStyle='#ffb84d';ctx.lineWidth=2;ctx.shadowColor='#ff9b3d';ctx.shadowBlur=18;ctx.stroke();ctx.shadowBlur=0;
    // safe zone interior
    ctx.beginPath();ctx.arc(w/2,h/2,Math.max(0,radius-2),0,Math.PI*2);ctx.strokeStyle='#47f5ff33';ctx.lineWidth=1;ctx.stroke();
    // arena glyphs
    ctx.strokeStyle='#252b4b';ctx.lineWidth=2;for(const [x,y] of [[110,110],[890,110],[110,540],[890,540]]){ctx.beginPath();ctx.moveTo(x-10,y);ctx.lineTo(x+10,y);ctx.moveTo(x,y-10);ctx.lineTo(x,y+10);ctx.stroke();}
    for(const p of state.players){if(!p.alive)continue;ctx.save();ctx.translate(p.x,p.y);ctx.shadowColor=p.color;ctx.shadowBlur=p.id===state.id?22:12;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(0,0,p.id===state.id?12:10,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#fff';ctx.globalAlpha=.85;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,p.id===state.id?15:12,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;ctx.fillStyle='#07101c';ctx.beginPath();ctx.arc(0,0,3,0,Math.PI*2);ctx.fill();ctx.font='600 12px "Space Grotesk", sans-serif';ctx.textAlign='center';ctx.fillStyle='#f5f6ff';ctx.shadowColor='#080a18';ctx.shadowBlur=5;ctx.fillText(p.name+(p.id===state.id?' · YOU':''),0,-20);ctx.shadowBlur=0;ctx.restore();}
    ctx.restore();
  }
  function animate(){if(!roomScreen.classList.contains('hidden')&&state.phase!=='playing')draw();requestAnimationFrame(animate);}animate();
})();
