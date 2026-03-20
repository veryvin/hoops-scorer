/* ═══════════════════════════════════════
   HOOPS | app.js
   PWA + Supabase Realtime + Standings
═══════════════════════════════════════ */
'use strict';

/* ══════════════════════════════
   SUPABASE CONFIG
══════════════════════════════ */
const SUPABASE_URL = 'https://svtjetsjhuihtoplvotk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2dGpldHNqaHVpaHRvcGx2b3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5OTI1NDAsImV4cCI6MjA4OTU2ODU0MH0.c9aeahloK4kbNWBSFnc7mVqkVZ49CODWvMWT6_NQahU';

const db = {
  async query(table, options = {}) {
    const { method = 'GET', body, params = {} } = options;
    let url = `${SUPABASE_URL}/rest/v1/${table}`;
    const qp = new URLSearchParams(params);
    if ([...qp].length) url += '?' + qp.toString();
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    };
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || `HTTP ${res.status}`); }
    if (res.status === 204) return [];
    return res.json();
  },
  select: (t, p)    => db.query(t, { params: p }),
  insert: (t, b)    => db.query(t, { method: 'POST', body: b }),
  update: (t, b, p) => db.query(t, { method: 'PATCH', body: b, params: p }),
  delete: (t, p)    => db.query(t, { method: 'DELETE', params: p }),
};

/* ── Supabase Realtime ── */
let realtimeWs = null;

function connectRealtime() {
  const wsUrl = `${SUPABASE_URL.replace('https','wss')}/realtime/v1/websocket?apikey=${SUPABASE_KEY}&vsn=1.0.0`;
  realtimeWs = new WebSocket(wsUrl);

  realtimeWs.onopen = () => {
    setOnlineStatus(true);
    const msg = JSON.stringify({
      topic: 'realtime:public:games', event: 'phx_join',
      payload: { config: { broadcast: { self: false }, presence: { key: '' }, postgres_changes: [{ event: '*', schema: 'public', table: 'games' }] } },
      ref: '1'
    });
    realtimeWs.send(msg);
  };

  realtimeWs.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.event === 'postgres_changes' && msg.payload?.data) {
        const change = msg.payload.data;
        if (change.table === 'games') handleRealtimeGameChange(change);
      }
      if (msg.event === 'phx_reply' && msg.payload?.status === 'ok') {
        setTimeout(() => {
          if (realtimeWs?.readyState === WebSocket.OPEN)
            realtimeWs.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: null }));
        }, 25000);
      }
    } catch(e) { /* ignore */ }
  };

  realtimeWs.onclose = () => { setOnlineStatus(false); setTimeout(connectRealtime, 5000); };
  realtimeWs.onerror = () => setOnlineStatus(false);
}

function handleRealtimeGameChange(change) {
  const gameData = change.record || change.new_record;
  if (!gameData) return;
  if (state.currentGameId && gameData.id === state.currentGameId && viewerMode) syncGameFromDB(gameData);
  if (document.getElementById('view-games').classList.contains('active')) loadGames(currentGamesFilter);
}

function setOnlineStatus(online) {
  const dot = document.getElementById('onlineDot');
  const label = document.getElementById('onlineLabel');
  if (online) { dot.classList.add('live'); label.textContent = 'LIVE'; label.style.color = '#4caf50'; }
  else { dot.classList.remove('live'); label.textContent = 'OFFLINE'; label.style.color = 'var(--muted)'; }
}

function syncGameFromDB(gameData) {
  if (!gameData) return;
  state.home.score    = gameData.home_score    || 0;
  state.away.score    = gameData.away_score    || 0;
  state.home.fouls    = gameData.home_fouls    || 0;
  state.away.fouls    = gameData.away_fouls    || 0;
  state.home.timeouts = gameData.home_timeouts ?? 5;
  state.away.timeouts = gameData.away_timeouts ?? 5;
  state.home.pto      = gameData.home_pto      || 0;
  state.home.fbp      = gameData.home_fbp      || 0;
  state.home.twocp    = gameData.home_twocp    || 0;
  state.home.fbto     = gameData.home_fbto     || 0;
  state.away.pto      = gameData.away_pto      || 0;
  state.away.fbp      = gameData.away_fbp      || 0;
  state.away.twocp    = gameData.away_twocp    || 0;
  state.away.fbto     = gameData.away_fbto     || 0;
  state.quarter       = gameData.quarter       || '1';
  updateScore('home'); updateScore('away');
  updateMeta(); updateSpecialStats();
  document.querySelectorAll('.quarter-btn').forEach(b => b.classList.toggle('active', b.dataset.q === state.quarter));
}

/* ══════════════════════════════
   PWA SETUP
══════════════════════════════ */
let deferredInstallPrompt = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(e => console.warn('SW reg failed:', e));
  });
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showInstallBanner();
});

function showInstallBanner() {
  let banner = document.querySelector('.pwa-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'pwa-banner';
    banner.innerHTML = `
      <div class="pwa-banner-text">📱 <strong>INSTALL HOOPS</strong> — Add to home screen for the best experience!</div>
      <button class="pwa-install-btn" id="pwaInstallBtn">INSTALL</button>
      <button class="pwa-dismiss-btn" id="pwaDismissBtn">✕</button>
    `;
    document.body.appendChild(banner);
    document.getElementById('pwaInstallBtn').addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') banner.classList.remove('show');
        deferredInstallPrompt = null;
      }
    });
    document.getElementById('pwaDismissBtn').addEventListener('click', () => banner.classList.remove('show'));
  }
  setTimeout(() => banner.classList.add('show'), 2000);
}

/* ══════════════════════════════
   STATE
══════════════════════════════ */
const state = {
  quarter: '1',
  home: { name:'HOME', dbId:null, score:0, fouls:0, timeouts:2, timeoutsHalf:2, players:[], pto:0, fbp:0, twocp:0, fbto:0 },
  away: { name:'AWAY', dbId:null, score:0, fouls:0, timeouts:2, timeoutsHalf:2, players:[], pto:0, fbp:0, twocp:0, fbto:0 },
  selectedPlayer: null,
  history: [],
  plays: [],
  /* Running score events: [{team, pts, playerNum, scoreH, scoreA}] */
  scoringEvents: [],
  statsView: 'home',
  quarterScores: { '1':null,'2':null,'3':null,'4':null,'OT':null },
  currentGameId: null,
};

let viewerMode         = false;
let playerIdCounter    = 1;
let manageTeam         = 'home';
let setupTeam          = 'home';
let subTeam            = 'home';
let subOutPlayer       = null;
let subInPlayer        = null;
let saveGameTimer      = null;
let currentGamesFilter = 'all';
let currentGamesSort   = 'wins';
let currentGameDetailId = null;

const $ = id => document.getElementById(id);

const dom = {
  homeScore:$('homeScore'), awayScore:$('awayScore'),
  homeNameDisplay:$('homeNameDisplay'), awayNameDisplay:$('awayNameDisplay'),
  homeTO:$('homeTO'), awayTO:$('awayTO'), homeFouls:$('homeFouls'), awayFouls:$('awayFouls'),
  homePTO:$('homePTO'), awayPTO:$('awayPTO'),
  homeFBP:$('homeFBP'), awayFBP:$('awayFBP'),
  home2CP:$('home2CP'), away2CP:$('away2CP'),
  homeFBTO:$('homeFBTO'), awayFBTO:$('awayFBTO'),
  homePTOCount:$('homePTOCount'), awayPTOCount:$('awayPTOCount'),
  homeFBPCount:$('homeFBPCount'), awayFBPCount:$('awayFBPCount'),
  home2CPCount:$('home2CPCount'), away2CPCount:$('away2CPCount'),
  homeFBTOCount:$('homeFBTOCount'), awayFBTOCount:$('awayFBTOCount'),
  selectedLabel:$('selectedLabel'), statsBody:$('statsBody'),
  pbpList:$('pbpList'), pbpCount:$('pbpCount'),
  clockDisplay:$('clockDisplay'), clockStatus:$('clockStatus'),
  btnClockStart:$('btnClockStart'), btnClockPause:$('btnClockPause'), btnClockReset:$('btnClockReset'),
};

/* ══════════════════════════════
   NAVIGATION
══════════════════════════════ */
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    $(`view-${view}`).classList.add('active');
    if (view === 'games')     loadGames(currentGamesFilter);
    if (view === 'teams')     loadTeamsView();
    if (view === 'standings') loadStandings(currentGamesSort);
  });
});

/* ══════════════════════════════
   CLOCK
══════════════════════════════ */
const clock = { totalSeconds:12*60, remaining:12*60, running:false, interval:null, defaultMins:12 };

function formatTime(sec) { return `${Math.floor(sec/60).toString().padStart(2,'0')}:${(sec%60).toString().padStart(2,'0')}`; }

function updateClockDisplay() {
  dom.clockDisplay.textContent = formatTime(clock.remaining);
  dom.clockDisplay.classList.remove('running','warning','expired');
  if (clock.remaining === 0) { dom.clockDisplay.classList.add('expired'); dom.clockStatus.textContent = 'EXPIRED'; }
  else if (clock.running) { dom.clockDisplay.classList.add(clock.remaining<=60?'warning':'running'); dom.clockStatus.textContent = clock.remaining<=60?'LAST MINUTE':'RUNNING'; }
  else { dom.clockStatus.textContent = clock.remaining===clock.totalSeconds?'READY':'PAUSED'; }
}

function startClock() {
  if (clock.running || clock.remaining===0) return;
  clock.running=true; dom.btnClockStart.disabled=true; dom.btnClockPause.disabled=false;
  updateClockDisplay();
  clock.interval = setInterval(() => {
    if (clock.remaining>0) { clock.remaining--; updateClockDisplay(); if (clock.remaining===0) { stopClock(); toast('⏰ Quarter time is up!'); addPlay(null,`Q${state.quarter} — Clock expired`,'sys',0); } }
  }, 1000);
}

function stopClock() { clock.running=false; clearInterval(clock.interval); clock.interval=null; dom.btnClockStart.disabled=false; dom.btnClockPause.disabled=true; updateClockDisplay(); }
function resetClock() { stopClock(); clock.remaining=clock.totalSeconds; updateClockDisplay(); }
function setClockMins(m) { stopClock(); clock.defaultMins=m; clock.totalSeconds=m*60; clock.remaining=clock.totalSeconds; document.querySelectorAll('.clock-set-btn').forEach(b=>b.classList.toggle('active-set',parseInt(b.dataset.mins)===m)); updateClockDisplay(); }

dom.btnClockStart.addEventListener('click', startClock);
dom.btnClockPause.addEventListener('click', stopClock);
dom.btnClockReset.addEventListener('click', resetClock);
document.querySelectorAll('.clock-set-btn').forEach(btn=>btn.addEventListener('click',()=>setClockMins(parseInt(btn.dataset.mins))));

/* ══════════════════════════════
   QUARTER
══════════════════════════════ */
document.querySelectorAll('.quarter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.quarterScores[state.quarter] = { home:state.home.score, away:state.away.score };
    document.querySelectorAll('.quarter-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); state.quarter = btn.dataset.q;
    // Reset timeouts at half transitions
    const q = btn.dataset.q;
    if (q === '3') {
      // Start of 2nd half — 3 timeouts each
      state.home.timeouts = 3; state.home.timeoutsHalf = 3;
      state.away.timeouts = 3; state.away.timeoutsHalf = 3;
      toast('Q3 started — 3 timeouts per team');
    } else if (q === '1') {
      // Start of 1st half — 2 timeouts each
      state.home.timeouts = 2; state.home.timeoutsHalf = 2;
      state.away.timeouts = 2; state.away.timeoutsHalf = 2;
      toast('Q1 started — 2 timeouts per team');
    } else if (q === '2') {
      toast(`Q2 started`);
    } else if (q === '4') {
      toast(`Q4 started`);
    } else {
      toast(`Q${state.quarter} started`);
    }
    resetClock(); addPlay(null,`Quarter ${state.quarter} started`,'sys',0); scheduleSaveGame();
    updateMeta();
  });
});

/* ══════════════════════════════
   SUPABASE HELPERS
══════════════════════════════ */
async function getOrCreateTeam(name) {
  const existing = await db.select('teams', { 'name':`eq.${name}`, 'select':'id,name' });
  if (existing.length) return existing[0].id;
  const created = await db.insert('teams', { name });
  return created[0].id;
}

async function loadTeamsFromDB() {
  return db.select('teams', { 'select':'id,name,created_at', 'order':'name.asc' });
}

async function loadPlayersFromDB(teamDbId) {
  return db.select('players', { 'team_id':`eq.${teamDbId}`, 'select':'id,num,name,pos', 'order':'created_at.asc' });
}

async function savePlayerToDB(teamDbId, player) {
  const rows = await db.insert('players', { team_id:teamDbId, num:player.num, name:player.name, pos:player.pos });
  return rows[0].id;
}

async function deletePlayerFromDB(dbId) { if (dbId) await db.delete('players', { 'id':`eq.${dbId}` }); }
async function deleteTeamFromDB(dbId)   { await db.delete('teams', { 'id':`eq.${dbId}` }); }

async function createGame() {
  if (!state.home.dbId || !state.away.dbId) return;
  const rows = await db.insert('games', {
    home_team_id:state.home.dbId, away_team_id:state.away.dbId,
    home_name:state.home.name, away_name:state.away.name,
    home_score:0, away_score:0, home_fouls:0, away_fouls:0,
    home_timeouts:5, away_timeouts:5,
    home_pto:0, home_fbp:0, home_twocp:0, home_fbto:0,
    away_pto:0, away_fbp:0, away_twocp:0, away_fbto:0,
    quarter:'1', status:'ongoing',
  });
  state.currentGameId = rows[0].id;
  await createGameStats();
  toast('🏀 Game created in database!');
}

async function createGameStats() {
  if (!state.currentGameId) return;
  const rows = [];
  for (const p of state.home.players) rows.push(makeStatRow(p,'home'));
  for (const p of state.away.players) rows.push(makeStatRow(p,'away'));
  if (!rows.length) return;
  const inserted = await db.insert('game_stats', rows);
  inserted.forEach(row => {
    const team = row.team_id===state.home.dbId?'home':'away';
    const p = state[team].players.find(x=>x.dbId===row.player_id);
    if (p) p.dbStatId = row.id;
  });
}

function makeStatRow(p, team) {
  return { game_id:state.currentGameId, player_id:p.dbId, team_id:state[team].dbId,
    on_court:p.onCourt, pts:p.pts, fgm:p.fgm, fga:p.fga, tpm:p.tpm, tpa:p.tpa,
    ftm:p.ftm, fta:p.fta, off_reb:p.or, def_reb:p.dr,
    ast:p.ast, stl:p.stl, blk:p.blk, turnovers:p.to, fouls:p.fls,
    pto:p.pto||0, fbp:p.fbp||0, twocp:p.twocp||0, fbto:p.fbto||0 };
}

function scheduleSaveGame() { clearTimeout(saveGameTimer); saveGameTimer = setTimeout(saveGameToDB, 1500); }

async function saveGameToDB() {
  if (!state.currentGameId) return;
  try {
    await db.update('games', {
      home_score:state.home.score, away_score:state.away.score,
      home_fouls:state.home.fouls, away_fouls:state.away.fouls,
      home_timeouts:state.home.timeouts, away_timeouts:state.away.timeouts,
      home_pto:state.home.pto, home_fbp:state.home.fbp, home_twocp:state.home.twocp, home_fbto:state.home.fbto,
      away_pto:state.away.pto, away_fbp:state.away.fbp, away_twocp:state.away.twocp, away_fbto:state.away.fbto,
      quarter:state.quarter, updated_at:new Date().toISOString(),
    }, { 'id':`eq.${state.currentGameId}` });
    for (const team of ['home','away']) {
      for (const p of state[team].players) {
        if (!p.dbStatId) continue;
        await db.update('game_stats', {
          on_court:p.onCourt, pts:p.pts, fgm:p.fgm, fga:p.fga,
          tpm:p.tpm, tpa:p.tpa, ftm:p.ftm, fta:p.fta,
          off_reb:p.or, def_reb:p.dr, ast:p.ast, stl:p.stl,
          blk:p.blk, turnovers:p.to, fouls:p.fls,
          pto:p.pto||0, fbp:p.fbp||0, twocp:p.twocp||0, fbto:p.fbto||0,
        }, { 'id':`eq.${p.dbStatId}` });
      }
    }
  } catch(e) { console.warn('Auto-save failed:', e.message); }
}

async function savePlayToDB(play) {
  if (!state.currentGameId) return;
  try {
    await db.insert('plays', {
      game_id:state.currentGameId,
      player_id:play.playerId||null,
      team_id:play.team==='home'?state.home.dbId:play.team==='away'?state.away.dbId:null,
      action:play.dotClass, description:play.text,
      quarter:play.quarter, clock_time:play.time,
      home_score:play.scoreH, away_score:play.scoreA,
    });
  } catch(e) { console.warn('Play save failed:', e.message); }
}

/* ══════════════════════════════
   GAMES VIEW
══════════════════════════════ */
document.querySelectorAll('[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentGamesFilter = btn.dataset.filter;
    loadGames(currentGamesFilter);
  });
});

async function loadGames(filter = 'all') {
  const grid = $('gamesGrid');
  grid.innerHTML = `<div class="page-loading"><div class="db-spinner"></div><span>Loading games...</span></div>`;
  try {
    const params = { 'select':'*', 'order':'created_at.desc' };
    if (filter === 'ongoing')  params.status = 'eq.ongoing';
    if (filter === 'finished') params.status = 'eq.finished';
    const games = await db.select('games', params);
    if (!games.length) { grid.innerHTML = `<div class="page-loading">No ${filter === 'all' ? '' : filter} games found.</div>`; return; }
    grid.innerHTML = '';
    games.forEach(g => grid.appendChild(buildGameCard(g)));
  } catch(e) {
    grid.innerHTML = `<div class="page-loading" style="color:var(--red)">❌ ${e.message}</div>`;
  }
}

function buildGameCard(g) {
  const card = document.createElement('div');
  card.className = `game-card${g.status==='ongoing'?' live-card':''}`;
  const d = new Date(g.created_at);
  card.innerHTML = `
    <div class="gc-header">
      <span class="gc-date">${d.toLocaleDateString()} ${d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
      <span class="gc-status ${g.status}">${g.status==='ongoing'?'🔴 LIVE':'✅ FINAL'}</span>
    </div>
    <div class="gc-score">
      <div class="gc-team gc-home">
        <div class="gc-team-name" style="color:var(--home)">${g.home_name||'HOME'}</div>
        <div class="gc-team-score">${g.home_score}</div>
      </div>
      <div class="gc-vs">VS</div>
      <div class="gc-team gc-away">
        <div class="gc-team-name" style="color:var(--away)">${g.away_name||'AWAY'}</div>
        <div class="gc-team-score">${g.away_score}</div>
      </div>
    </div>
    <div class="gc-footer">
      <span class="gc-quarter">Q${g.quarter}</span>
      <span class="gc-view-btn">VIEW DETAILS →</span>
    </div>
  `;
  card.addEventListener('click', () => openGameDetail(g.id, g.status==='ongoing'));
  return card;
}

/* ══════════════════════════════
   GAME DETAIL MODAL
══════════════════════════════ */
$('closeGameDetail').addEventListener('click',  () => $('gameDetailModal').classList.remove('visible'));
$('closeGameDetail2').addEventListener('click', () => $('gameDetailModal').classList.remove('visible'));
$('gameDetailModal').addEventListener('click', e => { if (e.target===$('gameDetailModal')) $('gameDetailModal').classList.remove('visible'); });

document.querySelectorAll('.gd-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.gd-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    loadGameDetailTab(currentGameDetailId, tab.dataset.tab);
  });
});

$('gdLoadBtn').addEventListener('click', async () => {
  if (!currentGameDetailId) return;
  await loadGameIntoScorer(currentGameDetailId);
  $('gameDetailModal').classList.remove('visible');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelector('[data-view="scorer"]').classList.add('active');
  $('view-scorer').classList.add('active');
});

async function openGameDetail(gameId, isLive) {
  currentGameDetailId = gameId;
  $('gdLiveBadge').style.display = isLive ? 'block' : 'none';
  $('gdLoadBtn').style.display   = isLive ? 'block' : 'none';
  $('gdTitle').textContent = isLive ? '🔴 LIVE GAME' : 'GAME DETAILS';
  $('gdContent').innerHTML = `<div class="page-loading"><div class="db-spinner"></div></div>`;
  showLoading('Loading game...');
  try {
    const games = await db.select('games', { 'id':`eq.${gameId}`, 'select':'*' });
    if (!games.length) { toast('Game not found'); return; }
    const g = games[0];
    $('gdScoreboard').innerHTML = `
      <div class="gd-team home">
        <div class="gd-team-name" style="color:var(--home)">${g.home_name||'HOME'}</div>
        <div class="gd-team-score">${g.home_score}</div>
      </div>
      <div class="gd-vs-block">
        <div class="gd-vs">VS</div>
        <div class="gd-qtr">Q${g.quarter} · ${g.status.toUpperCase()}</div>
      </div>
      <div class="gd-team away">
        <div class="gd-team-name" style="color:var(--away)">${g.away_name||'AWAY'}</div>
        <div class="gd-team-score">${g.away_score}</div>
      </div>
    `;
    document.querySelectorAll('.gd-tab').forEach(t=>t.classList.remove('active'));
    document.querySelector('.gd-tab[data-tab="boxscore"]').classList.add('active');
    await loadGameDetailTab(gameId, 'boxscore');
    $('gameDetailModal').classList.add('visible');
  } catch(e) { toast('❌ ' + e.message); }
  finally { hideLoading(); }
}

async function loadGameDetailTab(gameId, tab) {
  const content = $('gdContent');
  content.innerHTML = `<div class="page-loading"><div class="db-spinner"></div></div>`;
  try {
    if (tab === 'boxscore') {
      const stats = await db.select('game_stats', { 'game_id':`eq.${gameId}`, 'select':'*' });
      const playerIds = [...new Set(stats.map(s=>s.player_id).filter(Boolean))];
      let playerMap = {};
      if (playerIds.length) {
        const players = await db.select('players', { 'id':`in.(${playerIds.join(',')})`, 'select':'id,name,num,pos' });
        players.forEach(p => playerMap[p.id] = p);
      }
      if (!stats.length) { content.innerHTML = `<div class="page-loading">No stats recorded yet.</div>`; return; }
      let html = `<div style="overflow-x:auto"><table class="stats-table" style="width:100%"><thead><tr>
        <th style="text-align:left">Player</th><th>POS</th><th>PTS</th><th>FGM</th><th>FGA</th>
        <th>3PM</th><th>3PA</th><th>FTM</th><th>FTA</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>FLS</th>
        <th style="color:#ce93d8">PTO</th><th style="color:#ce93d8">FBP</th><th style="color:#ce93d8">2CP</th><th style="color:var(--fbto)">FBTO</th>
      </tr></thead><tbody>`;
      stats.forEach(s => {
        const p = playerMap[s.player_id] || {};
        html += `<tr>
          <td style="text-align:left">#${p.num||'—'} ${p.name||'Unknown'}</td>
          <td>${p.pos||'—'}</td><td><strong>${s.pts}</strong></td>
          <td>${s.fgm}</td><td>${s.fga}</td><td>${s.tpm}</td><td>${s.tpa}</td>
          <td>${s.ftm}</td><td>${s.fta}</td><td>${(s.off_reb||0)+(s.def_reb||0)}</td>
          <td>${s.ast}</td><td>${s.stl}</td><td>${s.blk}</td><td>${s.turnovers}</td><td>${s.fouls}</td>
          <td style="color:#ce93d8">${s.pto||0}</td><td style="color:#ce93d8">${s.fbp||0}</td>
          <td style="color:#ce93d8">${s.twocp||0}</td><td style="color:var(--fbto)">${s.fbto||0}</td>
        </tr>`;
      });
      html += '</tbody></table></div>';
      content.innerHTML = html;
    } else {
      const plays = await db.select('plays', { 'game_id':`eq.${gameId}`, 'select':'*', 'order':'created_at.desc', 'limit':'100' });
      if (!plays.length) { content.innerHTML = `<div class="page-loading">No plays recorded yet.</div>`; return; }
      let html = `<div style="padding:0">`;
      plays.forEach(p => {
        const dotClass = p.action==='home'?'home':p.action==='away'?'away':p.action==='special'?'special':'sys';
        html += `<div class="pbp-entry">
          <div class="pbp-dot ${dotClass}"></div>
          <span class="pbp-text">${p.description||p.action}</span>
          <span class="pbp-qtr">${p.clock_time||''}</span>
          <span class="pbp-score">${p.home_score}–${p.away_score}</span>
          <span class="pbp-qtr">Q${p.quarter}</span>
        </div>`;
      });
      html += '</div>';
      content.innerHTML = html;
    }
  } catch(e) { content.innerHTML = `<div class="page-loading" style="color:var(--red)">❌ ${e.message}</div>`; }
}

async function loadGameIntoScorer(gameId) {
  showLoading('Loading game into scorer...');
  try {
    const games = await db.select('games', { 'id':`eq.${gameId}`, 'select':'*' });
    if (!games.length) return;
    const g = games[0];
    if (g.home_team_id) {
      const homePlayers = await loadPlayersFromDB(g.home_team_id);
      state.home.name = g.home_name||'HOME'; state.home.dbId = g.home_team_id;
      state.home.score = g.home_score||0; state.home.fouls = g.home_fouls||0; state.home.timeouts = g.home_timeouts??5;
      state.home.players = homePlayers.map(p=>mkPlayer(p));
    }
    if (g.away_team_id) {
      const awayPlayers = await loadPlayersFromDB(g.away_team_id);
      state.away.name = g.away_name||'AWAY'; state.away.dbId = g.away_team_id;
      state.away.score = g.away_score||0; state.away.fouls = g.away_fouls||0; state.away.timeouts = g.away_timeouts??5;
      state.away.players = awayPlayers.map(p=>mkPlayer(p));
    }
    state.currentGameId = gameId; state.quarter = g.quarter||'1';
    viewerMode = g.status === 'ongoing';
    updateTeamNameDisplay('home'); updateTeamNameDisplay('away');
    updateScore('home'); updateScore('away'); updateMeta();
    renderRoster('home'); renderRoster('away'); renderStats();
    document.querySelectorAll('.quarter-btn').forEach(b=>b.classList.toggle('active',b.dataset.q===state.quarter));
    if (viewerMode) toast('👁 Viewing live game — scores sync automatically');
    else toast(`✓ Loaded game: ${g.home_name} vs ${g.away_name}`);
  } catch(e) { toast('❌ ' + e.message); }
  finally { hideLoading(); }
}

function mkPlayer(p) {
  return { id:playerIdCounter++, dbId:p.id, dbStatId:null, num:p.num, name:p.name, pos:p.pos, onCourt:false,
    pts:0, fgm:0, fga:0, tpm:0, tpa:0, ftm:0, fta:0, or:0, dr:0, ast:0, stl:0, blk:0, to:0, fls:0,
    pto:0, fbp:0, twocp:0, fbto:0 };
}

/* ══════════════════════════════
   TEAMS VIEW
══════════════════════════════ */
async function loadTeamsView() {
  const grid = $('teamsGrid');
  grid.innerHTML = `<div class="page-loading"><div class="db-spinner"></div><span>Loading teams...</span></div>`;
  try {
    const teams = await loadTeamsFromDB();
    $('teamsCount').textContent = `${teams.length} team${teams.length!==1?'s':''} registered`;
    if (!teams.length) { grid.innerHTML = `<div class="page-loading">No teams registered yet. Add teams in the Scorer!</div>`; return; }
    grid.innerHTML = '';
    for (const t of teams) { const players = await loadPlayersFromDB(t.id); grid.appendChild(buildTeamCard(t, players)); }
  } catch(e) { grid.innerHTML = `<div class="page-loading" style="color:var(--red)">❌ ${e.message}</div>`; }
}

function buildTeamCard(team, players) {
  const card = document.createElement('div');
  card.className = 'team-card';
  const show = players.slice(0, 5), more = players.length - 5;
  card.innerHTML = `
    <div class="tc-header">
      <div class="tc-name">${team.name}</div>
      <div class="tc-meta">${players.length} player${players.length!==1?'s':''} registered</div>
    </div>
    <div class="tc-roster">
      ${show.map(p=>`<div class="tc-player-row"><span class="tc-num">#${p.num}</span><span class="tc-pos">${p.pos}</span><span class="tc-pname">${p.name}</span></div>`).join('')}
    </div>
    ${more>0?`<div class="tc-more">+${more} more player${more!==1?'s':''}</div>`:''}
  `;
  return card;
}

/* ══════════════════════════════
   STANDINGS VIEW
══════════════════════════════ */
document.querySelectorAll('[data-sort]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-sort]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); currentGamesSort=btn.dataset.sort; loadStandings(currentGamesSort);
  });
});

async function loadStandings(sortBy = 'wins') {
  const tbody = $('standingsBody');
  tbody.innerHTML = `<tr><td colspan="9" class="standings-loading"><div class="db-spinner" style="margin:0 auto 8px"></div>Loading...</td></tr>`;
  try {
    const teams = await loadTeamsFromDB();
    const games = await db.select('games', { 'status':'eq.finished', 'select':'*' });
    const standMap = {};
    teams.forEach(t => { standMap[t.id]={ id:t.id, name:t.name, gp:0, w:0, l:0, pf:0, pa:0 }; });
    games.forEach(g => {
      const home=standMap[g.home_team_id], away=standMap[g.away_team_id];
      if (home) { home.gp++;home.pf+=g.home_score||0;home.pa+=g.away_score||0;if((g.home_score||0)>(g.away_score||0))home.w++;else home.l++; }
      if (away) { away.gp++;away.pf+=g.away_score||0;away.pa+=g.home_score||0;if((g.away_score||0)>(g.home_score||0))away.w++;else away.l++; }
    });
    let rows = Object.values(standMap);
    if (sortBy==='wins') rows.sort((a,b)=>b.w-a.w||(b.w/(b.gp||1))-(a.w/(a.gp||1)));
    if (sortBy==='pct')  rows.sort((a,b)=>(b.w/(b.gp||1))-(a.w/(a.gp||1))||b.w-a.w);
    if (sortBy==='pts')  rows.sort((a,b)=>b.pf-a.pf);
    if (!rows.length) { tbody.innerHTML=`<tr><td colspan="9" class="standings-loading">No teams yet.</td></tr>`; return; }
    tbody.innerHTML = '';
    rows.forEach((r,i)=>{
      const pct=r.gp?(r.w/r.gp*100).toFixed(1):'0.0', diff=r.pf-r.pa;
      const tr=document.createElement('tr');
      tr.innerHTML=`<td><span class="s-rank">${i+1}</span></td><td><span class="s-team-name">${r.name}</span></td><td>${r.gp}</td><td><span class="s-w">${r.w}</span></td><td><span class="s-l">${r.l}</span></td><td><span class="s-pct">${pct}%</span></td><td>${r.pf}</td><td>${r.pa}</td><td><span class="s-diff ${diff>=0?'pos':'neg'}">${diff>=0?'+':''}${diff}</span></td>`;
      tbody.appendChild(tr);
    });
  } catch(e) { tbody.innerHTML=`<tr><td colspan="9" class="standings-loading" style="color:var(--red)">❌ ${e.message}</td></tr>`; }
}

/* ══════════════════════════════
   TEAM SETUP MODAL
══════════════════════════════ */
$('homeNameBtn').addEventListener('click', () => openTeamSetup('home'));
$('awayNameBtn').addEventListener('click', () => openTeamSetup('away'));
$('closeTeamSetup').addEventListener('click',  closeTeamSetup);
$('closeTeamSetup2').addEventListener('click', closeTeamSetup);
$('teamSetupModal').addEventListener('click', e => { if (e.target===$('teamSetupModal')) closeTeamSetup(); });

$('tsSaveNameBtn').addEventListener('click', async () => {
  const val = $('tsTeamNameInput').value.trim(); if (!val) return;
  showLoading('Saving team...');
  try {
    const dbId = await getOrCreateTeam(val);
    state[setupTeam].name=val; state[setupTeam].dbId=dbId;
    updateTeamNameDisplay(setupTeam); await renderSavedTeams(); toast(`✓ Team "${val}" saved`);
  } catch(e) { toast('❌ '+e.message); }
  finally { hideLoading(); }
});

async function openTeamSetup(team) {
  setupTeam=team;
  $('tsIcon').textContent=team==='home'?'🏠':'✈️';
  $('tsTitle').textContent=`SET UP ${team.toUpperCase()} TEAM`;
  $('tsTeamNameInput').value=(state[team].name!=='HOME'&&state[team].name!=='AWAY')?state[team].name:'';
  await renderSavedTeams();
  $('teamSetupModal').classList.add('visible');
  setTimeout(()=>$('tsTeamNameInput').focus(),200);
}

function closeTeamSetup() { $('teamSetupModal').classList.remove('visible'); }
function updateTeamNameDisplay(team) { dom[`${team}NameDisplay`].textContent = state[team].name; }

async function renderSavedTeams() {
  const list = $('tsSavedList');
  list.innerHTML = `<div class="ts-empty"><div class="db-spinner" style="width:18px;height:18px;margin:0 auto 6px"></div>Loading...</div>`;
  try {
    const teams = await loadTeamsFromDB();
    if (!teams.length) { list.innerHTML=`<div class="ts-empty">No saved teams yet.<br>Enter a team name and click SET NAME!</div>`; return; }
    list.innerHTML = '';
    for (const t of teams) {
      const players = await loadPlayersFromDB(t.id);
      const card = document.createElement('div');
      card.className = 'ts-team-card';
      card.innerHTML = `
        <div class="ts-team-icon">🏀</div>
        <div class="ts-team-info">
          <div class="ts-team-name">${t.name}</div>
          <div class="ts-team-meta">${players.length} player${players.length!==1?'s':''}</div>
        </div>
        <div class="ts-team-actions">
          <button class="ts-load-btn" data-id="${t.id}" data-name="${t.name}">▶ LOAD</button>
          <button class="ts-del-btn" data-id="${t.id}" data-name="${t.name}">🗑</button>
        </div>
      `;
      card.querySelector('.ts-load-btn').addEventListener('click', async e => { e.stopPropagation(); await loadTeamFromDB(e.currentTarget.dataset.id, e.currentTarget.dataset.name); });
      card.querySelector('.ts-del-btn').addEventListener('click', async e => {
        e.stopPropagation();
        const name = e.currentTarget.dataset.name;
        if (!confirm(`Delete "${name}"? This also deletes their players.`)) return;
        showLoading('Deleting...');
        try { await deleteTeamFromDB(e.currentTarget.dataset.id); await renderSavedTeams(); toast(`🗑 Deleted: ${name}`); }
        catch(err) { toast('❌ '+err.message); }
        finally { hideLoading(); }
      });
      list.appendChild(card);
    }
  } catch(e) { list.innerHTML=`<div class="ts-empty" style="color:var(--red)">❌ ${e.message}</div>`; }
}

async function loadTeamFromDB(teamDbId, name) {
  showLoading(`Loading ${name}...`);
  try {
    const players = await loadPlayersFromDB(teamDbId);
    state[setupTeam].name=name; state[setupTeam].dbId=teamDbId;
    state[setupTeam].players=players.map(p=>mkPlayer(p));
    updateTeamNameDisplay(setupTeam); renderRoster(setupTeam); renderStats();
    closeTeamSetup(); toast(`✓ Loaded ${name} — ${players.length} players`);
  } catch(e) { toast('❌ '+e.message); }
  finally { hideLoading(); }
}

/* ══════════════════════════════
   MANAGE MODAL
══════════════════════════════ */
$('manageHomeBtn').addEventListener('click', ()=>openManageModal('home'));
$('manageAwayBtn').addEventListener('click', ()=>openManageModal('away'));
$('closeManageModal').addEventListener('click', closeManageModal);
$('manageConfirmBtn').addEventListener('click', closeManageModal);
$('manageModal').addEventListener('click', e=>{ if (e.target===$('manageModal')) closeManageModal(); });

function openManageModal(team) {
  manageTeam=team;
  $('manageModalTeamIcon').textContent=team==='home'?'🏠':'✈️';
  $('manageModalTitle').textContent=`MANAGE ${teamName(team).toUpperCase()} TEAM`;
  $('managePlayerList').className=`manage-player-list ${team}-team`;
  renderManageList(); $('manageModal').classList.add('visible');
  setTimeout(()=>$('managePlayerName').focus(),200);
}

function closeManageModal() {
  $('manageModal').classList.remove('visible');
  renderRoster('home'); renderRoster('away'); renderStats();
}

$('manageAddPlayer').addEventListener('click', addPlayerFromModal);
$('managePlayerName').addEventListener('keydown', e=>{ if (e.key==='Enter') addPlayerFromModal(); });

async function addPlayerFromModal() {
  const name=$('managePlayerName').value.trim();
  if (!name) { $('managePlayerName').focus(); return; }
  if (!state[manageTeam].dbId) { toast('⚠ Set a team name first!'); return; }
  const num=$('managePlayerNum').value.trim()||'—', pos=$('managePlayerPos').value;
  const onCourtCount=state[manageTeam].players.filter(p=>p.onCourt).length;
  showLoading('Adding player...');
  try {
    const dbId = await savePlayerToDB(state[manageTeam].dbId, { num, name, pos });
    state[manageTeam].players.push({
      id:playerIdCounter++, dbId, dbStatId:null, num, name, pos,
      onCourt:onCourtCount<5, pts:0, fgm:0, fga:0, tpm:0, tpa:0,
      ftm:0, fta:0, or:0, dr:0, ast:0, stl:0, blk:0, to:0, fls:0,
      pto:0, fbp:0, twocp:0, fbto:0,
    });
    $('managePlayerName').value=''; $('managePlayerNum').value='';
    renderManageList(); renderRoster(manageTeam); renderStats();
    toast(`✓ ${name} saved to database`);
  } catch(e) { toast('❌ '+e.message); }
  finally { hideLoading(); }
}

function renderManageList() {
  const list=$('managePlayerList'), players=state[manageTeam].players;
  const onCourtN=players.filter(p=>p.onCourt).length;
  $('manageOnCourtCount').textContent=onCourtN;
  if (!players.length) { list.innerHTML=`<div class="empty-list-msg">No players added yet.</div>`; return; }
  list.innerHTML='';
  players.forEach(p => {
    const maxReached=!p.onCourt&&onCourtN>=5;
    const row=document.createElement('div'); row.className='manage-player-row';
    row.innerHTML=`
      <span class="mpn">#${p.num}</span><span class="mpp">${p.pos}</span><span class="mpname">${p.name}</span>
      <button class="starter-toggle ${p.onCourt?'is-starter':''}" data-id="${p.id}" ${maxReached?'style="opacity:.4;cursor:not-allowed"':''}>
        ${p.onCourt?'⭐ STARTER':'➕ ADD TO 5'}
      </button>
      <button class="remove-manage-btn" data-id="${p.id}">🗑</button>
    `;
    row.querySelector('.starter-toggle').addEventListener('click', e=>{ if(maxReached){toast('Max 5!');return;} toggleStarter(manageTeam,parseInt(e.currentTarget.dataset.id)); });
    row.querySelector('.remove-manage-btn').addEventListener('click', async e=>{
      const id=parseInt(e.currentTarget.dataset.id);
      const pl=state[manageTeam].players.find(x=>x.id===id);
      if (pl?.dbId) { showLoading('Removing...'); try { await deletePlayerFromDB(pl.dbId); } catch(err){toast('❌ '+err.message);} finally{hideLoading();} }
      removePlayerById(manageTeam,id);
    });
    list.appendChild(row);
  });
}

function toggleStarter(team, id) {
  const p=state[team].players.find(x=>x.id===id); if (!p) return;
  const onN=state[team].players.filter(x=>x.onCourt).length;
  if (!p.onCourt&&onN>=5) { toast('Max 5!'); return; }
  p.onCourt=!p.onCourt;
  if (state.selectedPlayer?.team===team&&state.selectedPlayer?.id===id) { state.selectedPlayer=null; updateSelectedLabel(); }
  renderManageList(); renderRoster(team); updateCourtCounts(team);
}

function removePlayerById(team, id) {
  if (state.selectedPlayer?.team===team&&state.selectedPlayer?.id===id) { state.selectedPlayer=null; updateSelectedLabel(); }
  state[team].players=state[team].players.filter(p=>p.id!==id);
  renderManageList(); renderRoster(team); renderStats();
}

/* ══════════════════════════════
   RENDER ROSTER
══════════════════════════════ */
function renderRoster(team) {
  const players=state[team].players;
  const starters=players.filter(p=>p.onCourt), bench=players.filter(p=>!p.onCourt);
  $(`${team}Count`).textContent=players.length; updateCourtCounts(team);
  const startEl=$(`${team}Starting`); startEl.innerHTML='';
  if (!starters.length) startEl.innerHTML=`<div class="empty-list-msg">No starters — click ⚙ MANAGE</div>`;
  else starters.forEach(p=>startEl.appendChild(buildPlayerRow(p,team)));
  const benchEl=$(`${team}Bench`); benchEl.innerHTML='';
  if (!bench.length) benchEl.innerHTML=`<div class="empty-list-msg" style="padding:10px 12px">No bench players</div>`;
  else bench.forEach(p=>benchEl.appendChild(buildPlayerRow(p,team)));
}

function buildPlayerRow(p, team) {
  const div=document.createElement('div');
  div.className=`player-item${isSelected(team,p.id)?' selected':''}${p.onCourt?' on-court':''}`;
  div.innerHTML=`<span class="player-num">#${p.num}</span><span class="player-pos">${p.pos}</span><span class="player-name">${p.name}</span><span class="player-pts">${p.pts}</span>`;
  div.addEventListener('click',()=>selectPlayer(team,p.id));
  return div;
}

function updateCourtCounts(team) {
  $(`${team}OnCourtCount`).textContent=`${state[team].players.filter(p=>p.onCourt).length}/5`;
  $(`${team}BenchCount`).textContent=state[team].players.filter(p=>!p.onCourt).length;
}

/* SELECT PLAYER */
function isSelected(team,id) { return state.selectedPlayer?.team===team&&state.selectedPlayer?.id===id; }
function selectPlayer(team,id) { state.selectedPlayer=isSelected(team,id)?null:{team,id}; renderRoster('home'); renderRoster('away'); updateSelectedLabel(); }
function updateSelectedLabel() {
  if (!state.selectedPlayer) { dom.selectedLabel.textContent='select a player'; return; }
  const p=getSelectedPlayer();
  dom.selectedLabel.textContent=`${p.onCourt?'⭐':'🪑'} ${p.name} (${teamName(state.selectedPlayer.team)})`;
}
function getSelectedPlayer() {
  if (!state.selectedPlayer) return null;
  return state[state.selectedPlayer.team].players.find(p=>p.id===state.selectedPlayer.id);
}

/* ══════════════════════════════
   SUBSTITUTION
══════════════════════════════ */
$('homeSubBtn').addEventListener('click',()=>openSubModal('home'));
$('awaySubBtn').addEventListener('click',()=>openSubModal('away'));
$('closeSubModal').addEventListener('click',closeSubModal);
$('closeSubModal2').addEventListener('click',closeSubModal);
$('subModal').addEventListener('click',e=>{if(e.target===$('subModal'))closeSubModal();});
$('confirmSubBtn').addEventListener('click',confirmSub);

function openSubModal(team) {
  subTeam=team; subOutPlayer=null; subInPlayer=null;
  $('subModalIcon').textContent=team==='home'?'🏠':'✈️';
  $('subModalTitle').textContent=`SUBSTITUTION — ${teamName(team).toUpperCase()}`;
  $('subOutName').textContent='—'; $('subInName').textContent='—';
  renderSubLists(); updateSubConfirmBtn(); $('subModal').classList.add('visible');
}

function closeSubModal() { $('subModal').classList.remove('visible'); subOutPlayer=null; subInPlayer=null; }

function renderSubLists() {
  const outList=$('subOutList'), inList=$('subInList');
  const starters=state[subTeam].players.filter(p=>p.onCourt);
  const bench=state[subTeam].players.filter(p=>!p.onCourt);
  const tClass=subTeam==='home'?'home-tag':'away-tag';
  outList.innerHTML='';
  if (!starters.length) outList.innerHTML=`<div class="empty-list-msg">No players on court</div>`;
  else starters.forEach(p=>{
    const row=document.createElement('div');
    row.className=`sub-player-row${subOutPlayer===p.id?' selected-out':''}`;
    row.innerHTML=`<span class="spnum">#${p.num}</span><span class="sppos ${tClass}">${p.pos}</span><span class="spname">${p.name}</span><span style="font-size:.7rem;color:var(--muted)">${p.pts}pts</span>`;
    row.addEventListener('click',()=>{ subOutPlayer=p.id; $('subOutName').textContent=`#${p.num} ${p.name}`; renderSubLists(); updateSubConfirmBtn(); });
    outList.appendChild(row);
  });
  inList.innerHTML='';
  if (!bench.length) inList.innerHTML=`<div class="empty-list-msg">No bench players</div>`;
  else bench.forEach(p=>{
    const row=document.createElement('div');
    row.className=`sub-player-row${subInPlayer===p.id?' selected-in':''}`;
    row.innerHTML=`<span class="spnum">#${p.num}</span><span class="sppos ${tClass}">${p.pos}</span><span class="spname">${p.name}</span><span style="font-size:.7rem;color:var(--muted)">${p.pts}pts</span>`;
    row.addEventListener('click',()=>{ subInPlayer=p.id; $('subInName').textContent=`#${p.num} ${p.name}`; renderSubLists(); updateSubConfirmBtn(); });
    inList.appendChild(row);
  });
}

function updateSubConfirmBtn() { $('confirmSubBtn').disabled=!(subOutPlayer&&subInPlayer); }

function confirmSub() {
  if (!subOutPlayer||!subInPlayer) return;
  const pOut=state[subTeam].players.find(p=>p.id===subOutPlayer);
  const pIn=state[subTeam].players.find(p=>p.id===subInPlayer);
  if (!pOut||!pIn) return;
  pOut.onCourt=false; pIn.onCourt=true;
  if (state.selectedPlayer?.team===subTeam&&state.selectedPlayer?.id===pOut.id) { state.selectedPlayer=null; updateSelectedLabel(); }
  addPlay(subTeam,`SUB: ${pIn.name} IN ↔ ${pOut.name} OUT`,subTeam,0);
  toast(`🔄 ${pIn.name} in for ${pOut.name}`);
  closeSubModal(); renderRoster('home'); renderRoster('away'); scheduleSaveGame();
}

/* ══════════════════════════════
   SCORE EVENTS (for running scoresheet)
══════════════════════════════ */
/**
 * Records a single basket as one event with pts stored.
 * buildRunningScore will expand each event into pts individual running-score slots.
 */
function recordScoringEvent(team, pts, playerNum) {
  state.scoringEvents.push({
    team,
    pts,
    playerNum: playerNum !== null && playerNum !== undefined ? String(playerNum) : '',
  });
}

/* ══════════════════════════════
   STAT GROUP BUTTONS (scoreboard pills — stat tracking only, NO score change)
   These buttons count PTO/FBP/2CP/FBTO for the scoresheet team stats section.
   They do NOT affect the main scoreboard score.
══════════════════════════════ */
document.querySelectorAll('.sg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const team   = btn.dataset.team;
    const action = btn.dataset.action; // e.g. "pto2", "pto3", "fbp2" …
    const pts    = parseInt(action.slice(-1)); // last char = 2 or 3
    const type   = action.slice(0, -1);        // "pto", "fbp", "2cp", "fbto"

    const snap = captureSnapshot();

    // Map type to state key
    const statKey = type === '2cp' ? 'twocp' : type;

    // Only update the team-level special stat counter (NO score change)
    state[team][statKey] = (state[team][statKey] || 0) + pts;

    // Log to play-by-play as info only
    const typeLabel = type.toUpperCase();
    addPlay(team, `${teamName(team)} — ${typeLabel} recorded (+${pts})`, 'special', 0);

    updateSpecialStats();
    state.history.push(snap);
    scheduleSaveGame();
    toast(`${typeLabel} +${pts} recorded for ${teamName(team)}`);
  });
});

/* ══════════════════════════════
   ACTION PANEL BUTTONS (center)
══════════════════════════════ */
document.querySelectorAll('.act-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action; if (!action) return;
    if (!state.selectedPlayer) { toast('⚠ Select a player first!'); return; }
    const p = getSelectedPlayer(), team = state.selectedPlayer.team;
    const snap = captureSnapshot();
    switch(action) {
      case '2pm':
        p.fgm++;p.fga++;p.pts+=2;state[team].score+=2;bumpScore(team);
        recordScoringEvent(team,2,p.num);
        addPlay(team,`${p.name} — 2PT Made`,team,2,p.dbId); break;
      case '2pm_miss': p.fga++;addPlay(team,`${p.name} — 2PT Miss`,team,0,p.dbId); break;
      case '3pm':
        p.tpm++;p.tpa++;p.fgm++;p.fga++;p.pts+=3;state[team].score+=3;bumpScore(team);
        recordScoringEvent(team,3,p.num);
        addPlay(team,`${p.name} — 3PT Made`,team,3,p.dbId); break;
      case '3pm_miss': p.tpa++;p.fga++;addPlay(team,`${p.name} — 3PT Miss`,team,0,p.dbId); break;
      case 'ftm':
        p.ftm++;p.fta++;p.pts+=1;state[team].score+=1;bumpScore(team);
        recordScoringEvent(team,1,p.num);
        addPlay(team,`${p.name} — Free Throw`,team,1,p.dbId); break;
      case 'ftm_miss': p.fta++;addPlay(team,`${p.name} — FT Miss`,team,0,p.dbId); break;
      case 'reb_off': p.or++;addPlay(team,`${p.name} — Off. Rebound`,team,0,p.dbId); break;
      case 'reb_def': p.dr++;addPlay(team,`${p.name} — Def. Rebound`,team,0,p.dbId); break;
      case 'ast': p.ast++;addPlay(team,`${p.name} — Assist`,team,0,p.dbId); break;
      case 'stl': p.stl++;addPlay(team,`${p.name} — Steal`,team,0,p.dbId); break;
      case 'blk': p.blk++;addPlay(team,`${p.name} — Block`,team,0,p.dbId); break;
      case 'to':  p.to++;addPlay(team,`${p.name} — Turnover`,team,0,p.dbId); break;
      case 'foul': p.fls++;state[team].fouls++;addPlay(team,`${p.name} — Foul`,team,0,p.dbId); break;
      default: return;
    }
    updateScore(team); updateMeta(); renderRoster('home'); renderRoster('away'); renderStats();
    state.history.push(snap); scheduleSaveGame();
  });
});

function updateSpecialStats() {
  dom.homePTO.textContent  = state.home.pto   || 0;
  dom.awayPTO.textContent  = state.away.pto   || 0;
  dom.homeFBP.textContent  = state.home.fbp   || 0;
  dom.awayFBP.textContent  = state.away.fbp   || 0;
  dom.home2CP.textContent  = state.home.twocp || 0;
  dom.away2CP.textContent  = state.away.twocp || 0;
  dom.homeFBTO.textContent = state.home.fbto  || 0;
  dom.awayFBTO.textContent = state.away.fbto  || 0;
  dom.homePTOCount.textContent  = state.home.pto   || 0;
  dom.awayPTOCount.textContent  = state.away.pto   || 0;
  dom.homeFBPCount.textContent  = state.home.fbp   || 0;
  dom.awayFBPCount.textContent  = state.away.fbp   || 0;
  dom.home2CPCount.textContent  = state.home.twocp || 0;
  dom.away2CPCount.textContent  = state.away.twocp || 0;
  dom.homeFBTOCount.textContent = state.home.fbto  || 0;
  dom.awayFBTOCount.textContent = state.away.fbto  || 0;
}

/* TIMEOUTS */
document.querySelectorAll('.timeout-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const team=btn.dataset.team;
    if (state[team].timeouts<=0) { toast('No timeouts left this half!'); return; }
    const snap=captureSnapshot(); state[team].timeouts--;
    updateMeta(); addPlay(team,`${teamName(team)} called timeout`,team,0);
    state.history.push(snap); scheduleSaveGame();
    toast(`Timeout called — ${state[team].timeouts} remaining`);
  });
});

/* SCORE / META */
function updateScore(team) { dom[`${team}Score`].textContent=state[team].score; }
function bumpScore(team) { const el=dom[`${team}Score`];el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump');setTimeout(()=>el.classList.remove('bump'),200); }
function updateMeta() { dom.homeTO.textContent=state.home.timeouts;dom.awayTO.textContent=state.away.timeouts;dom.homeFouls.textContent=state.home.fouls;dom.awayFouls.textContent=state.away.fouls; }

/* PBP */
function addPlay(team, text, dotClass, pts, playerId=null) {
  const play={team,text,dotClass,pts,playerId,quarter:state.quarter,scoreH:state.home.score,scoreA:state.away.score,time:formatTime(clock.remaining)};
  state.plays.unshift(play); renderPBP(); savePlayToDB(play);
}

function renderPBP() {
  dom.pbpCount.textContent=`${state.plays.length} play${state.plays.length!==1?'s':''}`;
  if (!state.plays.length) { dom.pbpList.innerHTML=`<div class="pbp-empty">No plays yet. Start recording!</div>`; return; }
  dom.pbpList.innerHTML=state.plays.map(p=>`<div class="pbp-entry"><div class="pbp-dot ${p.dotClass}"></div><span class="pbp-text">${p.text}</span><span class="pbp-qtr">${p.time}</span><span class="pbp-score">${p.scoreH}–${p.scoreA}</span><span class="pbp-qtr">Q${p.quarter}</span></div>`).join('');
}

/* STATS TABLE */
document.querySelectorAll('.stab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.stab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); state.statsView=btn.dataset.view; renderStats();
  });
});

function renderStats() {
  let players=[];
  if (state.statsView!=='away') state.home.players.forEach(p=>players.push({...p,team:'home'}));
  if (state.statsView!=='home') state.away.players.forEach(p=>players.push({...p,team:'away'}));
  if (!players.length) { dom.statsBody.innerHTML=`<tr><td colspan="22" style="text-align:center;color:var(--muted);padding:18px;font-size:.8rem">No players</td></tr>`; return; }
  dom.statsBody.innerHTML=players.map(p=>`<tr>
    <td>#${p.num} ${p.name}${state.statsView==='both'?`<span class="team-tag ${p.team}-tag">${p.team.toUpperCase()}</span>`:''}</td>
    <td>${p.pos}</td><td>${p.onCourt?'<span class="status-on">⭐</span>':'<span class="status-off">🪑</span>'}</td>
    <td><strong>${p.pts}</strong></td><td>${p.fgm}</td><td>${p.fga}</td><td>${p.tpm}</td><td>${p.tpa}</td>
    <td>${p.ftm}</td><td>${p.fta}</td><td>${p.or}</td><td>${p.dr}</td><td>${p.or+p.dr}</td>
    <td>${p.ast}</td><td>${p.stl}</td><td>${p.blk}</td><td>${p.to}</td><td>${p.fls}</td>
    <td class="special-val">${p.pto||0}</td><td class="special-val">${p.fbp||0}</td><td class="special-val">${p.twocp||0}</td><td class="fbto-val">${p.fbto||0}</td>
  </tr>`).join('');
}

/* UNDO */
$('btnUndo').addEventListener('click', ()=>{
  if (!state.history.length) { toast('Nothing to undo'); return; }
  restoreSnapshot(state.history.pop()); toast('Last action undone'); scheduleSaveGame();
});

function captureSnapshot() {
  return JSON.parse(JSON.stringify({
    home:state.home, away:state.away, plays:state.plays,
    scoringEvents:state.scoringEvents,
    selectedPlayer:state.selectedPlayer, quarterScores:state.quarterScores,
  }));
}

function restoreSnapshot(snap) {
  Object.assign(state,{
    home:snap.home, away:snap.away, plays:snap.plays,
    scoringEvents:snap.scoringEvents||[],
    selectedPlayer:snap.selectedPlayer, quarterScores:snap.quarterScores,
  });
  updateScore('home');updateScore('away');updateMeta();updateSpecialStats();
  renderRoster('home');renderRoster('away');renderStats();renderPBP();updateSelectedLabel();
  updateTeamNameDisplay('home');updateTeamNameDisplay('away');
}

/* NEW GAME */
$('btnNewGame').addEventListener('click', ()=>$('newGameModal').classList.add('visible'));
$('cancelNewGame').addEventListener('click', ()=>$('newGameModal').classList.remove('visible'));
$('confirmNewGame').addEventListener('click', async ()=>{ $('newGameModal').classList.remove('visible'); await resetGame(); });
$('newGameModal').addEventListener('click', e=>{ if (e.target===$('newGameModal')) $('newGameModal').classList.remove('visible'); });

async function resetGame() {
  if (state.currentGameId) {
    const winner=state.home.score>state.away.score?state.home.dbId:state.away.score>state.home.score?state.away.dbId:null;
    try { await db.update('games',{status:'finished',winner_team_id:winner,updated_at:new Date().toISOString()},{' id':`eq.${state.currentGameId}`}); } catch(e){}
  }
  ['home','away'].forEach(team=>{
    state[team].score=0;state[team].fouls=0;state[team].timeouts=2;state[team].timeoutsHalf=2;
    state[team].pto=0;state[team].fbp=0;state[team].twocp=0;state[team].fbto=0;
    state[team].players.forEach(p=>{p.pts=0;p.fgm=0;p.fga=0;p.tpm=0;p.tpa=0;p.ftm=0;p.fta=0;p.or=0;p.dr=0;p.ast=0;p.stl=0;p.blk=0;p.to=0;p.fls=0;p.pto=0;p.fbp=0;p.twocp=0;p.fbto=0;p.dbStatId=null;});
  });
  state.selectedPlayer=null;state.history=[];state.plays=[];state.scoringEvents=[];
  state.quarter='1';state.statsView='home';
  state.quarterScores={'1':null,'2':null,'3':null,'4':null,'OT':null};
  state.currentGameId=null;viewerMode=false;
  document.querySelectorAll('.quarter-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector('[data-q="1"]').classList.add('active');
  document.querySelectorAll('.stab').forEach(b=>b.classList.remove('active'));
  document.querySelector('[data-view="home"]').classList.add('active');
  resetClock();updateScore('home');updateScore('away');updateMeta();updateSpecialStats();
  renderRoster('home');renderRoster('away');renderStats();renderPBP();updateSelectedLabel();
  if (state.home.dbId&&state.away.dbId) await createGame();
  toast('New game started! 🏀');
}

/* EXPORT */
$('btnExportCSV').addEventListener('click', ()=>{
  const allP=[...state.home.players.map(p=>({...p,team:teamName('home')})),...state.away.players.map(p=>({...p,team:teamName('away')}))];
  const headers=['Team','#','Player','POS','STATUS','PTS','FGM','FGA','3PM','3PA','FTM','FTA','OR','DR','REB','AST','STL','BLK','TO','FLS','PTO','FBP','2CP','FBTO'];
  const rows=allP.map(p=>[p.team,p.num,p.name,p.pos,p.onCourt?'STARTER':'BENCH',p.pts,p.fgm,p.fga,p.tpm,p.tpa,p.ftm,p.fta,p.or,p.dr,p.or+p.dr,p.ast,p.stl,p.blk,p.to,p.fls,p.pto||0,p.fbp||0,p.twocp||0,p.fbto||0]);
  downloadFile('hoops-stats.csv',[headers,...rows].map(r=>r.join(',')).join('\n'),'text/csv');
  toast('CSV exported');
});

$('btnExportPDF').addEventListener('click', ()=>{
  const allP=[...state.home.players.map(p=>({...p,team:teamName('home')})),...state.away.players.map(p=>({...p,team:teamName('away')}))];
  const rows=allP.map(p=>`<tr><td>${p.team}</td><td>#${p.num} ${p.name}</td><td>${p.pos}</td><td>${p.onCourt?'Starter':'Bench'}</td><td>${p.pts}</td><td>${p.fgm}/${p.fga}</td><td>${p.tpm}/${p.tpa}</td><td>${p.ftm}/${p.fta}</td><td>${p.or+p.dr}</td><td>${p.ast}</td><td>${p.stl}</td><td>${p.blk}</td><td>${p.to}</td><td>${p.fls}</td><td>${p.pto||0}</td><td>${p.fbp||0}</td><td>${p.twocp||0}</td><td>${p.fbto||0}</td></tr>`).join('');
  const win=window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Box Score</title><style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse;font-size:.82rem}th,td{border:1px solid #ccc;padding:5px 8px;text-align:center}th{background:#222;color:white}tr:nth-child(even){background:#f5f5f5}</style></head><body><h1>🏀 ${teamName('home')} ${state.home.score} – ${state.away.score} ${teamName('away')}</h1><table><thead><tr><th>Team</th><th>Player</th><th>POS</th><th>Status</th><th>PTS</th><th>FG</th><th>3P</th><th>FT</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>FLS</th><th>PTO</th><th>FBP</th><th>2CP</th><th>FBTO</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
  win.document.close();win.print();
});

/* ══════════════════════════════
   FIBA SCORESHEET
══════════════════════════════ */
$('btnScoresheet').addEventListener('click', ()=>{ buildScoresheet(); $('scoresheetModal').classList.add('visible'); });
$('closeScoresheetModal').addEventListener('click',  ()=>$('scoresheetModal').classList.remove('visible'));
$('closeScoresheetModal2').addEventListener('click', ()=>$('scoresheetModal').classList.remove('visible'));
$('scoresheetModal').addEventListener('click', e=>{ if (e.target===$('scoresheetModal')) $('scoresheetModal').classList.remove('visible'); });
$('btnPrintScoresheet').addEventListener('click', ()=>window.print());

function buildScoresheet() {
  const hn=teamName('home'), an=teamName('away');
  $('ssTeamA').textContent=hn; $('ssTeamB').textContent=an;
  $('ssRosterTeamA').textContent=hn; $('ssRosterTeamB').textContent=an;
  if (!$('ssDate').value) $('ssDate').value=new Date().toISOString().split('T')[0];
  buildToBoxes('ssHomeTO1',2); buildToBoxes('ssHomeTO2',3);
  buildToBoxes('ssAwayTO1',2); buildToBoxes('ssAwayTO2',3);
  buildFoulGrid('ssHomeFoulBoxes',8); buildFoulGrid('ssAwayFoulBoxes',8);
  buildRosterTable('ssHomeRosterBody',state.home.players);
  buildRosterTable('ssAwayRosterBody',state.away.players);
  ['1','2','3','4'].forEach((q,i)=>{
    const n=i+1, qs=state.quarterScores;
    $(`ssPeriod${n}A`).textContent=qs[q]?qs[q].home:'—';
    $(`ssPeriod${n}B`).textContent=qs[q]?qs[q].away:'—';
  });
  $('ssPeriodOTA').textContent=state.quarterScores['OT']?.home??'—';
  $('ssPeriodOTB').textContent=state.quarterScores['OT']?.away??'—';
  $('ssFinalA').innerHTML=`<strong>${state.home.score}</strong>`;
  $('ssFinalB').innerHTML=`<strong>${state.away.score}</strong>`;
  $('ssWinner').textContent=state.home.score>state.away.score?hn:state.away.score>state.home.score?an:'TIE';

  // Team stats
  const homeBench = state.home.players.filter(p=>!p.onCourt).reduce((s,p)=>s+(p.pts||0),0);
  const awayBench = state.away.players.filter(p=>!p.onCourt).reduce((s,p)=>s+(p.pts||0),0);
  $('ssStatPtoA').textContent  = state.home.pto   || 0;
  $('ssStatPtoB').textContent  = state.away.pto   || 0;
  $('ssStatScpA').textContent  = state.home.twocp || 0;
  $('ssStatScpB').textContent  = state.away.twocp || 0;
  $('ssStatFbpA').textContent  = state.home.fbp   || 0;
  $('ssStatFbpB').textContent  = state.away.fbp   || 0;
  $('ssStatFbtoA').textContent = state.home.fbto  || 0;
  $('ssStatFbtoB').textContent = state.away.fbto  || 0;
  $('ssStatBenchA').textContent = homeBench;
  $('ssStatBenchB').textContent = awayBench;

  buildRunningScore();
}

function buildToBoxes(id, count) {
  const el=$(id); if (!el||el.children.length) return;
  for (let i=0;i<count;i++) { const b=document.createElement('div');b.className='ss-to-box';b.addEventListener('click',()=>b.classList.toggle('used'));el.appendChild(b); }
}

function buildFoulGrid(id, count) {
  const el=$(id); if (!el||el.children.length) return;
  for (let i=1;i<=count;i++) { const b=document.createElement('div');b.className='ss-foul-box';b.textContent=i;b.addEventListener('click',()=>b.classList.toggle('marked'));el.appendChild(b); }
}

function buildRosterTable(tbodyId, players) {
  const tbody=$(tbodyId); tbody.innerHTML='';
  const max=Math.max(players.length,15);
  for (let i=0;i<max;i++) {
    const p=players[i];
    const tr=document.createElement('tr');
    tr.innerHTML=`<td style="text-align:center;color:var(--muted);font-size:.72rem">${p?`#${p.num}`:''}</td><td>${p?p.name+(p.onCourt?' ⭐':''):''}</td>${[1,2,3,4,5].map(n=>`<td><div class="ss-foul-cell">${p?`<div class="ss-pf-dot${p.fls>=n?' marked':''}"></div>`:''}</div></td>`).join('')}`;
    if (p) tr.querySelectorAll('.ss-pf-dot').forEach(d=>d.addEventListener('click',()=>d.classList.toggle('marked')));
    tbody.appendChild(tr);
  }
}

/* ══════════════════════════════
   RUNNING SCORE — Real FIBA format
   ─────────────────────────────
   Layout: 4 column-groups × 35 rows = 140 slots (numbers 1–140).
   Each group = [A (player#) | score# | B (player#)]
     • The center column always shows the pre-printed running number.
     • When Team A (home) reaches that number, the center cell is highlighted
       in home color AND the scorer's jersey # appears in the A (left) cell.
     • When Team B (away) reaches that number, center highlighted in away color
       AND jersey # appears in the B (right) cell.
     • Both teams share the same number sequence (combined points).
══════════════════════════════ */
function buildRunningScore() {
  const tbody = $('ssRunningBody');
  tbody.innerHTML = '';

  const ROWS_PER_GROUP = 35;
  const GROUPS         = 4;
  const TOTAL          = ROWS_PER_GROUP * GROUPS; // 140

  /*
    Build a map: runningNumber → {team, playerNum}
    Each scoring event adds pts points, each point increments the combined counter.
  */
  const scored = {}; // key = running number (1-based), value = {team, playerNum}
  let combined = 0;

  for (const ev of state.scoringEvents) {
    // ev.pts is stored per event; but we recorded one event per basket (2 or 3 pts).
    // Each POINT increments the running count by 1.
    const pts = ev.pts || 1;
    for (let i = 0; i < pts; i++) {
      combined++;
      if (combined <= TOTAL) {
        scored[combined] = { team: ev.team, playerNum: ev.playerNum };
      }
    }
  }

  /* Build rows */
  for (let row = 0; row < ROWS_PER_GROUP; row++) {
    const tr = document.createElement('tr');
    let html = '';

    for (let grp = 0; grp < GROUPS; grp++) {
      const num = grp * ROWS_PER_GROUP + row + 1; // 1-based running number
      const ev  = scored[num] || null;

      if (grp > 0) html += `<td class="rs-divider-cell"></td>`;

      /* Center number cell — highlighted if scored. A/B cells are empty (no player numbers shown). */
      let numClass = 'rs-num';
      if (ev) numClass += ev.team === 'home' ? ' scored-home' : ' scored-away';

      html += `<td class="rs-a"></td>`;
      html += `<td class="${numClass}">${num}</td>`;
      html += `<td class="rs-b"></td>`;
    }

    tr.innerHTML = html;
    tbody.appendChild(tr);
  }
}

/* ══════════════════════════════
   HELPERS
══════════════════════════════ */
function teamName(team) { return state[team].name||team.toUpperCase(); }

function downloadFile(filename, content, type) {
  const blob=new Blob([content],{type});
  const url=URL.createObjectURL(blob);
  const a=Object.assign(document.createElement('a'),{href:url,download:filename});
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}

function showLoading(msg='Loading...') {
  let el=document.querySelector('.db-loading');
  if (!el) { el=document.createElement('div');el.className='db-loading';el.innerHTML=`<div class="db-loading-inner"><div class="db-spinner"></div><span class="db-loading-msg"></span></div>`;document.body.appendChild(el); }
  el.querySelector('.db-loading-msg').textContent=msg; el.classList.add('visible');
}

function hideLoading() { const el=document.querySelector('.db-loading');if(el)el.classList.remove('visible'); }

let toastTimer;
function toast(msg) {
  let el=document.querySelector('.toast');
  if (!el) { el=document.createElement('div');el.className='toast';document.body.appendChild(el); }
  el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2800);
}

/* ══════════════════════════════
   INIT
══════════════════════════════ */
updateTeamNameDisplay('home');
updateTeamNameDisplay('away');
renderRoster('home');
renderRoster('away');
renderStats();
renderPBP();
updateMeta();
updateSpecialStats();
updateClockDisplay();
connectRealtime();