/* ══════════════════════════════
   FIREBASE CONFIG
══════════════════════════════ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get, push, update, remove, query, orderByChild, equalTo, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCSG4gF7IlCa0-Pkw-GJ6lGsTQgIGOD-SE",
  authDomain: "scorer-9b628.firebaseapp.com",
  databaseURL: "https://scorer-9b628-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "scorer-9b628",
  storageBucket: "scorer-9b628.firebasestorage.app",
  messagingSenderId: "756774429209",
  appId: "1:756774429209:web:184b8ef95002c93fef0088"
};

const firebaseApp = initializeApp(firebaseConfig);
const rtdb = getDatabase(firebaseApp);

/* ══════════════════════════════
   DB HELPERS (Firebase Realtime Database)
══════════════════════════════ */
const db = {
  // Get all records from a collection, optionally filtered by a field
  async select(collection, params = {}) {
    const dbRef = ref(rtdb, collection);
    const snap = await get(dbRef);
    if (!snap.exists()) return [];
    const data = [];
    snap.forEach(child => {
      data.push({ id: child.key, ...child.val() });
    });

    // Filter by params (simulate Supabase filtering)
    let filtered = data;
    Object.entries(params).forEach(([key, value]) => {
      if (key === 'select' || key === 'order' || key === 'limit') return;
      // Parse Supabase-style filters like 'eq.value', 'in.(a,b,c)'
      if (typeof value === 'string') {
        if (value.startsWith('eq.')) {
          const val = value.slice(3);
          filtered = filtered.filter(r => String(r[key]) === String(val));
        } else if (value.startsWith('in.(')) {
          const vals = value.slice(4, -1).split(',').map(v => v.trim());
          filtered = filtered.filter(r => vals.includes(String(r[key])));
        }
      }
    });

    // Order
    if (params.order) {
      const [field, dir] = params.order.split('.');
      filtered.sort((a, b) => {
        if (a[field] < b[field]) return dir === 'desc' ? 1 : -1;
        if (a[field] > b[field]) return dir === 'desc' ? -1 : 1;
        return 0;
      });
    }

    // Limit
    if (params.limit) filtered = filtered.slice(0, parseInt(params.limit));

    return filtered;
  },

  // Insert a new record
  async insert(collection, body) {
    if (Array.isArray(body)) {
      const results = [];
      for (const item of body) {
        const newRef = push(ref(rtdb, collection));
        const record = { ...item, id: newRef.key, created_at: new Date().toISOString() };
        await set(newRef, record);
        results.push(record);
      }
      return results;
    } else {
      const newRef = push(ref(rtdb, collection));
      const record = { ...body, id: newRef.key, created_at: new Date().toISOString() };
      await set(newRef, record);
      return [record];
    }
  },

  // Update records matching a filter
  async update(collection, body, params = {}) {
    const all = await db.select(collection, params);
    for (const record of all) {
      await update(ref(rtdb, `${collection}/${record.id}`), body);
    }
    return all;
  },

  // Delete records matching a filter
  async delete(collection, params = {}) {
    const all = await db.select(collection, params);
    for (const record of all) {
      await remove(ref(rtdb, `${collection}/${record.id}`));
    }
    return all;
  }
};

/* ══════════════════════════════
   FIREBASE REALTIME LISTENER
══════════════════════════════ */
function connectRealtime() {
  const gamesRef = ref(rtdb, 'games');
  onValue(gamesRef, (snapshot) => {
    setOnlineStatus(true);
    if (document.getElementById('view-games').classList.contains('active')) {
      loadGames(currentGamesFilter);
    }
  }, (error) => {
    setOnlineStatus(false);
  });
}

function setOnlineStatus(online) {
  const dot = document.getElementById('onlineDot');
  const label = document.getElementById('onlineLabel');
  if (online) { dot.classList.add('live'); label.textContent='LIVE'; label.style.color='#4caf50'; }
  else { dot.classList.remove('live'); label.textContent='OFFLINE'; label.style.color='var(--muted)'; }
}

/* ══════════════════════════════
   PWA
══════════════════════════════ */
let deferredInstallPrompt = null;
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(()=>{}));
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstallPrompt=e; showInstallBanner(); });

function showInstallBanner() {
  let banner = document.querySelector('.pwa-banner');
  if (!banner) {
    banner = document.createElement('div'); banner.className='pwa-banner';
    banner.innerHTML=`<div class="pwa-banner-text">📱 <strong>INSTALL HOOPS</strong> — Add to home screen!</div><button class="pwa-install-btn" id="pwaInstallBtn">INSTALL</button><button class="pwa-dismiss-btn" id="pwaDismissBtn">✕</button>`;
    document.body.appendChild(banner);
    document.getElementById('pwaInstallBtn').addEventListener('click', async () => { if (deferredInstallPrompt) { deferredInstallPrompt.prompt(); const {outcome}=await deferredInstallPrompt.userChoice; if(outcome==='accepted') banner.classList.remove('show'); deferredInstallPrompt=null; } });
    document.getElementById('pwaDismissBtn').addEventListener('click', () => banner.classList.remove('show'));
  }
  setTimeout(() => banner.classList.add('show'), 2000);
}

/* ══════════════════════════════
   STATE
══════════════════════════════ */
const state = {
  quarter: '1',
  _homeLead: 0, _awayLead: 0,
  home: { name:'HOME', dbId:null, score:0, fouls:0, timeouts:2, timeoutsHalf:2, timeoutsUsed:0, timeoutsUsed1H:0, timeoutsUsed2H:0, players:[], pto:0, fbp:0, twocp:0, fbto:0 },
  away: { name:'AWAY', dbId:null, score:0, fouls:0, timeouts:2, timeoutsHalf:2, timeoutsUsed:0, timeoutsUsed1H:0, timeoutsUsed2H:0, players:[], pto:0, fbp:0, twocp:0, fbto:0 },
  selectedPlayer: null, history: [], plays: [], scoringEvents: [],
  statsView: 'home', quarterScores: {'1':null,'2':null,'3':null,'4':null,'OT':null},
  currentGameId: null,
};

let viewerMode=false, playerIdCounter=1, manageTeam='home', setupTeam='home';
let subTeam='home', subOutPlayers=[], subInPlayers=[];
let saveGameTimer=null, currentGamesFilter='all', currentGamesSort='wins', currentGameDetailId=null;

const $=id=>document.getElementById(id);

const dom = {
  homeScore:$('homeScore'), awayScore:$('awayScore'),
  homeNameDisplay:$('homeNameDisplay'), awayNameDisplay:$('awayNameDisplay'),
  homeTO:$('homeTO'), awayTO:$('awayTO'), homeFouls:$('homeFouls'), awayFouls:$('awayFouls'),
  homePTO:$('homePTO'), awayPTO:$('awayPTO'), homeFBP:$('homeFBP'), awayFBP:$('awayFBP'),
  home2CP:$('home2CP'), away2CP:$('away2CP'), homeFBTO:$('homeFBTO'), awayFBTO:$('awayFBTO'),
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
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    btn.classList.add('active');
    $(`view-${view}`).classList.add('active');
   if (view==='games') { currentGamesFilter='all'; document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter==='all')); loadGames('all'); }
    if (view==='teams')     loadTeamsView();
    if (view==='standings') loadStandings(currentGamesSort);
  });
});

/* ══════════════════════════════
   CLOCK
══════════════════════════════ */
/* ══════════════════════════════
   CLOCK
══════════════════════════════ */
const clock = { totalSeconds:10*60, remaining:10*60, running:false, interval:null, defaultMins:10, ms:0 };

function formatTime(sec, ms) {
  const m = Math.floor(sec/60).toString().padStart(2,'0');
  const s = (sec%60).toString().padStart(2,'0');
  const msStr = Math.floor(ms/100).toString(); // single digit 0-9
  return `${m}:${s}.${msStr}`;
}

function updateClockDisplay() {
  dom.clockDisplay.textContent = formatTime(clock.remaining, clock.ms);
  dom.clockDisplay.classList.remove('running','warning','expired');
  if (clock.remaining === 0 && clock.ms === 0) {
    dom.clockDisplay.classList.add('expired');
    dom.clockStatus.textContent = 'EXPIRED';
  } else if (clock.running) {
    dom.clockDisplay.classList.add(clock.remaining <= 60 ? 'warning' : 'running');
    dom.clockStatus.textContent = clock.remaining <= 60 ? 'LAST MINUTE' : 'RUNNING';
  } else {
    dom.clockStatus.textContent = (clock.remaining === clock.totalSeconds && clock.ms === 0) ? 'READY' : 'PAUSED';
  }
}

// ── CLICK CLOCK TO EDIT TIME ──
dom.clockDisplay.style.cursor = 'pointer';
dom.clockDisplay.title = 'Click to set time';
dom.clockDisplay.style.textDecoration = 'underline dotted rgba(245,197,24,.4)';
dom.clockDisplay.style.userSelect = 'none';

dom.clockDisplay.addEventListener('click', () => {
  if (clock.running) { toast('⚠ Pause the clock first!'); return; }

  // Show an input over the clock
  const current = `${Math.floor(clock.remaining/60)}:${(clock.remaining%60).toString().padStart(2,'0')}`;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = current;
  input.placeholder = 'MM:SS or MM';
  input.style.cssText = `
    font-family:'Bebas Neue',sans-serif;
    font-size:2.6rem;
    letter-spacing:4px;
    color:var(--accent);
    background:transparent;
    border:none;
    border-bottom:2px solid var(--accent);
    outline:none;
    width:160px;
    text-align:center;
  `;

  dom.clockDisplay.replaceWith(input);
  input.focus();
  input.select();

  function applyTime() {
    const val = input.value.trim();
    let totalSecs = 0;

    if (val.includes(':')) {
      // MM:SS format
      const parts = val.split(':');
      const m = parseInt(parts[0]) || 0;
      const s = parseInt(parts[1]) || 0;
      totalSecs = m * 60 + s;
    } else {
      // Just minutes
      const m = parseInt(val) || 0;
      totalSecs = m * 60;
    }

    if (totalSecs < 1 || totalSecs > 3600) {
      toast('⚠ Enter a valid time (e.g. 10:00 or 10)');
      input.replaceWith(dom.clockDisplay);
      updateClockDisplay();
      return;
    }

    clock.totalSeconds = totalSecs;
    clock.remaining = totalSecs;
    clock.ms = 0;
    input.replaceWith(dom.clockDisplay);
    updateClockDisplay();
    toast(`⏱ Clock set to ${Math.floor(totalSecs/60)}:${(totalSecs%60).toString().padStart(2,'0')}`);
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') applyTime();
    if (e.key === 'Escape') {
      input.replaceWith(dom.clockDisplay);
      updateClockDisplay();
    }
  });
  input.addEventListener('blur', applyTime);
});




function startClock() {
  if (!state.currentGameId) {
    toast('⚠ Press ▶ START GAME first!');
    return;
  }
  if (clock.running || (clock.remaining === 0 && clock.ms === 0)) return;
clock.running = true;
  dom.btnClockStart.disabled = true;
  dom.btnClockPause.disabled = false;
  updateClockDisplay();
  startPlaytimeTracking();
  clock.interval = setInterval(() => {
    if (clock.ms > 0) {
      clock.ms -= 100;
    } else if (clock.remaining > 0) {
      clock.remaining--;
      clock.ms = 900;
    } else {
      clock.ms = 0;
      stopClock();
      toast('⏰ Quarter time is up!');
      addPlay(null, `Q${state.quarter} — Clock expired`, 'sys', 0);
      return;
    }
    updateClockDisplay();
  }, 100);
}

function stopClock() {
  clock.running = false;
  clearInterval(clock.interval);
  stopPlaytimeTracking();
  clock.interval = null;
  dom.btnClockStart.disabled = false;
  dom.btnClockPause.disabled = true;
  updateClockDisplay();
}

function resetClock() {
  stopClock();
  clock.remaining = clock.totalSeconds;
  clock.ms = 0;
  updateClockDisplay();
}



dom.btnClockStart.addEventListener('click', startClock);
dom.btnClockPause.addEventListener('click', stopClock);
dom.btnClockReset.addEventListener('click', resetClock);

// ── PLAYTIME TRACKER ──
let playtimeInterval = null;

function startPlaytimeTracking() {
  if (playtimeInterval) return;
  playtimeInterval = setInterval(() => {
    for (const team of ['home','away']) {
      for (const p of state[team].players) {
        if (p.onCourt) p.secs = (p.secs || 0) + 1;
      }
    }
    renderStats();
  }, 1000);
}

function stopPlaytimeTracking() {
  clearInterval(playtimeInterval);
  playtimeInterval = null;
}

function formatPlaytime(secs) {
  if (!secs) return '0:00';
  const m = Math.floor(secs / 60);
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
/* ══════════════════════════════
   QUARTER
══════════════════════════════ */
document.querySelectorAll('.quarter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const oldQ = state.quarter;
    const newQ = btn.dataset.q;

// Save fouls for the OLD quarter BEFORE switching
state.home.quarterFouls = state.home.quarterFouls || {};
state.away.quarterFouls = state.away.quarterFouls || {};
state.home.quarterFouls[oldQ] = state.home.fouls;
state.away.quarterFouls[oldQ] = state.away.fouls;

state.quarterScores[oldQ]={home:state.home.score,away:state.away.score};
document.querySelectorAll('.quarter-btn').forEach(b=>b.classList.remove('active'));
btn.classList.add('active'); state.quarter=newQ;
const q=newQ;

// Restore fouls for the NEW quarter
state.home.fouls = state.home.quarterFouls[newQ] ?? 0;
state.away.fouls = state.away.quarterFouls[newQ] ?? 0;

    if (q==='3') { 
      state.home.timeouts=3; state.home.timeoutsHalf=3; 
      state.away.timeouts=3; state.away.timeoutsHalf=3;
      state.home.timeoutsUsed2H=0; state.away.timeoutsUsed2H=0;
      toast('Q3 started — 3 timeouts per team'); 
    }
    else if (q==='1') { 
      state.home.timeouts=2; state.home.timeoutsHalf=2; 
      state.away.timeouts=2; state.away.timeoutsHalf=2;
      state.home.timeoutsUsed1H=0; state.away.timeoutsUsed1H=0;
      toast('Q1 started — 2 timeouts per team'); 
    }
    else toast(`Q${state.quarter} started`);
    resetClock(); addPlay(null,`Quarter ${state.quarter} started`,'sys',0); scheduleSaveGame(); updateMeta(); renderRoster('home'); renderRoster('away'); renderStats();
  });
});

/* ══════════════════════════════
   DB HELPERS
══════════════════════════════ */
let _leagueListCache = null;
let _leagueCacheTime = 0;
 
async function loadLeaguesFromDB() {
  // Cache leagues for 30 seconds — avoids re-fetching on every dropdown change
  const now = Date.now();
  if (_leagueListCache && (now - _leagueCacheTime) < 30000) {
    return _leagueListCache;
  }
  const result = await db.select('leagues', { 'select':'id,name,category', 'order':'name.asc' });
  _leagueListCache = result;
  _leagueCacheTime = now;
  return result;
}
 
function invalidateLeagueCache() {
  _leagueListCache = null;
  _leagueCacheTime = 0;
}
 
async function loadTeamsFromDB(leagueId) {
  const params = { 'order': 'name.asc' };
  if (leagueId) params.league_id = `eq.${leagueId}`;
  return db.select('teams', params);
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

async function getOrCreateTeam(name, leagueId) {
  const existing = await db.select('teams', { 'name':`eq.${name}`, 'select':'id,name,league_id' });
  if (existing.length) {
    if (leagueId !== undefined) await db.update('teams', { league_id:leagueId||null }, { 'id':`eq.${existing[0].id}` });
    return existing[0].id;
  }
  const created = await db.insert('teams', { name, league_id:leagueId||null });
  return created[0].id;
}

async function createGame() {
  if (!state.home.dbId||!state.away.dbId) return;
  const leagueId = $('navLeagueSelect')?.value || null;
  const rows = await db.insert('games', {
    home_team_id:state.home.dbId, away_team_id:state.away.dbId,
    home_name:state.home.name, away_name:state.away.name,
    home_score:0, away_score:0, home_fouls:0, away_fouls:0, home_timeouts:5, away_timeouts:5,
    home_pto:0, home_fbp:0, home_twocp:0, home_fbto:0,
    away_pto:0, away_fbp:0, away_twocp:0, away_fbto:0,
    quarter:'1', status:'ongoing', league_id: leagueId||null,
  });
  state.currentGameId=rows[0].id;
  await createGameStats();
  toast('🏀 Game started!');
}

async function createGameStats() {
  if (!state.currentGameId) return;
  const rows=[];
  for (const p of state.home.players) rows.push(makeStatRow(p,'home'));
  for (const p of state.away.players) rows.push(makeStatRow(p,'away'));
  if (!rows.length) return;
  const inserted=await db.insert('game_stats',rows);
  inserted.forEach(row=>{ const team=row.team_id===state.home.dbId?'home':'away'; const p=state[team].players.find(x=>x.dbId===row.player_id); if(p) p.dbStatId=row.id; });
}

function makeStatRow(p,team) {
  return { game_id:state.currentGameId, player_id:p.dbId, team_id:state[team].dbId,
    on_court:p.onCourt, pts:p.pts, fgm:p.fgm, fga:p.fga, tpm:p.tpm, tpa:p.tpa,
    ftm:p.ftm, fta:p.fta, off_reb:p.or, def_reb:p.dr, ast:p.ast, stl:p.stl, blk:p.blk,
    turnovers:p.to, fouls:p.fls, pto:p.pto||0, fbp:p.fbp||0, twocp:p.twocp||0, fbto:p.fbto||0 };
}

function scheduleSaveGame() { clearTimeout(saveGameTimer); saveGameTimer=setTimeout(saveGameToDB,1500); }

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
          on_court:p.onCourt, pts:p.pts, fgm:p.fgm, fga:p.fga, tpm:p.tpm, tpa:p.tpa,
          ftm:p.ftm, fta:p.fta, off_reb:p.or, def_reb:p.dr, ast:p.ast, stl:p.stl,
          blk:p.blk, turnovers:p.to, fouls:p.fls, pto:p.pto||0, fbp:p.fbp||0, twocp:p.twocp||0, fbto:p.fbto||0,
          secs:p.secs||0,
        }, { 'id':`eq.${p.dbStatId}` });
      }
    }
  } catch(e) { console.warn('Auto-save failed:', e.message); }
}

async function savePlayToDB(play) {
  if (!state.currentGameId) return;
  try {
    await db.insert('plays', {
      game_id:state.currentGameId, player_id:play.playerId||null,
      team_id:play.team==='home'?state.home.dbId:play.team==='away'?state.away.dbId:null,
      action:play.dotClass, description:play.text,
      quarter:play.quarter, clock_time:play.time,
      home_score:play.scoreH, away_score:play.scoreA,
    });
  } catch(e) { console.warn('Play save failed:', e.message); }
}

/* ══════════════════════════════
   START GAME / END GAME
══════════════════════════════ */
function updateGameButtons() {
  const btnStart = $('btnStartGame');
  const btnEnd   = $('btnEndGame');
  const bothTeams = state.home.dbId && state.away.dbId;

  if (state.currentGameId) {
    // Game is live
    btnStart.style.display = 'none';
    btnEnd.style.display   = '';
    // Enable clock
    dom.btnClockStart.disabled = false;
    dom.btnClockStart.title = '';
    dom.btnClockStart.style.opacity = '1';
  } else {
    // No game yet
    btnStart.style.display = '';
    btnEnd.style.display   = 'none';
    btnStart.disabled = !bothTeams;
    btnStart.style.opacity = bothTeams ? '1' : '0.4';
    btnStart.title = bothTeams ? 'Start the game' : 'Select both teams first';
    // Lock clock until game starts
    dom.btnClockStart.disabled = true;
    dom.btnClockStart.title = 'Press ▶ START GAME first';
    dom.btnClockStart.style.opacity = '0.4';
  }
}

$('btnStartGame').addEventListener('click', async () => {
  if (!state.home.dbId || !state.away.dbId) {
    toast('⚠ Select both HOME and AWAY teams first!'); return;
  }
  if (state.currentGameId) { toast('Game already started!'); return; }
  showLoading('Starting game...');
  try {
    state.home.players.forEach(p=>{ p.isStarter=p.onCourt; });
    state.away.players.forEach(p=>{ p.isStarter=p.onCourt; });
    await createGame();
    startClock();
    updateGameButtons();
    addPlay(null, `Game started: ${state.home.name} vs ${state.away.name}`, 'sys', 0);
  } catch(e) { toast('❌ ' + e.message); }
  finally { hideLoading(); }
});

$('btnEndGame').addEventListener('click', () => {
  if (!state.currentGameId) return;
  const hs = state.home.score, as = state.away.score;
  const winner = hs > as ? state.home.name : as > hs ? state.away.name : 'TIE';
  const summary = `${state.home.name} ${hs} — ${as} ${state.away.name}`;
  $('endGameSummary').textContent = summary;
  $('endGameModal').classList.add('visible');
});

$('cancelEndGame').addEventListener('click', () => $('endGameModal').classList.remove('visible'));
$('endGameModal').addEventListener('click', e => { if (e.target === $('endGameModal')) $('endGameModal').classList.remove('visible'); });

$('confirmEndGame').addEventListener('click', async () => {
  $('endGameModal').classList.remove('visible');
  clearTimeout(saveGameTimer);
  await saveGameToDB();
  showLoading('Ending game...');
  try {
    const hs = state.home.score, as = state.away.score;
    const winnerId = hs > as ? state.home.dbId : as > hs ? state.away.dbId : null;
    await db.update('games', {
      status: 'finished',
      winner_team_id: winnerId,
      home_score: hs, away_score: as,
      home_fouls: state.home.fouls, away_fouls: state.away.fouls,
      home_pto: state.home.pto, home_fbp: state.home.fbp,
      home_twocp: state.home.twocp, home_fbto: state.home.fbto,
      away_pto: state.away.pto, away_fbp: state.away.fbp,
      away_twocp: state.away.twocp, away_fbto: state.away.fbto,
      quarter: state.quarter,
      updated_at: new Date().toISOString(),
    }, { 'id': `eq.${state.currentGameId}` });
    stopClock();
    const resultText = hs > as ? `${state.home.name} wins!` : as > hs ? `${state.away.name} wins!` : "It's a tie!";
    addPlay(null, `Game ended — ${resultText} (${hs}–${as})`, 'sys', 0);
    toast(`🏁 Game over! ${resultText}`);
    state.currentGameId = null;
    updateGameButtons();
  } catch(e) { toast('❌ ' + e.message); }
  finally { hideLoading(); }
});

/* ══════════════════════════════
   NAV LEAGUE SELECT
══════════════════════════════ */
async function renderNavLeagueSelect() {
  const sel=$('navLeagueSelect'); if(!sel) return;
  const current=sel.value;
  sel.innerHTML='<option value="">— All —</option>';
  try {
    const leagues=await loadLeaguesFromDB();
    leagues.forEach(l=>{
      const opt=document.createElement('option');
      opt.value=l.id;
      opt.textContent=l.category!=='Open'?`${l.name} (${l.category})`:l.name;
      if(l.id===current) opt.selected=true;
      sel.appendChild(opt);
    });
  } catch(e) { console.warn('Nav league load failed:', e.message); }
}

$('navLeagueSelect').addEventListener('change', async () => {
  const leagueId = $('navLeagueSelect').value;
  const ssEl = $('ssLeagueSelect');
  if (ssEl) ssEl.value = leagueId;
 
  if (state.currentGameId && leagueId) {
    db.update('games', { league_id: leagueId }, { 'id': `eq.${state.currentGameId}` }).catch(() => {});
  }
 
  const activeView = document.querySelector('.view.active')?.id;
 
  // Run all refreshes in parallel — no more waiting for each one
  const tasks = [];
  if (activeView === 'view-teams')     tasks.push(loadTeamsView());
  if (activeView === 'view-standings') tasks.push(loadStandings(currentGamesSort));
  if (activeView === 'view-games')     tasks.push(loadGames(currentGamesFilter));
 
  await Promise.all(tasks);
});

$('navLeagueManageBtn').addEventListener('click', async () => {
  await renderLeagueList();
  $('leagueManagerModal').classList.add('visible');
  setTimeout(()=>$('lmNameInput').focus(),200);
});

/* ══════════════════════════════
   SCORER — TEAM SELECT MODAL
   Clicking HOME or AWAY name opens a picker
══════════════════════════════ */
$('homeNameBtn').addEventListener('click', () => openTeamPicker('home'));
$('awayNameBtn').addEventListener('click', () => openTeamPicker('away'));

async function openTeamPicker(team) {
  setupTeam=team;
  $('tpIcon').textContent=team==='home'?'🏠':'✈️';
  $('tpTitle').textContent=`SELECT ${team.toUpperCase()} TEAM`;
  $('teamPickerModal').classList.add('visible');
  await renderTeamPickerList();
}

async function renderTeamPickerList() {
  const list=$('tpTeamList');
  list.innerHTML=`<div class="ts-empty"><div class="db-spinner" style="width:18px;height:18px;margin:0 auto 6px"></div>Loading...</div>`;
  try {
    const leagueId=$('navLeagueSelect')?.value||null;
    const teams=await loadTeamsFromDB(leagueId);
    if(!teams.length){
      list.innerHTML=`<div class="ts-empty">No teams found.<br><span style="font-size:.72rem;opacity:.7">Go to TEAMS tab to add teams first!</span></div>`;
      return;
    }
    list.innerHTML='';
    for(const t of teams){
      const players=await loadPlayersFromDB(t.id);
      const card=document.createElement('div');
      card.className='ts-team-card';
      card.innerHTML=`
        <div class="ts-team-icon">🏀</div>
        <div class="ts-team-info">
          <div class="ts-team-name">${t.name}</div>
          <div class="ts-team-meta">${players.length} player${players.length!==1?'s':''}</div>
        </div>
        <button class="ts-load-btn">▶ SELECT</button>
      `;
      card.querySelector('.ts-load-btn').addEventListener('click', async()=>{
        await loadTeamIntoScorer(t.id, t.name, players);
        $('teamPickerModal').classList.remove('visible');
      });
      list.appendChild(card);
    }
  } catch(e){ list.innerHTML=`<div class="ts-empty" style="color:var(--red)">❌ ${e.message}</div>`; }
}

async function loadTeamIntoScorer(teamDbId, name, players) {
  const team=setupTeam;
  state[team].name=name; state[team].dbId=teamDbId;
  state[team].players=players.map(p=>mkPlayer(p));
  // Auto-set first 5 as starters
  state[team].players.forEach(p=>{ p.onCourt=false; });
  updateTeamNameDisplay(team);
  renderRoster('home'); renderRoster('away'); renderStats();
  toast(`✓ ${name} loaded`);
  updateGameButtons();
}

$('closeTeamPicker').addEventListener('click', ()=>$('teamPickerModal').classList.remove('visible'));
$('closeTeamPicker2').addEventListener('click', ()=>$('teamPickerModal').classList.remove('visible'));
$('teamPickerModal').addEventListener('click', e=>{ if(e.target===$('teamPickerModal')) $('teamPickerModal').classList.remove('visible'); });

function updateTeamNameDisplay(team){ dom[`${team}NameDisplay`].textContent=state[team].name; }

/* ══════════════════════════════
   GAMES VIEW
══════════════════════════════ */
document.querySelectorAll('[data-filter]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-filter]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); currentGamesFilter=btn.dataset.filter; loadGames(currentGamesFilter);
  });
});

async function loadGames(filter='all') {
  const grid=$('gamesGrid');
  grid.innerHTML=`<div class="page-loading"><div class="db-spinner"></div><span>Loading games...</span></div>`;
  try {
    // Cache leagues for card display
    const leagues = await loadLeaguesFromDB();
    window._leagueCache = {};
    leagues.forEach(l => {
      window._leagueCache[l.id] = l.category !== 'Open' ? `${l.name} (${l.category})` : l.name;
    });

    const leagueId=$('navLeagueSelect')?.value||null;
    const params={'select':'*','order':'created_at.desc'};
    if(filter==='ongoing')  params.status='eq.ongoing';
    if(filter==='finished') params.status='eq.finished';
    if(leagueId) params.league_id=`eq.${leagueId}`;
    const games=await db.select('games',params);

    if(!games.length){
      const msg = filter==='ongoing'?'No live games right now.':filter==='finished'?'No finished games yet.':'No games found.';
      grid.innerHTML=`<div class="page-loading" style="color:var(--muted)">${msg}</div>`; return;
    }

    // Sort: ongoing first, then by date
    games.sort((a,b)=>{
      if(a.status==='ongoing'&&b.status!=='ongoing') return -1;
      if(b.status==='ongoing'&&a.status!=='ongoing') return 1;
      return new Date(b.created_at)-new Date(a.created_at);
    });

    grid.innerHTML='';

    // If no league filter, group by league/division
    if(!leagueId) {
      // Group games by league
      const grouped = {};
      const noLeague = [];
      games.forEach(g => {
        if(g.league_id && window._leagueCache[g.league_id]) {
          if(!grouped[g.league_id]) grouped[g.league_id] = [];
          grouped[g.league_id].push(g);
        } else {
          noLeague.push(g);
        }
      });

      // Render each league group
      Object.entries(grouped).forEach(([lid, lgames]) => {
        const section = document.createElement('div');
        section.className = 'games-section';
        section.innerHTML = `<div class="games-section-header">
          <span class="games-section-title">${window._leagueCache[lid]}</span>
          <span class="games-section-count">${lgames.length} game${lgames.length!==1?'s':''}</span>
        </div>`;
        const gGrid = document.createElement('div');
        gGrid.className = 'games-section-grid';
        lgames.forEach(g => gGrid.appendChild(buildGameCard(g)));
        section.appendChild(gGrid);
        grid.appendChild(section);
      });

      // Render games without league
      if(noLeague.length) {
        const section = document.createElement('div');
        section.className = 'games-section';
        section.innerHTML = `<div class="games-section-header">
          <span class="games-section-title">— No Division —</span>
          <span class="games-section-count">${noLeague.length} game${noLeague.length!==1?'s':''}</span>
        </div>`;
        const gGrid = document.createElement('div');
        gGrid.className = 'games-section-grid';
        noLeague.forEach(g => gGrid.appendChild(buildGameCard(g)));
        section.appendChild(gGrid);
        grid.appendChild(section);
      }
    } else {
      // Single league — just show cards
      games.forEach(g=>grid.appendChild(buildGameCard(g)));
    }

  } catch(e){ grid.innerHTML=`<div class="page-loading" style="color:var(--red)">❌ ${e.message}</div>`; }
}
function buildGameCard(g) {
  const card = document.createElement('div');
  card.className = `game-card${g.status === 'ongoing' ? ' live-card' : ''}`;
  const d = new Date(g.created_at);
  const leagueName = g.league_id ? (window._leagueCache?.[g.league_id] || '') : '';
 
  // Build action buttons based on status
  let actionBtns = '';
  if (g.status === 'ongoing') {
    actionBtns = `
      <button class="gc-end-btn"    data-id="${g.id}" data-home="${g.home_name||'HOME'}" data-away="${g.away_name||'AWAY'}" data-hs="${g.home_score}" data-as="${g.away_score}" title="End this game">🏁 END</button>
      <button class="gc-delete-btn" data-id="${g.id}" title="Delete live game">🗑</button>
    `;
  } else {
    actionBtns = `
      <button class="gc-edit-btn"   data-id="${g.id}" title="Edit score">✎</button>
      <button class="gc-delete-btn" data-id="${g.id}" title="Delete game">🗑</button>
    `;
  }
 
  card.innerHTML = `
    <div class="gc-header">
      <span class="gc-date">${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
      <div style="display:flex;align-items:center;gap:5px;">
        ${leagueName ? `<span class="gc-league-badge">${leagueName}</span>` : ''}
        <span class="gc-status ${g.status}">${g.status === 'ongoing' ? '🔴 LIVE' : '✅ FINAL'}</span>
        ${actionBtns}
      </div>
    </div>
    <div class="gc-score">
      <div class="gc-team gc-home">
        <div class="gc-team-name" style="color:var(--home)">${g.home_name || 'HOME'}</div>
        <div class="gc-team-score">${g.home_score}</div>
      </div>
      <div class="gc-vs">VS</div>
      <div class="gc-team gc-away">
        <div class="gc-team-name" style="color:var(--away)">${g.away_name || 'AWAY'}</div>
        <div class="gc-team-score">${g.away_score}</div>
      </div>
    </div>
    <div class="gc-footer">
      <span class="gc-quarter">Q${g.quarter}</span>
      <span class="gc-view-btn">VIEW DETAILS →</span>
    </div>
  `;
 
  // ── END LIVE GAME ──
  const endBtn = card.querySelector('.gc-end-btn');
  if (endBtn) {
    endBtn.addEventListener('click', async e => {
      e.stopPropagation();
      const btn = e.currentTarget;
      const hs = parseInt(btn.dataset.hs) || 0;
      const as = parseInt(btn.dataset.as) || 0;
      const homeName = btn.dataset.home;
      const awayName = btn.dataset.away;
      const winner = hs > as ? homeName : as > hs ? awayName : 'TIE';
      const summary = `${homeName} ${hs} — ${as} ${awayName}`;
 
      if (!confirm(`End this live game?\n\n${summary}\nWinner: ${winner}\n\nThis will mark it as FINISHED and update standings.`)) return;
 
      showLoading('Ending game...');
      try {
        // Get full game to find team IDs for winner
        const games = await db.select('games', { 'id': `eq.${btn.dataset.id}`, 'select': '*' });
        if (!games.length) return;
        const gData = games[0];
        const winnerId = hs > as ? gData.home_team_id : as > hs ? gData.away_team_id : null;
 
       clearTimeout(saveGameTimer);
        await saveGameToDB();
        await db.update('games', {
          status: 'finished',
          winner_team_id: winnerId,
          home_score: hs,
          away_score: as,
          home_pto: gData.home_pto||0, home_fbp: gData.home_fbp||0,
          home_twocp: gData.home_twocp||0, home_fbto: gData.home_fbto||0,
          away_pto: gData.away_pto||0, away_fbp: gData.away_fbp||0,
          away_twocp: gData.away_twocp||0, away_fbto: gData.away_fbto||0,
          home_fouls: gData.home_fouls||0, away_fouls: gData.away_fouls||0,
          updated_at: new Date().toISOString()
        }, { 'id': `eq.${btn.dataset.id}` });
        toast(`🏁 Game ended! ${winner !== 'TIE' ? winner + ' wins!' : "It's a tie!"}`);
        loadGames(currentGamesFilter);
        loadStandings(currentGamesSort);
      } catch (err) { toast('❌ ' + err.message); }
      finally { hideLoading(); }
    });
  }
 
  // ── EDIT SCORE (finished only) ──
  const editBtn = card.querySelector('.gc-edit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', async e => {
      e.stopPropagation();
      openEditScoreModal(g.id, g.home_name || 'HOME', g.away_name || 'AWAY', g.home_score, g.away_score, g.status);
    });
  }
 
  // ── DELETE GAME (both live and finished) ──
  const delBtn = card.querySelector('.gc-delete-btn');
  if (delBtn) {
    delBtn.addEventListener('click', async e => {
      e.stopPropagation();
      const isLive = g.status === 'ongoing';
      const msg = isLive
        ? `Delete this LIVE game?\n${g.home_name} vs ${g.away_name}\n\n⚠ This will permanently delete the ongoing game.`
        : `Delete this finished game?\n${g.home_name} vs ${g.away_name}\n\nThis cannot be undone.`;
      if (!confirm(msg)) return;
      showLoading('Deleting game...');
      try {
        await db.delete('plays',      { 'game_id': `eq.${g.id}` });
        await db.delete('game_stats', { 'game_id': `eq.${g.id}` });
        await db.delete('games',      { 'id':      `eq.${g.id}` });
        toast('🗑 Game deleted');
        loadGames(currentGamesFilter);
        loadStandings(currentGamesSort);
      } catch (err) { toast('❌ ' + err.message); }
      finally { hideLoading(); }
    });
  }
 
  card.addEventListener('click', () => openGameDetail(g.id, g.status === 'ongoing'));
  return card;
}
 

/* ══════════════════════════════
   GAME DETAIL MODAL
══════════════════════════════ */
$('closeGameDetail').addEventListener('click',()=>$('gameDetailModal').classList.remove('visible'));
$('closeGameDetail2').addEventListener('click',()=>$('gameDetailModal').classList.remove('visible'));
$('gameDetailModal').addEventListener('click',e=>{ if(e.target===$('gameDetailModal')) $('gameDetailModal').classList.remove('visible'); });

document.querySelectorAll('.gd-tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.gd-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    loadGameDetailTab(currentGameDetailId, tab.dataset.tab);
  });
});

$('gdLoadBtn').addEventListener('click', async()=>{
  if(!currentGameDetailId) return;
  await loadGameIntoScorerFromDB(currentGameDetailId);
  $('gameDetailModal').classList.remove('visible');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelector('[data-view="scorer"]').classList.add('active');
  $('view-scorer').classList.add('active');
  // For finished games, show print options immediately
  const games = await db.select('games',{'id':`eq.${currentGameDetailId}`,'select':'status'});
  if(games[0]?.status === 'finished'){
    toast('✅ Game loaded — use PDF or 📋 Scoresheet to print');
  }
});

async function openGameDetail(gameId, isLive) {
  currentGameDetailId=gameId;
  $('gdLiveBadge').style.display=isLive?'block':'none';
  $('gdLoadBtn').style.display='block';
$('gdLoadBtn').textContent=isLive?'▶ LOAD INTO SCORER':'📋 VIEW & PRINT';
$('gdTitle').textContent=isLive?'🔴 LIVE GAME':'GAME DETAILS';
  $('gdContent').innerHTML=`<div class="page-loading"><div class="db-spinner"></div></div>`;
  showLoading('Loading game...');
  try {
    const games=await db.select('games',{'id':`eq.${gameId}`,'select':'*'});
    if(!games.length){ toast('Game not found'); return; }
    const g=games[0];
    $('gdScoreboard').innerHTML=`
      <div class="gd-team home"><div class="gd-team-name" style="color:var(--home)">${g.home_name||'HOME'}</div><div class="gd-team-score">${g.home_score}</div></div>
      <div class="gd-vs-block"><div class="gd-vs">VS</div><div class="gd-qtr">Q${g.quarter} · ${g.status.toUpperCase()}</div></div>
      <div class="gd-team away"><div class="gd-team-name" style="color:var(--away)">${g.away_name||'AWAY'}</div><div class="gd-team-score">${g.away_score}</div></div>
    `;
    document.querySelectorAll('.gd-tab').forEach(t=>t.classList.remove('active'));
    document.querySelector('.gd-tab[data-tab="boxscore"]').classList.add('active');
    await loadGameDetailTab(gameId,'boxscore');
    $('gameDetailModal').classList.add('visible');
  } catch(e){ toast('❌ '+e.message); }
  finally { hideLoading(); }
}

async function loadGameDetailTab(gameId, tab) {
  const content=$('gdContent');
  content.innerHTML=`<div class="page-loading"><div class="db-spinner"></div></div>`;
  try {
    if(tab==='boxscore'){
      const stats=await db.select('game_stats',{'game_id':`eq.${gameId}`,'select':'*'});
      const playerIds=[...new Set(stats.map(s=>s.player_id).filter(Boolean))];
      let playerMap={};
      if(playerIds.length){ const players=await db.select('players',{'id':`in.(${playerIds.join(',')})`, 'select':'id,name,num,pos'}); players.forEach(p=>playerMap[p.id]=p); }
      if(!stats.length){ content.innerHTML=`<div class="page-loading">No stats recorded yet.</div>`; return; }
      let html=`<div style="overflow-x:auto"><table class="stats-table" style="width:100%"><thead><tr><th style="text-align:left">Player</th><th>POS</th><th>PTS</th><th>FGM</th><th>FGA</th><th>3PM</th><th>3PA</th><th>FTM</th><th>FTA</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>FLS</th></tr></thead><tbody>`;
      stats.forEach(s=>{ const p=playerMap[s.player_id]||{}; html+=`<tr><td style="text-align:left">#${p.num||'—'} ${p.name||'Unknown'}</td><td>${p.pos||'—'}</td><td><strong>${s.pts}</strong></td><td>${s.fgm}</td><td>${s.fga}</td><td>${s.tpm}</td><td>${s.tpa}</td><td>${s.ftm}</td><td>${s.fta}</td><td>${(s.off_reb||0)+(s.def_reb||0)}</td><td>${s.ast}</td><td>${s.stl}</td><td>${s.blk}</td><td>${s.turnovers}</td><td>${s.fouls}</td></tr>`; });
      content.innerHTML=html+'</tbody></table></div>';
    } else {
      const plays=await db.select('plays',{'game_id':`eq.${gameId}`,'select':'*','order':'created_at.desc','limit':'100'});
      if(!plays.length){ content.innerHTML=`<div class="page-loading">No plays recorded yet.</div>`; return; }
      content.innerHTML='<div>'+plays.map(p=>`<div class="pbp-entry"><div class="pbp-dot ${p.action==='home'?'home':p.action==='away'?'away':p.action==='special'?'special':'sys'}"></div><span class="pbp-text">${p.description||p.action}</span><span class="pbp-qtr">${p.clock_time||''}</span><span class="pbp-score">${p.home_score}–${p.away_score}</span><span class="pbp-qtr">Q${p.quarter}</span></div>`).join('')+'</div>';
    }
  } catch(e){ content.innerHTML=`<div class="page-loading" style="color:var(--red)">❌ ${e.message}</div>`; }
}

async function loadGameIntoScorerFromDB(gameId) {
  showLoading('Loading game...');
  try {
    const games=await db.select('games',{'id':`eq.${gameId}`,'select':'*'});
    if(!games.length) return;
    const g=games[0];

    // Load players and build roster
    if(g.home_team_id){
      const hp=await loadPlayersFromDB(g.home_team_id);
      state.home.name=g.home_name||'HOME'; state.home.dbId=g.home_team_id;
      state.home.score=g.home_score||0; state.home.fouls=g.home_fouls||0;
      state.home.timeouts=g.home_timeouts??5;
      state.home.pto=g.home_pto||0; state.home.fbp=g.home_fbp||0;
      state.home.twocp=g.home_twocp||0; state.home.fbto=g.home_fbto||0;
      // restore stat group counts to display in the scoreboard pills
      state.home.ptoCount=g.home_pto||0; state.home.fbpCount=g.home_fbp||0;
      state.home.twocpCount=g.home_twocp||0; state.home.fbtoCount=g.home_fbto||0;
      state.home.players=hp.map(p=>mkPlayer(p));
    }
    if(g.away_team_id){
      const ap=await loadPlayersFromDB(g.away_team_id);
      state.away.name=g.away_name||'AWAY'; state.away.dbId=g.away_team_id;
      state.away.score=g.away_score||0; state.away.fouls=g.away_fouls||0;
      state.away.timeouts=g.away_timeouts??5;
      state.away.pto=g.away_pto||0; state.away.fbp=g.away_fbp||0;
      state.away.twocp=g.away_twocp||0; state.away.fbto=g.away_fbto||0;
      // restore stat group counts to display in the scoreboard pills
      state.away.ptoCount=g.away_pto||0; state.away.fbpCount=g.away_fbp||0;
      state.away.twocpCount=g.away_twocp||0; state.away.fbtoCount=g.away_fbto||0;
      state.away.players=ap.map(p=>mkPlayer(p));
    }
  // ── Load all plays first ──
    const savedPlays=await db.select('plays',{
      'game_id':`eq.${gameId}`,
      'select':'*',
      'order':'created_at.asc'
    });

    // ── Reset all player stats to zero ──
    for(const t of ['home','away']){
      state[t].fouls=0;
      state[t].players.forEach(p=>{
        p.pts=0;p.fgm=0;p.fga=0;p.tpm=0;p.tpa=0;
        p.ftm=0;p.fta=0;p.or=0;p.dr=0;
        p.ast=0;p.stl=0;p.blk=0;p.to=0;
        p.fls=0;p.tf=0;p.uf=0;p.onCourt=false;
      });
    }

    // ── Set starters from game_stats on_court field ──
    const savedStats=await db.select('game_stats',{'game_id':`eq.${gameId}`,'select':'player_id,on_court,id,secs'});
    savedStats.forEach(s=>{
      for(const t of ['home','away']){
        const p=state[t].players.find(x=>x.dbId===s.player_id);
        if(p){ p.onCourt=s.on_court||false; p.dbStatId=s.id; p.secs=s.secs||0; }
      }
    });
    // fallback: if nobody set as on_court, use first 5
    if(!state.home.players.some(p=>p.onCourt)) state.home.players.forEach((p,i)=>{ p.onCourt=i<5; });
    if(!state.away.players.some(p=>p.onCourt)) state.away.players.forEach((p,i)=>{ p.onCourt=i<5; });

    // ── Rebuild ALL stats by replaying every play ──
    savedPlays.forEach(play=>{
      if(!play.player_id) return;
      let player=null, team=null;
      for(const t of ['home','away']){
        const found=state[t].players.find(x=>String(x.dbId)===String(play.player_id));
        if(found){ player=found; team=t; break; }
      }
      const desc=play.description||'';
      // ── Team special stats (no player_id) ──
     if(!player||!team) return;
      if     (desc.includes('2PT Made'))                              { player.fgm++;player.fga++;player.pts+=2; }
      else if(desc.includes('2PT Miss'))                              { player.fga++; }
      else if(desc.includes('3PT Made'))                              { player.tpm++;player.tpa++;player.fgm++;player.fga++;player.pts+=3; }
      else if(desc.includes('3PT Miss'))                              { player.tpa++;player.fga++; }
      else if(desc.includes('Free Throw')&&!desc.includes('Miss'))   { player.ftm++;player.fta++;player.pts+=1; }
      else if(desc.includes('FT Miss'))                               { player.fta++; }
      else if(desc.includes('Off. Rebound'))                          { player.or++; }
      else if(desc.includes('Def. Rebound'))                          { player.dr++; }
      else if(desc.includes('Assist'))                                { player.ast++; }
      else if(desc.includes('Steal'))                                 { player.stl++; }
      else if(desc.includes('Block'))                                 { player.blk++; }
      else if(desc.includes('Turnover'))                              { player.to++; }
      else if(desc.includes('Technical Foul'))                        { player.tf=(player.tf||0)+1; player.fls++; state[team].fouls++; }
      else if(desc.includes('Unsportsmanlike'))                       { player.uf=(player.uf||0)+1; player.fls++; state[team].fouls++; }
      else if(desc.includes('Foul (F)'))                              { player.fls++; state[team].fouls++; }
    });

    // ── Rebuild scoring events for running score ──
    state.scoringEvents=[];
    savedPlays.forEach(play=>{
      const isHome=String(play.team_id)===String(state.home.dbId);
      const isAway=String(play.team_id)===String(state.away.dbId);
      if(!isHome&&!isAway) return;
      const team=isHome?'home':'away';
      const desc=play.description||'';
      let pts=0;
      if(desc.includes('2PT Made')) pts=2;
      else if(desc.includes('3PT Made')) pts=3;
      else if(desc.includes('Free Throw')&&!desc.includes('Miss')) pts=1;
      if(pts>0){
        let playerNum='';
        if(play.player_id){
          for(const t of ['home','away']){
            const found=state[t].players.find(x=>String(x.dbId)===String(play.player_id));
            if(found){ playerNum=String(found.num||''); break; }
          }
        }
        state.scoringEvents.push({team,pts,playerNum,quarter:play.quarter||'1'});
      }
    });

    // ── Rebuild play-by-play display ──
    state.plays=savedPlays.map(play=>({
     team: String(play.team_id)===String(state.home.dbId)?'home':String(play.team_id)===String(state.away.dbId)?'away':null,
      text: play.description||play.action,
      dotClass: play.action||'sys',
      pts: 0, playerId: play.player_id,
      quarter: play.quarter||'1',
      scoreH: play.home_score||0,
      scoreA: play.away_score||0,
      time: play.clock_time||'00:00'
    })).reverse();

    // ── Rebuild biggest lead ──
    state._homeLead=0; state._awayLead=0;
    savedPlays.forEach(play=>{
      const diff=(play.home_score||0)-(play.away_score||0);
      if(diff>0) state._homeLead=Math.max(state._homeLead,diff);
      if(diff<0) state._awayLead=Math.max(state._awayLead,Math.abs(diff));
    });

    // ── Rebuild quarter scores ──
    state.quarterScores={'1':null,'2':null,'3':null,'4':null,'OT':null};
    ['1','2','3','4','OT'].forEach(q=>{
      const qp=savedPlays.filter(p=>p.quarter===q);
      if(qp.length){ const last=qp[qp.length-1]; state.quarterScores[q]={home:last.home_score||0,away:last.away_score||0}; }
    });

    // ── Rebuild timeout usage ──
    state.home.timeoutsUsed1H=0; state.home.timeoutsUsed2H=0;
    state.away.timeoutsUsed1H=0; state.away.timeoutsUsed2H=0;
    savedPlays.forEach(play=>{
      if(!(play.description||'').includes('called timeout')) return;
      const isFirst=(play.quarter==='1'||play.quarter==='2');
     if(String(play.team_id)===String(state.home.dbId)){ if(isFirst) state.home.timeoutsUsed1H++; else state.home.timeoutsUsed2H++; }
      else if(String(play.team_id)===String(state.away.dbId)){ if(isFirst) state.away.timeoutsUsed1H++; else state.away.timeoutsUsed2H++; }
    });

    state.currentGameId=gameId;
    state.quarter=g.quarter||'1';
    viewerMode=false;

    updateTeamNameDisplay('home'); updateTeamNameDisplay('away');
    updateScore('home'); updateScore('away');
    // Re-read from games table to ensure PTO/FBP/2CP/FBTO are correct
    state.home.pto=g.home_pto||0; state.home.fbp=g.home_fbp||0;
    state.home.twocp=g.home_twocp||0; state.home.fbto=g.home_fbto||0;
    state.away.pto=g.away_pto||0; state.away.fbp=g.away_fbp||0;
    state.away.twocp=g.away_twocp||0; state.away.fbto=g.away_fbto||0;
    console.log('PTO check — home:', state.home.pto, 'away:', state.away.pto, 'g.home_pto:', g.home_pto, 'g.away_pto:', g.away_pto);
    state.home.pto=g.home_pto||0; state.home.fbp=g.home_fbp||0;
    state.home.twocp=g.home_twocp||0; state.home.fbto=g.home_fbto||0;
    state.away.pto=g.away_pto||0; state.away.fbp=g.away_fbp||0;
    state.away.twocp=g.away_twocp||0; state.away.fbto=g.away_fbto||0;
    console.log('After fix — home pto:', state.home.pto, 'away pto:', state.away.pto);
    updateMeta(); updateSpecialStats();
    dom.homePTOCount.textContent=state.home.pto||0;
    dom.homeFBPCount.textContent=state.home.fbp||0;
    dom.home2CPCount.textContent=state.home.twocp||0;
    dom.homeFBTOCount.textContent=state.home.fbto||0;
    dom.awayPTOCount.textContent=state.away.pto||0;
    dom.awayFBPCount.textContent=state.away.fbp||0;
    dom.away2CPCount.textContent=state.away.twocp||0;
    dom.awayFBTOCount.textContent=state.away.fbto||0;
    dom.homePTO.textContent=state.home.pto||0;
    dom.homeFBP.textContent=state.home.fbp||0;
    dom.home2CP.textContent=state.home.twocp||0;
    dom.homeFBTO.textContent=state.home.fbto||0;
    dom.awayPTO.textContent=state.away.pto||0;
    dom.awayFBP.textContent=state.away.fbp||0;
    dom.away2CP.textContent=state.away.twocp||0;
    dom.awayFBTO.textContent=state.away.fbto||0;
    renderRoster('home'); renderRoster('away');
    renderStats(); renderPBP();
    document.querySelectorAll('.quarter-btn').forEach(b=>b.classList.toggle('active',b.dataset.q===state.quarter));
    updateGameButtons();
    toast(`✓ Loaded: ${g.home_name} vs ${g.away_name} — ready to print`);
  } catch(e){ toast('❌ '+e.message); }
  finally { hideLoading(); }
}

function mkPlayer(p) {
  return { id:playerIdCounter++, dbId:p.id, dbStatId:null, num:p.num, name:p.name, pos:p.pos, onCourt:false, isStarter:false,
    pts:0, fgm:0, fga:0, tpm:0, tpa:0, ftm:0, fta:0, or:0, dr:0, ast:0, stl:0, blk:0, to:0, fls:0, tf:0, uf:0, pto:0, fbp:0, twocp:0, fbto:0, secs:0 };
}

/* ══════════════════════════════
   TEAMS VIEW — Full CRUD
══════════════════════════════ */
let teamsPlayerSort = 'num'; // default sort

async function loadTeamsView() {
  const grid=$('teamsGrid');
  grid.innerHTML=`<div class="page-loading"><div class="db-spinner"></div><span>Loading teams...</span></div>`;
  try {
    const leagueId=$('navLeagueSelect')?.value||null;
    const teams=await loadTeamsFromDB(leagueId);
    const suffix=leagueId?' in this league':'';

    if(!teams.length){
      $('teamsCount').textContent=`0 teams registered${suffix}`;
      grid.innerHTML=`<div class="page-loading">No teams${suffix} yet.<br><span style="font-size:.78rem;opacity:.6">Use the ➕ button to add a team!</span></div>`;
      return;
    }

    // Build header with count + sort controls
    const headerBar = document.createElement('div');
    headerBar.className = 'teams-sort-bar';
    headerBar.innerHTML = `
      <span class="teams-sort-label">
        ${teams.length} team${teams.length!==1?'s':''} registered${suffix}
      </span>
      <div class="teams-sort-group">
        <span class="teams-sort-hint">SORT PLAYERS BY</span>
        <button class="tsort-btn ${teamsPlayerSort==='num'?'active':''}" data-sort="num"># NUMBER</button>
        <button class="tsort-btn ${teamsPlayerSort==='name'?'active':''}" data-sort="name">A–Z NAME</button>
        <button class="tsort-btn ${teamsPlayerSort==='pos'?'active':''}" data-sort="pos">POSITION</button>
      </div>
    `;
    headerBar.querySelectorAll('.tsort-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        teamsPlayerSort = btn.dataset.sort;
        loadTeamsView();
      });
    });

    $('teamsCount').textContent=''; // clear — we show count in bar instead
    grid.innerHTML='';
    grid.appendChild(headerBar);

    for(const t of teams){
      const players = await loadPlayersFromDB(t.id);
      // Sort players
      const sorted = [...players].sort((a,b)=>{
        if(teamsPlayerSort==='num'){
          const na=parseInt(a.num)||0, nb=parseInt(b.num)||0;
          return na-nb;
        }
        if(teamsPlayerSort==='name') return a.name.localeCompare(b.name);
        if(teamsPlayerSort==='pos'){
          const order=['PG','SG','SF','PF','C'];
          return order.indexOf(a.pos)-order.indexOf(b.pos);
        }
        return 0;
      });
      grid.appendChild(buildTeamCard(t, sorted));
    }
  } catch(e){ grid.innerHTML=`<div class="page-loading" style="color:var(--red)">❌ ${e.message}</div>`; }
}

function buildTeamCard(team, players) {
  const card = document.createElement('div');
  card.className = 'team-card';
  const more = players.length - 6;

  card.innerHTML = `
    <div class="tc-header">
      <div class="tc-header-left">
        <div class="tc-name">${team.name}</div>
        <div class="tc-meta">${players.length} player${players.length!==1?'s':''} registered</div>
      </div>
      <div class="tc-header-actions">
        <button class="tc-manage-btn" data-id="${team.id}" data-name="${team.name}">⚙ MANAGE</button>
        <button class="tc-delete-btn" data-id="${team.id}" data-name="${team.name}">🗑</button>
      </div>
    </div>
    <div class="tc-roster tc-roster-preview">
      ${players.length === 0
        ? `<div class="tc-empty-roster">No players yet — click ⚙ MANAGE to add</div>`
        : players.slice(0,6).map(p=>`
            <div class="tc-player-row">
              <span class="tc-num">#${p.num}</span>
              <span class="tc-pos">${p.pos}</span>
              <span class="tc-pname">${p.name}</span>
            </div>`).join('')
      }
    </div>
    ${players.length > 6 ? `
      <div class="tc-more tc-toggle-btn" data-expanded="false">
        ▼ +${more} more player${more!==1?'s':''}
      </div>` : ''}
    <div class="tc-roster-full" style="display:none">
      ${players.map(p=>`
        <div class="tc-player-row">
          <span class="tc-num">#${p.num}</span>
          <span class="tc-pos">${p.pos}</span>
          <span class="tc-pname">${p.name}</span>
        </div>`).join('')}
    </div>
  `;

  // Manage button
  card.querySelector('.tc-manage-btn').addEventListener('click', e=>{
    e.stopPropagation();
    openTeamManager(team.id, team.name);
  });

  // Delete button
  card.querySelector('.tc-delete-btn').addEventListener('click', async e=>{
    e.stopPropagation();
    const name = e.currentTarget.dataset.name;
    const id = e.currentTarget.dataset.id;
    if(!confirm(`Delete "${name}" and ALL their players?\nThis cannot be undone.`)) return;
    showLoading('Deleting team...');
    try {
      const ps = await loadPlayersFromDB(id);
      for(const p of ps) await deletePlayerFromDB(p.id);
      await deleteTeamFromDB(id);
      toast(`🗑 "${name}" deleted`);
      loadTeamsView();
    } catch(e){ toast('❌ ' + e.message); }
    finally { hideLoading(); }
  });

  // Toggle expand/collapse full roster
  const toggleBtn = card.querySelector('.tc-toggle-btn');
  if(toggleBtn){
    const preview = card.querySelector('.tc-roster-preview');
    const full = card.querySelector('.tc-roster-full');
    toggleBtn.addEventListener('click', e=>{
      e.stopPropagation();
      const expanded = toggleBtn.dataset.expanded === 'true';
      if(expanded){
        full.style.display = 'none';
        preview.style.display = '';
        toggleBtn.dataset.expanded = 'false';
        toggleBtn.textContent = `▼ +${more} more player${more!==1?'s':''}`;
      } else {
        full.style.display = '';
        preview.style.display = 'none';
        toggleBtn.dataset.expanded = 'true';
        toggleBtn.textContent = `▲ Show less`;
      }
    });
  }

  // Click card body to expand (not buttons)
  card.addEventListener('click', ()=>{
    if(toggleBtn) toggleBtn.click();
  });

  return card;
}

/* ── ADD TEAM button — wired directly from HTML ── */
$('addTeamBtn').addEventListener('click', ()=>openNewTeamModal());

/* ══════════════════════════════
   NEW TEAM MODAL
══════════════════════════════ */
async function openNewTeamModal() {
  $('ntTeamName').value='';
  $('ntLeagueSelect').innerHTML='<option value="">— No League —</option>';
  try {
    const leagues=await loadLeaguesFromDB();
    const navId=$('navLeagueSelect')?.value||'';
    leagues.forEach(l=>{ const o=document.createElement('option'); o.value=l.id; o.textContent=l.category!=='Open'?`${l.name} (${l.category})`:l.name; if(l.id===navId) o.selected=true; $('ntLeagueSelect').appendChild(o); });
  } catch(e){}
  $('newTeamModal').classList.add('visible');
  setTimeout(()=>$('ntTeamName').focus(),200);
}

$('ntSaveBtn').addEventListener('click', async()=>{
  const name=$('ntTeamName').value.trim(); if(!name){ $('ntTeamName').focus(); return; }
  const leagueId=$('ntLeagueSelect').value||null;
  showLoading('Creating team...');
  try {
    await getOrCreateTeam(name,leagueId);
    $('newTeamModal').classList.remove('visible');
    await loadTeamsView();
    toast(`✓ Team "${name}" created`);
  } catch(e){ toast('❌ '+e.message); }
  finally { hideLoading(); }
});
$('ntCancelBtn').addEventListener('click',()=>$('newTeamModal').classList.remove('visible'));
$('newTeamModal').addEventListener('click',e=>{ if(e.target===$('newTeamModal')) $('newTeamModal').classList.remove('visible'); });
$('ntTeamName').addEventListener('keydown',e=>{ if(e.key==='Enter') $('ntSaveBtn').click(); });

/* ══════════════════════════════
   TEAM MANAGER MODAL — CRUD
══════════════════════════════ */
let tmCurrentTeamId=null, tmCurrentTeamName='', tmEditingPlayerId=null;

$('closeTeamManager').addEventListener('click',  closeTeamManager);
$('closeTeamManager2').addEventListener('click', closeTeamManager);
$('teamManagerModal').addEventListener('click',e=>{ if(e.target===$('teamManagerModal')) closeTeamManager(); });

$('tmRenameBtn').addEventListener('click', async()=>{
  const val=$('tmRenameInput').value.trim();
  const leagueId=$('tmLeagueSelect')?.value||null;
  if(!val&&leagueId===null){ $('tmRenameInput').focus(); return; }
  const newName=val||tmCurrentTeamName;
  showLoading('Saving...');
  try {
    await db.update('teams',{name:newName,league_id:leagueId},{'id':`eq.${tmCurrentTeamId}`});
    tmCurrentTeamName=newName; $('tmTeamNameDisplay').textContent=newName; $('tmRenameInput').value='';
    toast('✓ Team saved'); loadTeamsView();
  } catch(e){ toast('❌ '+e.message); }
  finally { hideLoading(); }
});
$('tmRenameInput').addEventListener('keydown',e=>{ if(e.key==='Enter') $('tmRenameBtn').click(); });

$('tmDeleteTeamBtn').addEventListener('click', async()=>{
  if(!confirm(`Delete "${tmCurrentTeamName}" and ALL their players?\nThis cannot be undone.`)) return;
  showLoading('Deleting...');
  try {
    const players=await loadPlayersFromDB(tmCurrentTeamId);
    for(const p of players) await deletePlayerFromDB(p.id);
    await deleteTeamFromDB(tmCurrentTeamId);
    closeTeamManager(); loadTeamsView(); toast(`🗑 "${tmCurrentTeamName}" deleted`);
  } catch(e){ toast('❌ '+e.message); }
  finally { hideLoading(); }
});

$('tmAddPlayerBtn').addEventListener('click', tmAddPlayer);
$('tmPlayerName').addEventListener('keydown',e=>{ if(e.key==='Enter') tmAddPlayer(); });

async function tmAddPlayer() {
  const name=$('tmPlayerName').value.trim(); if(!name){ $('tmPlayerName').focus(); return; }
  const num=$('tmPlayerNum').value.trim()||'—', pos=$('tmPlayerPos').value;
  showLoading('Adding player...');
  try {
    await savePlayerToDB(tmCurrentTeamId,{num,name,pos});
    $('tmPlayerName').value=''; $('tmPlayerNum').value='';
    await renderTMPlayerList(); loadTeamsView(); toast(`✓ ${name} added`);
  } catch(e){ toast('❌ '+e.message); }
  finally { hideLoading(); }
}

$('tmSaveEditBtn').addEventListener('click', async()=>{
  if(!tmEditingPlayerId) return;
  const name=$('tmEditName').value.trim(); if(!name){ $('tmEditName').focus(); return; }
  const num=$('tmEditNum').value.trim()||'—', pos=$('tmEditPos').value;
  showLoading('Updating...');
  try {
    await db.update('players',{num,name,pos},{'id':`eq.${tmEditingPlayerId}`});
    cancelTMEdit(); await renderTMPlayerList(); loadTeamsView(); toast('✓ Player updated');
  } catch(e){ toast('❌ '+e.message); }
  finally { hideLoading(); }
});
$('tmCancelEditBtn').addEventListener('click',cancelTMEdit);
function cancelTMEdit(){ tmEditingPlayerId=null; $('tmEditBar').style.display='none'; $('tmEditNum').value=''; $('tmEditName').value=''; renderTMPlayerList(); }

async function openTeamManager(teamId, teamName) {
  tmCurrentTeamId=teamId; tmCurrentTeamName=teamName; tmEditingPlayerId=null;
  $('tmTeamNameDisplay').textContent=teamName; $('tmRenameInput').value=''; $('tmEditBar').style.display='none';
  const tmLeagueSel=$('tmLeagueSelect');
  if(tmLeagueSel){
    tmLeagueSel.innerHTML='<option value="">— No League —</option>';
    try {
      const leagues=await loadLeaguesFromDB();
      const teamData=await db.select('teams',{'id':`eq.${teamId}`,'select':'league_id'});
      const curLeague=teamData[0]?.league_id||'';
      leagues.forEach(l=>{ const o=document.createElement('option'); o.value=l.id; o.textContent=l.category!=='Open'?`${l.name} (${l.category})`:l.name; if(l.id===curLeague) o.selected=true; tmLeagueSel.appendChild(o); });
    } catch(e){}
  }
  $('teamManagerModal').classList.add('visible');
  await renderTMPlayerList();
  setTimeout(()=>$('tmPlayerName').focus(),250);
}

function closeTeamManager(){ $('teamManagerModal').classList.remove('visible'); tmCurrentTeamId=null; tmCurrentTeamName=''; tmEditingPlayerId=null; loadTeamsView(); }

async function renderTMPlayerList() {
  const list=$('tmPlayerList');
  list.innerHTML=`<div class="tm-loading"><div class="db-spinner" style="width:18px;height:18px;border-width:2px"></div></div>`;
  try {
    const players=await loadPlayersFromDB(tmCurrentTeamId);
    $('tmPlayerCount').textContent=`${players.length} player${players.length!==1?'s':''}`;
    if(!players.length){ list.innerHTML=`<div class="tm-empty">No players yet.<br>Add one above!</div>`; return; }
    list.innerHTML='';
    // Sort by number numerically
    players.sort((a,b)=>{
      const na = parseInt(String(a.num).replace(/[^0-9]/g,'')) || 0;
      const nb = parseInt(String(b.num).replace(/[^0-9]/g,'')) || 0;
      return na-nb || a.name.localeCompare(b.name);
    });
    players.forEach(p=>{
      const row=document.createElement('div');
      row.className=`tm-player-row${tmEditingPlayerId===p.id?' tm-editing':''}`;
      row.innerHTML=`
        <span class="tm-pnum">#${p.num}</span><span class="tm-ppos">${p.pos}</span><span class="tm-pname">${p.name}</span>
        <div class="tm-row-actions">
          <button class="tm-edit-btn" data-id="${p.id}" data-num="${p.num}" data-name="${p.name}" data-pos="${p.pos}">✎ Edit</button>
          <button class="tm-del-btn" data-id="${p.id}" data-name="${p.name}">🗑</button>
        </div>
      `;
      row.querySelector('.tm-edit-btn').addEventListener('click',e=>{
        const btn=e.currentTarget; tmEditingPlayerId=btn.dataset.id;
        $('tmEditNum').value=btn.dataset.num!=='—'?btn.dataset.num:'';
        $('tmEditName').value=btn.dataset.name; $('tmEditPos').value=btn.dataset.pos;
        $('tmEditBar').style.display='block'; $('tmEditName').focus(); renderTMPlayerList();
      });
      row.querySelector('.tm-del-btn').addEventListener('click',async e=>{
        const btn=e.currentTarget; const pid=btn.dataset.id; const pname=btn.dataset.name;
        if(!confirm(`Remove ${pname}?`)) return;
        showLoading('Removing...'); try { await deletePlayerFromDB(pid); if(tmEditingPlayerId===pid) cancelTMEdit(); await renderTMPlayerList(); loadTeamsView(); toast(`🗑 ${pname} removed`); } catch(err){ toast('❌ '+err.message); } finally{ hideLoading(); }
      });
      list.appendChild(row);
    });
  } catch(e){ list.innerHTML=`<div class="tm-empty" style="color:var(--red)">❌ ${e.message}</div>`; }
}

/* ══════════════════════════════
   STANDINGS VIEW
══════════════════════════════ */
document.querySelectorAll('[data-sort]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-sort]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); currentGamesSort=btn.dataset.sort; loadStandings(currentGamesSort);
  });
});

async function loadStandings(sortBy='wins') {
  const tbody=$('standingsBody');
  tbody.innerHTML=`<tr><td colspan="10" class="standings-loading"><div class="db-spinner" style="margin:0 auto 8px"></div>Loading...</td></tr>`;
  try {
    const leagueId=$('navLeagueSelect')?.value||null;
    const teams=await loadTeamsFromDB(leagueId);
    const games=await db.select('games',{'status':'eq.finished','select':'*'});
    const teamIds=new Set(teams.map(t=>t.id));
    const standMap={};
    teams.forEach(t=>{standMap[t.id]={id:t.id,name:t.name,gp:0,w:0,l:0,pf:0,pa:0};});
    games.forEach(g=>{
      if(!teamIds.has(g.home_team_id)||!teamIds.has(g.away_team_id)) return;
      const home=standMap[g.home_team_id], away=standMap[g.away_team_id];
      if(home){home.gp++;home.pf+=g.home_score||0;home.pa+=g.away_score||0;if((g.home_score||0)>(g.away_score||0))home.w++;else home.l++;}
      if(away){away.gp++;away.pf+=g.away_score||0;away.pa+=g.home_score||0;if((g.away_score||0)>(g.home_score||0))away.w++;else away.l++;}
    });
    let rows=Object.values(standMap);
    if(sortBy==='wins') rows.sort((a,b)=>b.w-a.w||(b.w/(b.gp||1))-(a.w/(a.gp||1)));
    if(sortBy==='pct')  rows.sort((a,b)=>(b.w/(b.gp||1))-(a.w/(a.gp||1))||b.w-a.w);
    if(sortBy==='pts')  rows.sort((a,b)=>b.pf-a.pf);
    if(!rows.length){tbody.innerHTML=`<tr><td colspan="10" class="standings-loading">No teams${leagueId?' in this league':''} yet.</td></tr>`;return;}
    tbody.innerHTML='';
    rows.forEach((r,i)=>{
      const pct=r.gp?(r.w/r.gp*100).toFixed(1):'0.0', diff=r.pf-r.pa;
      const tr=document.createElement('tr');
      tr.innerHTML=`
        <td><span class="s-rank">${i+1}</span></td>
        <td><span class="s-team-name">${r.name}</span></td>
        <td>${r.gp}</td>
        <td><span class="s-w">${r.w}</span></td>
        <td><span class="s-l">${r.l}</span></td>
        <td><span class="s-pct">${pct}%</span></td>
        <td>${r.pf}</td>
        <td>${r.pa}</td>
        <td><span class="s-diff ${diff>=0?'pos':'neg'}">${diff>=0?'+':''}${diff}</span></td>
        <td class="s-actions">
          <button class="s-games-btn" data-team-id="${r.id}" data-team-name="${r.name}" title="View & edit games">📋</button>
          <button class="s-del-btn" data-team-id="${r.id}" data-team-name="${r.name}" title="Remove team record">🗑</button>
        </td>
      `;
      // View/edit games for this team
      tr.querySelector('.s-games-btn').addEventListener('click', e=>{
        e.stopPropagation();
        const btn=e.currentTarget;
        openTeamGamesManager(btn.dataset.teamId, btn.dataset.teamName, games);
      });
      // Delete all finished games for this team (resets standings record)
      tr.querySelector('.s-del-btn').addEventListener('click', async e=>{
        e.stopPropagation();
        const btn=e.currentTarget;
        if(!confirm(`Remove ALL finished game records for "${btn.dataset.teamName}"?\nThis will delete their games from standings only (team stays registered).`)) return;
        showLoading('Removing records...');
        try {
          // Find all finished games involving this team
          const teamGames = games.filter(g=>
            g.home_team_id===btn.dataset.teamId || g.away_team_id===btn.dataset.teamId
          );
          for(const g of teamGames){
            await db.delete('plays',      {'game_id':`eq.${g.id}`});
            await db.delete('game_stats', {'game_id':`eq.${g.id}`});
            await db.delete('games',      {'id':`eq.${g.id}`});
          }
          toast(`🗑 Records cleared for "${btn.dataset.teamName}"`);
          loadStandings(currentGamesSort);
        } catch(err){ toast('❌ '+err.message); }
        finally { hideLoading(); }
      });
      tbody.appendChild(tr);
    });
  } catch(e){tbody.innerHTML=`<tr><td colspan="10" class="standings-loading" style="color:var(--red)">❌ ${e.message}</td></tr>`;}
}
 
 
// ──────────────────────────────────────────────────────
// 3) ADD these new functions after loadStandings
//    (paste them right after the loadStandings function)
// ──────────────────────────────────────────────────────
 
/* ══════════════════════════════
   EDIT SCORE MODAL
══════════════════════════════ */
let editingGameId = null;
 
function injectEditScoreModal() {
  if(document.getElementById('editScoreModal')) return;
  const html = `
  <div class="modal-overlay" id="editScoreModal">
    <div class="modal edit-score-modal">
      <div class="esm-header">
        <div class="esm-title">✎ EDIT GAME SCORE</div>
        <button class="ss-close-btn" id="closeEditScore">✕</button>
      </div>
      <div class="esm-body">
        <div class="esm-game-label" id="editScoreGameLabel"></div>
        <div class="esm-scores">
          <div class="esm-score-block">
            <label class="esm-team-label home-color" id="editHomeLabel">HOME</label>
            <input type="number" id="editHomeScore" min="0" max="999" class="esm-score-input home-input"/>
          </div>
          <div class="esm-vs">VS</div>
          <div class="esm-score-block">
            <label class="esm-team-label away-color" id="editAwayLabel">AWAY</label>
            <input type="number" id="editAwayScore" min="0" max="999" class="esm-score-input away-input"/>
          </div>
        </div>
        <div class="esm-field">
          <label class="esm-label">STATUS</label>
          <select id="editGameStatus" class="esm-select">
            <option value="finished">✅ Finished</option>
            <option value="ongoing">🔴 Ongoing / Live</option>
          </select>
        </div>
      </div>
      <div class="esm-footer">
        <button class="modal-btn cancel" id="closeEditScore2">Cancel</button>
        <button class="modal-btn confirm" id="confirmEditScore">✓ SAVE CHANGES</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  $('closeEditScore').addEventListener('click',  ()=>$('editScoreModal').classList.remove('visible'));
  $('closeEditScore2').addEventListener('click', ()=>$('editScoreModal').classList.remove('visible'));
  $('editScoreModal').addEventListener('click', e=>{ if(e.target===$('editScoreModal')) $('editScoreModal').classList.remove('visible'); });
  $('confirmEditScore').addEventListener('click', saveEditedScore);
}
 
function openEditScoreModal(gameId, homeName, awayName, homeScore, awayScore, status) {
  injectEditScoreModal();
  editingGameId = gameId;
  $('editHomeLabel').textContent = homeName;
  $('editAwayLabel').textContent = awayName;
  $('editScoreGameLabel').textContent = `${homeName} vs ${awayName}`;
  $('editHomeScore').value = homeScore;
  $('editAwayScore').value = awayScore;
  $('editGameStatus').value = status;
  $('editScoreModal').classList.add('visible');
  setTimeout(()=>$('editHomeScore').focus(), 200);
}
 
async function saveEditedScore() {
  if(!editingGameId) return;
  const hs = parseInt($('editHomeScore').value)||0;
  const as = parseInt($('editAwayScore').value)||0;
  const status = $('editGameStatus').value;
  showLoading('Saving...');
  try {
    const games = await db.select('games', {'id':`eq.${editingGameId}`,'select':'*'});
    if(!games.length) return;
    const g = games[0];
    const winnerId = hs>as ? g.home_team_id : as>hs ? g.away_team_id : null;
    await db.update('games', {
      home_score: hs, away_score: as,
      status, winner_team_id: winnerId,
      updated_at: new Date().toISOString()
    }, {'id':`eq.${editingGameId}`});
    $('editScoreModal').classList.remove('visible');
    toast('✓ Score updated');
    loadGames(currentGamesFilter);
    loadStandings(currentGamesSort);
  } catch(err){ toast('❌ '+err.message); }
  finally { hideLoading(); }
}
 
/* ══════════════════════════════
   TEAM GAMES MANAGER (from Standings)
   Shows all finished games for a team with edit/delete
══════════════════════════════ */
function injectTeamGamesModal() {
  if(document.getElementById('teamGamesModal')) return;
  const html = `
  <div class="modal-overlay" id="teamGamesModal">
    <div class="modal team-games-modal">
      <div class="tgm-header">
        <div class="tgm-title" id="tgmTitle">GAME RECORDS</div>
        <button class="ss-close-btn" id="closeTGM">✕</button>
      </div>
      <div class="tgm-list" id="tgmList"></div>
      <div class="tgm-footer">
        <button class="modal-btn cancel" id="closeTGM2">Close</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  $('closeTGM').addEventListener('click',  ()=>$('teamGamesModal').classList.remove('visible'));
  $('closeTGM2').addEventListener('click', ()=>$('teamGamesModal').classList.remove('visible'));
  $('teamGamesModal').addEventListener('click', e=>{ if(e.target===$('teamGamesModal')) $('teamGamesModal').classList.remove('visible'); });
}
 
function openTeamGamesManager(teamId, teamName, allGames) {
  injectTeamGamesModal();
  $('tgmTitle').textContent = `📋 ${teamName} — GAME RECORDS`;
  const list = $('tgmList');
  const teamGames = allGames.filter(g=> g.home_team_id===teamId || g.away_team_id===teamId);
 
  if(!teamGames.length){
    list.innerHTML = `<div style="padding:30px;text-align:center;color:var(--muted);font-size:.85rem;">No finished games found for this team.</div>`;
  } else {
    list.innerHTML = '';
    teamGames.forEach(g=>{
      const isHome = g.home_team_id===teamId;
      const opponent = isHome ? (g.away_name||'AWAY') : (g.home_name||'HOME');
      const myScore  = isHome ? g.home_score : g.away_score;
      const oppScore = isHome ? g.away_score : g.home_score;
      const won      = myScore > oppScore;
      const d        = new Date(g.created_at);
      const row = document.createElement('div');
      row.className = 'tgm-row';
      row.innerHTML = `
        <div class="tgm-row-info">
          <span class="tgm-result ${won?'tgm-win':'tgm-loss'}">${won?'W':'L'}</span>
          <div class="tgm-row-detail">
            <div class="tgm-matchup">vs ${opponent}</div>
            <div class="tgm-meta">${d.toLocaleDateString()} · Q${g.quarter}</div>
          </div>
          <div class="tgm-score">
            <span class="${won?'tgm-win-score':'tgm-loss-score'}">${myScore}</span>
            <span class="tgm-score-sep">–</span>
            <span>${oppScore}</span>
          </div>
        </div>
        <div class="tgm-row-actions">
          <button class="tgm-edit-btn" title="Edit score">✎ Edit</button>
          <button class="tgm-del-btn" title="Delete game">🗑</button>
        </div>
      `;
      row.querySelector('.tgm-edit-btn').addEventListener('click', ()=>{
        $('teamGamesModal').classList.remove('visible');
        openEditScoreModal(g.id, g.home_name||'HOME', g.away_name||'AWAY', g.home_score, g.away_score, g.status);
      });
      row.querySelector('.tgm-del-btn').addEventListener('click', async()=>{
        if(!confirm(`Delete game: ${g.home_name} vs ${g.away_name}?\nCannot be undone.`)) return;
        showLoading('Deleting...');
        try {
          await db.delete('plays',      {'game_id':`eq.${g.id}`});
          await db.delete('game_stats', {'game_id':`eq.${g.id}`});
          await db.delete('games',      {'id':`eq.${g.id}`});
          toast('🗑 Game deleted');
          $('teamGamesModal').classList.remove('visible');
          loadStandings(currentGamesSort);
          loadGames(currentGamesFilter);
        } catch(err){ toast('❌ '+err.message); }
        finally { hideLoading(); }
      });
      list.appendChild(row);
    });
  }
  $('teamGamesModal').classList.add('visible');
}
/* ══════════════════════════════
   MANAGE MODAL (Scorer)
══════════════════════════════ */
$('manageHomeBtn').addEventListener('click',()=>openManageModal('home'));
$('manageAwayBtn').addEventListener('click',()=>openManageModal('away'));
$('closeManageModal').addEventListener('click',closeManageModal);
$('manageConfirmBtn').addEventListener('click',closeManageModal);
$('manageModal').addEventListener('click',e=>{if(e.target===$('manageModal'))closeManageModal();});

function openManageModal(team){
  manageTeam=team; $('manageModalTeamIcon').textContent=team==='home'?'🏠':'✈️';
  $('manageModalTitle').textContent=`MANAGE ${teamName(team).toUpperCase()} TEAM`;
  $('managePlayerList').className=`manage-player-list ${team}-team`;
  renderManageList(); $('manageModal').classList.add('visible');
  setTimeout(()=>$('managePlayerName').focus(),200);
}
function closeManageModal(){ $('manageModal').classList.remove('visible'); renderRoster('home'); renderRoster('away'); renderStats(); }

$('manageAddPlayer').addEventListener('click',addPlayerFromModal);
$('managePlayerName').addEventListener('keydown',e=>{if(e.key==='Enter')addPlayerFromModal();});

async function addPlayerFromModal(){
  const name=$('managePlayerName').value.trim(); if(!name){$('managePlayerName').focus();return;}
  if(!state[manageTeam].dbId){toast('⚠ Select a team first!');return;}
  const num=$('managePlayerNum').value.trim()||'—', pos=$('managePlayerPos').value;
  const onCourtCount=state[manageTeam].players.filter(p=>p.onCourt).length;
  showLoading('Adding player...');
  try {
    const dbId=await savePlayerToDB(state[manageTeam].dbId,{num,name,pos});
  state[manageTeam].players.push({id:playerIdCounter++,dbId,dbStatId:null,num,name,pos,onCourt:onCourtCount<5,isStarter:false,pts:0,fgm:0,fga:0,tpm:0,tpa:0,ftm:0,fta:0,or:0,dr:0,ast:0,stl:0,blk:0,to:0,fls:0,tf:0,uf:0,pto:0,fbp:0,twocp:0,fbto:0,secs:0});
    renderManageList(); renderRoster(manageTeam); renderStats(); toast(`✓ ${name} saved`);
  } catch(e){toast('❌ '+e.message);}
  finally{hideLoading();}
}

function renderManageList(){
  const list=$('managePlayerList'), players=state[manageTeam].players;
  const onCourtN=players.filter(p=>p.onCourt).length;
  $('manageOnCourtCount').textContent=onCourtN;
  if(!players.length){list.innerHTML=`<div class="empty-list-msg">No players added yet.</div>`;return;}
  list.innerHTML='';
  players.forEach(p=>{
    const maxReached=!p.onCourt&&onCourtN>=5;
    const row=document.createElement('div'); row.className='manage-player-row';
    row.innerHTML=`<span class="mpn">#${p.num}</span><span class="mpp">${p.pos}</span><span class="mpname">${p.name}</span>
      <button class="starter-toggle ${p.onCourt?'is-starter':''}" data-id="${p.id}" ${maxReached?'style="opacity:.4;cursor:not-allowed"':''}>${p.onCourt?'⭐ STARTER':'➕ ADD TO 5'}</button>
      <button class="remove-manage-btn" data-id="${p.id}">🗑</button>`;
    row.querySelector('.starter-toggle').addEventListener('click',e=>{if(maxReached){toast('Max 5!');return;}toggleStarter(manageTeam,parseInt(e.currentTarget.dataset.id));});
    row.querySelector('.remove-manage-btn').addEventListener('click',async e=>{
      const id=parseInt(e.currentTarget.dataset.id); const pl=state[manageTeam].players.find(x=>x.id===id);
      if(pl?.dbId){showLoading('Removing...');try{await deletePlayerFromDB(pl.dbId);}catch(err){toast('❌ '+err.message);}finally{hideLoading();}}
      removePlayerById(manageTeam,id);
    });
    list.appendChild(row);
  });
}

function toggleStarter(team,id){
  const p=state[team].players.find(x=>x.id===id); if(!p) return;
  if(!p.onCourt&&state[team].players.filter(x=>x.onCourt).length>=5){toast('Max 5!');return;}
  p.onCourt=!p.onCourt;
  if(state.selectedPlayer?.team===team&&state.selectedPlayer?.id===id){state.selectedPlayer=null;updateSelectedLabel();}
  renderManageList(); renderRoster(team); updateCourtCounts(team);
}

function removePlayerById(team,id){
  if(state.selectedPlayer?.team===team&&state.selectedPlayer?.id===id){state.selectedPlayer=null;updateSelectedLabel();}
  state[team].players=state[team].players.filter(p=>p.id!==id);
  renderManageList(); renderRoster(team); renderStats();
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

function openSubModal(team){
  subTeam=team; subOutPlayers=[]; subInPlayers=[];
  $('subModalIcon').textContent=team==='home'?'🏠':'✈️';
  $('subModalTitle').textContent=`SUBSTITUTION — ${teamName(team).toUpperCase()}`;
  updateSubSummary(); renderSubLists(); updateSubConfirmBtn();
  $('subModal').classList.add('visible');
}
function closeSubModal(){$('subModal').classList.remove('visible');subOutPlayers=[];subInPlayers=[];}

function updateSubSummary(){
  const outNames=subOutPlayers.map(id=>{ const p=state[subTeam].players.find(x=>x.id===id); return p?`#${p.num} ${p.name}`:'?'; });
  const inNames=subInPlayers.map(id=>{ const p=state[subTeam].players.find(x=>x.id===id); return p?`#${p.num} ${p.name}`:'?'; });
  $('subOutName').textContent=outNames.length?outNames.join(', '):'—';
  $('subInName').textContent=inNames.length?inNames.join(', '):'—';
}

function renderSubLists(){
  const outList=$('subOutList'), inList=$('subInList');
  const starters=state[subTeam].players.filter(p=>p.onCourt).sort((a,b)=>(parseInt(a.num)||0)-(parseInt(b.num)||0));
const bench=state[subTeam].players.filter(p=>!p.onCourt).sort((a,b)=>(parseInt(a.num)||0)-(parseInt(b.num)||0));
  const tClass=subTeam==='home'?'home-tag':'away-tag';

  outList.innerHTML='';
  if(!starters.length) outList.innerHTML=`<div class="empty-list-msg">No players on court</div>`;
  else starters.forEach(p=>{
    const isChecked=subOutPlayers.includes(p.id);
    const row=document.createElement('div'); row.className=`sub-player-row${isChecked?' selected-out':''}`;
    row.innerHTML=`<input type="checkbox" ${isChecked?'checked':''} style="accent-color:var(--red);width:15px;height:15px;cursor:pointer;flex-shrink:0;margin-right:4px"><span class="spnum">#${p.num}</span><span class="sppos ${tClass}">${p.pos}</span><span class="spname">${p.name}</span>`;
    row.addEventListener('click',()=>{
      const idx=subOutPlayers.indexOf(p.id);
      if(idx>=0) subOutPlayers.splice(idx,1); else subOutPlayers.push(p.id);
      renderSubLists(); updateSubSummary(); updateSubConfirmBtn();
    });
    outList.appendChild(row);
  });

  inList.innerHTML='';
  if(!bench.length) inList.innerHTML=`<div class="empty-list-msg">No bench players</div>`;
  else bench.forEach(p=>{
    const isChecked=subInPlayers.includes(p.id);
    const row=document.createElement('div'); row.className=`sub-player-row${isChecked?' selected-in':''}`;
    row.innerHTML=`<input type="checkbox" ${isChecked?'checked':''} style="accent-color:var(--green);width:15px;height:15px;cursor:pointer;flex-shrink:0;margin-right:4px"><span class="spnum">#${p.num}</span><span class="sppos ${tClass}">${p.pos}</span><span class="spname">${p.name}</span>`;
    row.addEventListener('click',()=>{
      const idx=subInPlayers.indexOf(p.id);
      if(idx>=0) subInPlayers.splice(idx,1); else subInPlayers.push(p.id);
      renderSubLists(); updateSubSummary(); updateSubConfirmBtn();
    });
    inList.appendChild(row);
  });
}

function updateSubConfirmBtn(){
  const btn=$('confirmSubBtn');
  const valid=subOutPlayers.length>0&&subInPlayers.length>0&&subOutPlayers.length===subInPlayers.length;
  btn.disabled=!valid;
  btn.title=valid?'':`Select equal numbers OUT and IN (${subOutPlayers.length} out, ${subInPlayers.length} in)`;
}

function confirmSub(){
  if(subOutPlayers.length===0||subInPlayers.length===0||subOutPlayers.length!==subInPlayers.length) return;
  const outNames=[], inNames=[];
  subOutPlayers.forEach(id=>{ const p=state[subTeam].players.find(x=>x.id===id); if(p){p.onCourt=false;outNames.push(p.name);} });
  subInPlayers.forEach(id=>{ const p=state[subTeam].players.find(x=>x.id===id); if(p){p.onCourt=true;inNames.push(p.name);} });
  subOutPlayers.forEach(id=>{ if(state.selectedPlayer?.team===subTeam&&state.selectedPlayer?.id===id){state.selectedPlayer=null;updateSelectedLabel();} });
  addPlay(subTeam,`SUB: ${inNames.join(', ')} IN ↔ ${outNames.join(', ')} OUT`,subTeam,0);
  toast(`🔄 ${inNames.length} sub${inNames.length>1?'s':''} confirmed`);
  closeSubModal(); renderRoster('home'); renderRoster('away'); scheduleSaveGame();
}

/* ══════════════════════════════
   RENDER ROSTER
══════════════════════════════ */
function renderRoster(team){
  const players=state[team].players;
  const starters=players.filter(p=>p.onCourt), bench=players.filter(p=>!p.onCourt);
  $(`${team}Count`).textContent=players.length; updateCourtCounts(team);
  const startEl=$(`${team}Starting`); startEl.innerHTML='';
  if(!starters.length) startEl.innerHTML=`<div class="empty-list-msg">No starters set</div>`;
  else starters.forEach(p=>startEl.appendChild(buildPlayerRow(p,team)));
  const benchEl=$(`${team}Bench`); benchEl.innerHTML='';
  if(!bench.length) benchEl.innerHTML=`<div class="empty-list-msg" style="padding:10px 12px">No bench players</div>`;
  else bench.forEach(p=>benchEl.appendChild(buildPlayerRow(p,team)));
}

function buildPlayerRow(p,team){
  const div=document.createElement('div');
  div.className=`player-item${isSelected(team,p.id)?' selected':''}${p.onCourt?' on-court':''}`;
  div.innerHTML=`<span class="player-num">#${p.num}</span><span class="player-pos">${p.pos}</span><span class="player-name">${p.name}</span><span class="player-pts">${p.pts}</span>`;
  div.addEventListener('click',()=>selectPlayer(team,p.id));
  return div;
}

function updateCourtCounts(team){
  $(`${team}OnCourtCount`).textContent=`${state[team].players.filter(p=>p.onCourt).length}/5`;
  $(`${team}BenchCount`).textContent=state[team].players.filter(p=>!p.onCourt).length;
}

function isSelected(team,id){return state.selectedPlayer?.team===team&&state.selectedPlayer?.id===id;}
function selectPlayer(team,id){state.selectedPlayer=isSelected(team,id)?null:{team,id};renderRoster('home');renderRoster('away');updateSelectedLabel();}
function updateSelectedLabel(){
  if(!state.selectedPlayer){dom.selectedLabel.textContent='select a player';return;}
  const p=getSelectedPlayer();
  dom.selectedLabel.textContent=`${p.onCourt?'⭐':'🪑'} ${p.name} (${teamName(state.selectedPlayer.team)})`;
}
function getSelectedPlayer(){if(!state.selectedPlayer)return null;return state[state.selectedPlayer.team].players.find(p=>p.id===state.selectedPlayer.id);}

/* ══════════════════════════════
   SCORING EVENTS
══════════════════════════════ */
function recordScoringEvent(team,pts,playerNum){
  state.scoringEvents.push({team,pts,playerNum:playerNum!=null?String(playerNum):'',quarter:state.quarter});
}

function updateBiggestLead() {
  const diff = state.home.score - state.away.score;
  if (diff > 0) state._homeLead = Math.max(state._homeLead, diff);
  if (diff < 0) state._awayLead = Math.max(state._awayLead, Math.abs(diff));
}

/* ══════════════════════════════
   STAT GROUP BUTTONS
══════════════════════════════ */
document.querySelectorAll('.sg-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const team=btn.dataset.team, action=btn.dataset.action;
    const pts=parseInt(action.slice(-1)), type=action.slice(0,-1);
    const snap=captureSnapshot();
    const statKey=type==='2cp'?'twocp':type;
    state[team][statKey]=(state[team][statKey]||0)+pts;
    addPlay(team,`${teamName(team)} — ${type.toUpperCase()} recorded (+${pts})`,'special',0);
    updateSpecialStats(); state.history.push(snap); scheduleSaveGame();
    toast(`${type.toUpperCase()} +${pts} recorded for ${teamName(team)}`);
  });
});

/* ══════════════════════════════
   ACTION BUTTONS
══════════════════════════════ */
document.querySelectorAll('.act-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const action=btn.dataset.action; if(!action) return;
    if(!state.selectedPlayer){toast('⚠ Select a player first!');return;}
    const p=getSelectedPlayer(), team=state.selectedPlayer.team;
    const snap=captureSnapshot();
    switch(action){
      case '2pm':      p.fgm++;p.fga++;p.pts+=2;state[team].score+=2;bumpScore(team);recordScoringEvent(team,2,p.num);addPlay(team,`${p.name} — 2PT Made`,team,2,p.dbId);break;
      case '2pm_miss': p.fga++;addPlay(team,`${p.name} — 2PT Miss`,team,0,p.dbId);break;
      case '3pm':      p.tpm++;p.tpa++;p.fgm++;p.fga++;p.pts+=3;state[team].score+=3;bumpScore(team);recordScoringEvent(team,3,p.num);addPlay(team,`${p.name} — 3PT Made`,team,3,p.dbId);break;
      case '3pm_miss': p.tpa++;p.fga++;addPlay(team,`${p.name} — 3PT Miss`,team,0,p.dbId);break;
      case 'ftm':      p.ftm++;p.fta++;p.pts+=1;state[team].score+=1;bumpScore(team);recordScoringEvent(team,1,p.num);addPlay(team,`${p.name} — Free Throw`,team,1,p.dbId);break;
      case 'ftm_miss': p.fta++;addPlay(team,`${p.name} — FT Miss`,team,0,p.dbId);break;
      case 'reb_off':  p.or++;addPlay(team,`${p.name} — Off. Rebound`,team,0,p.dbId);break;
      case 'reb_def':  p.dr++;addPlay(team,`${p.name} — Def. Rebound`,team,0,p.dbId);break;
      case 'ast':      p.ast++;addPlay(team,`${p.name} — Assist`,team,0,p.dbId);break;
      case 'stl':      p.stl++;addPlay(team,`${p.name} — Steal`,team,0,p.dbId);break;
      case 'blk':      p.blk++;addPlay(team,`${p.name} — Block`,team,0,p.dbId);break;
      case 'to':       p.to++;addPlay(team,`${p.name} — Turnover`,team,0,p.dbId);break;
      case 'foul':     p.fls++;state[team].fouls++;updateMeta();addPlay(team,`${p.name} — Foul (F)`,team,0,p.dbId);break;
      case 'tf':       p.tf=(p.tf||0)+1;p.fls++;state[team].fouls++;updateMeta();addPlay(team,`${p.name} — Technical Foul (TF)`,team,0,p.dbId);break;
      case 'uf':       p.uf=(p.uf||0)+1;p.fls++;state[team].fouls++;updateMeta();addPlay(team,`${p.name} — Unsportsmanlike Foul (UF)`,team,0,p.dbId);break;
      default: return;
    }
    updateScore(team); updateBiggestLead(); updateMeta(); renderRoster('home'); renderRoster('away'); renderStats();
    state.history.push(snap); scheduleSaveGame();
  });
});

function updateSpecialStats(){
  dom.homePTO.textContent=state.home.pto||0; dom.awayPTO.textContent=state.away.pto||0;
  dom.homeFBP.textContent=state.home.fbp||0; dom.awayFBP.textContent=state.away.fbp||0;
  dom.home2CP.textContent=state.home.twocp||0; dom.away2CP.textContent=state.away.twocp||0;
  dom.homeFBTO.textContent=state.home.fbto||0; dom.awayFBTO.textContent=state.away.fbto||0;
  dom.homePTOCount.textContent=state.home.pto||0; dom.awayPTOCount.textContent=state.away.pto||0;
  dom.homeFBPCount.textContent=state.home.fbp||0; dom.awayFBPCount.textContent=state.away.fbp||0;
  dom.home2CPCount.textContent=state.home.twocp||0; dom.away2CPCount.textContent=state.away.twocp||0;
  dom.homeFBTOCount.textContent=state.home.fbto||0; dom.awayFBTOCount.textContent=state.away.fbto||0;
}

// ── TIMEOUT COUNTDOWN ──
let timeoutCountdownInterval = null;

function startTimeoutCountdown(team) {
  let remaining = 30;
  const clockEl = $('timeoutModalClock');
  const teamEl  = $('timeoutModalTeam');

  teamEl.textContent = `${teamName(team).toUpperCase()} TIMEOUT`;
  clockEl.textContent = '0:30';

  // Stop game clock during timeout
  stopClock();

  $('timeoutModal').classList.add('visible');

  // Clear any existing countdown
  if (timeoutCountdownInterval) clearInterval(timeoutCountdownInterval);

  timeoutCountdownInterval = setInterval(() => {
    remaining--;
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    clockEl.textContent = `${m}:${s.toString().padStart(2,'0')}`;

    // Color warning at 10 seconds
    if (remaining <= 10) {
      clockEl.style.color = 'var(--red)';
      clockEl.style.textShadow = '0 0 30px rgba(239,83,80,.6)';
    } else {
      clockEl.style.color = 'var(--text)';
      clockEl.style.textShadow = '0 0 30px rgba(245,197,24,.4)';
    }

    if (remaining <= 0) {
      clearInterval(timeoutCountdownInterval);
      timeoutCountdownInterval = null;
      $('timeoutModal').classList.remove('visible');
      toast(`⏱ Timeout over — ${teamName(team)} resume play!`);
    }
  }, 1000);
}

function resumeFromTimeout() {
  if (timeoutCountdownInterval) {
    clearInterval(timeoutCountdownInterval);
    timeoutCountdownInterval = null;
  }
  $('timeoutModal').classList.remove('visible');
  $('timeoutModalClock').style.color = 'var(--text)';
  $('timeoutModalClock').style.textShadow = '0 0 30px rgba(245,197,24,.4)';
  toast('▶ Game resumed!');
}

$('btnResumeFromTimeout').addEventListener('click', resumeFromTimeout);

document.querySelectorAll('.timeout-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const team=btn.dataset.team;
    if(state[team].timeouts<=0){toast('No timeouts left!');return;}
    const snap=captureSnapshot();
    state[team].timeouts--;
    state[team].timeoutsUsed++;
    // Track which half the timeout was used in
    const isFirstHalf = state.quarter==='1' || state.quarter==='2';
    if(isFirstHalf) state[team].timeoutsUsed1H++;
    else            state[team].timeoutsUsed2H++;
    updateMeta();
    addPlay(team,`${teamName(team)} called timeout (Q${state.quarter})`,team,0);
    state.history.push(snap);
    scheduleSaveGame();
    // Start the 30 second timeout countdown
    startTimeoutCountdown(team);
  });
});
function updateScore(team){dom[`${team}Score`].textContent=state[team].score;}
function bumpScore(team){const el=dom[`${team}Score`];el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump');setTimeout(()=>el.classList.remove('bump'),200);}
function updateMeta(){dom.homeTO.textContent=state.home.timeouts;dom.awayTO.textContent=state.away.timeouts;dom.homeFouls.textContent=state.home.fouls;dom.awayFouls.textContent=state.away.fouls;}

function addPlay(team,text,dotClass,pts,playerId=null){
  const play={team,text,dotClass,pts,playerId,quarter:state.quarter,scoreH:state.home.score,scoreA:state.away.score,time:formatTime(clock.remaining)};
  state.plays.unshift(play); renderPBP(); savePlayToDB(play);
}

function renderPBP(){
  dom.pbpCount.textContent=`${state.plays.length} play${state.plays.length!==1?'s':''}`;
  if(!state.plays.length){dom.pbpList.innerHTML=`<div class="pbp-empty">No plays yet. Start recording!</div>`;return;}
  dom.pbpList.innerHTML=state.plays.map(p=>`<div class="pbp-entry"><div class="pbp-dot ${p.dotClass}"></div><span class="pbp-text">${p.text}</span><span class="pbp-qtr">${p.time}</span><span class="pbp-score">${p.scoreH}–${p.scoreA}</span><span class="pbp-qtr">Q${p.quarter}</span></div>`).join('');
}

document.querySelectorAll('.stab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.stab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); state.statsView=btn.dataset.view; renderStats();
  });
});

function renderStats(){
  let players=[];
  if(state.statsView!=='away') state.home.players.forEach(p=>players.push({...p,team:'home'}));
  if(state.statsView!=='home') state.away.players.forEach(p=>players.push({...p,team:'away'}));
  if(!players.length){dom.statsBody.innerHTML=`<tr><td colspan="20" style="text-align:center;color:var(--muted);padding:18px;font-size:.8rem">No players</td></tr>`;return;}
  dom.statsBody.innerHTML=players.map(p=>`<tr>
    <td>#${p.num} ${p.name}${state.statsView==='both'?`<span class="team-tag ${p.team}-tag">${p.team.toUpperCase()}</span>`:''}</td>
    <td>${p.onCourt?'<span class="status-on">⭐</span>':'<span class="status-off">🪑</span>'}</td>
    <td class="playtime-cell">${formatPlaytime(p.secs||0)}</td>
    <td><strong>${p.pts}</strong></td><td>${p.fgm}</td><td>${p.fga}</td><td>${p.tpm}</td><td>${p.tpa}</td>
    <td>${p.ftm}</td><td>${p.fta}</td><td>${p.or}</td><td>${p.dr}</td><td>${p.or+p.dr}</td>
   <td>${p.ast}</td><td>${p.stl}</td><td>${p.blk}</td><td>${p.to}</td><td>${p.fls}</td><td>${p.tf||0}</td><td>${p.uf||0}</td>
  </tr>`).join('');
}
/* ══════════════════════════════
   UNDO
══════════════════════════════ */
$('btnUndo').addEventListener('click',()=>{
  if(!state.history.length){toast('Nothing to undo');return;}
  restoreSnapshot(state.history.pop()); toast('Last action undone'); scheduleSaveGame();
});

function captureSnapshot(){
  return JSON.parse(JSON.stringify({home:state.home,away:state.away,plays:state.plays,scoringEvents:state.scoringEvents,selectedPlayer:state.selectedPlayer,quarterScores:state.quarterScores}));
}
function restoreSnapshot(snap){
  Object.assign(state,{home:snap.home,away:snap.away,plays:snap.plays,scoringEvents:snap.scoringEvents||[],selectedPlayer:snap.selectedPlayer,quarterScores:snap.quarterScores});
  updateScore('home');updateScore('away');updateMeta();updateSpecialStats();
  renderRoster('home');renderRoster('away');renderStats();renderPBP();updateSelectedLabel();
  updateTeamNameDisplay('home');updateTeamNameDisplay('away');
}

/* ══════════════════════════════
   NEW GAME
══════════════════════════════ */
$('btnNewGame').addEventListener('click',()=>$('newGameModal').classList.add('visible'));
$('cancelNewGame').addEventListener('click',()=>$('newGameModal').classList.remove('visible'));
$('confirmNewGame').addEventListener('click',async()=>{ $('newGameModal').classList.remove('visible'); await resetGame(); });
$('newGameModal').addEventListener('click',e=>{ if(e.target===$('newGameModal')) $('newGameModal').classList.remove('visible'); });

async function resetGame(){
  if(state.currentGameId){
    const winner=state.home.score>state.away.score?state.home.dbId:state.away.score>state.home.score?state.away.dbId:null;
    try{await db.update('games',{status:'finished',winner_team_id:winner,updated_at:new Date().toISOString()},{'id':`eq.${state.currentGameId}`});}catch(e){}
  }
  ['home','away'].forEach(team=>{
    state[team].score=0;state[team].fouls=0;state[team].timeouts=2;state[team].timeoutsHalf=2;
  state[team].timeoutsUsed=0;
    state[team].timeoutsUsed1H=0;
    state[team].timeoutsUsed2H=0;
   state[team].pto=0;state[team].fbp=0;state[team].twocp=0;state[team].fbto=0;
   state[team].quarterFouls={};
    state[team].players.forEach(p=>{p.pts=0;p.fgm=0;p.fga=0;p.tpm=0;p.tpa=0;p.ftm=0;p.fta=0;p.or=0;p.dr=0;p.ast=0;p.stl=0;p.blk=0;p.to=0;p.fls=0;p.tf=0;p.uf=0;p.pto=0;p.fbp=0;p.twocp=0;p.fbto=0;p.secs=0;p.dbStatId=null;});
  });
  state.selectedPlayer=null;state.history=[];state.plays=[];state.scoringEvents=[];
  state._homeLead=0; state._awayLead=0;
  state.quarter='1';state.statsView='home';
  state.quarterScores={'1':null,'2':null,'3':null,'4':null,'OT':null};
  state.currentGameId=null;viewerMode=false;
  document.querySelectorAll('.quarter-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector('[data-q="1"]').classList.add('active');
  document.querySelectorAll('.stab').forEach(b=>b.classList.remove('active'));
  document.querySelector('[data-view="home"]').classList.add('active');
  resetClock();updateScore('home');updateScore('away');updateMeta();updateSpecialStats();
  renderRoster('home');renderRoster('away');renderStats();renderPBP();updateSelectedLabel();
  updateGameButtons();
  toast('Game reset! Select teams and press ▶ START GAME 🏀');
}

/* ══════════════════════════════
   EXPORT
══════════════════════════════ */
$('btnExportCSV').addEventListener('click',()=>{
  const allP=[...state.home.players.map(p=>({...p,team:teamName('home')})),...state.away.players.map(p=>({...p,team:teamName('away')}))];
  const headers=['Team','#','Player','POS','STATUS','MIN','PTS','FGM','FGA','3PM','3PA','FTM','FTA','OR','DR','REB','AST','STL','BLK','TO','FLS'];
  const rows=allP.map(p=>[p.team,p.num,p.name,p.pos,p.onCourt?'STARTER':'BENCH',formatPlaytime(p.secs||0),p.pts,p.fgm,p.fga,p.tpm,p.tpa,p.ftm,p.fta,p.or,p.dr,p.or+p.dr,p.ast,p.stl,p.blk,p.to,p.fls]);
  toast('CSV exported');
});

$('btnExportPDF').addEventListener('click',()=>{
  function pct(m,a){ return a>0?((m/a)*100).toFixed(1)+'%':'0.0%'; }
  function teamRows(players, teamLabel) {
    const starters = players.filter(p=>p.onCourt);
    const bench    = players.filter(p=>!p.onCourt);
    const allSorted = [...starters, ...bench];
    let rows = '';
    let hasShownBenchHeader = false;
    allSorted.forEach(p => {
      if (!p.onCourt && !hasShownBenchHeader) {
        hasShownBenchHeader = true;
        rows += `<tr class="bench-divider"><td colspan="17">BENCH</td></tr>`;
      }
     rows += `<tr>
        <td class="name-col">${p.name}</td>
        <td class="num-col">${p.num!=='—'?p.num:''}</td>
        <td>${formatPlaytime(p.secs||0)}</td>
        <td class="pts">${p.pts}</td>
        <td>${p.fgm}/${p.fga}</td>
        <td class="pct">${pct(p.fgm,p.fga)}</td>
        <td>${p.tpm}/${p.tpa}</td>
        <td class="pct">${pct(p.tpm,p.tpa)}</td>
        <td>${p.ftm}/${p.fta}</td>
        <td class="pct">${pct(p.ftm,p.fta)}</td>
        <td>${p.or}</td><td>${p.dr}</td>
        <td>${p.or+p.dr}</td>
        <td>${p.ast}</td><td>${p.stl}</td><td>${p.blk}</td>
        <td>${p.to}</td><td>${p.fls}</td>
      </tr>`;
    });
    // Totals row
    const tot = allSorted.reduce((s,p)=>({
      pts:s.pts+p.pts, fgm:s.fgm+p.fgm, fga:s.fga+p.fga,
      tpm:s.tpm+p.tpm, tpa:s.tpa+p.tpa, ftm:s.ftm+p.ftm, fta:s.fta+p.fta,
      or:s.or+p.or, dr:s.dr+p.dr, ast:s.ast+p.ast, stl:s.stl+p.stl,
      blk:s.blk+p.blk, to:s.to+p.to, fls:s.fls+p.fls
    }), {pts:0,fgm:0,fga:0,tpm:0,tpa:0,ftm:0,fta:0,or:0,dr:0,ast:0,stl:0,blk:0,to:0,fls:0});
    rows += `<tr class="totals-row">
      <td class="name-col"><strong>TOTALS</strong></td><td></td><td></td>
      <td class="pts"><strong>${tot.pts}</strong></td>
      <td><strong>${tot.fgm}/${tot.fga}</strong></td>
      <td class="pct"><strong>${pct(tot.fgm,tot.fga)}</strong></td>
      <td><strong>${tot.tpm}/${tot.tpa}</strong></td>
      <td class="pct"><strong>${pct(tot.tpm,tot.tpa)}</strong></td>
      <td><strong>${tot.ftm}/${tot.fta}</strong></td>
      <td class="pct"><strong>${pct(tot.ftm,tot.fta)}</strong></td>
      <td><strong>${tot.or}</strong></td><td><strong>${tot.dr}</strong></td>
      <td><strong>${tot.or+tot.dr}</strong></td>
      <td><strong>${tot.ast}</strong></td><td><strong>${tot.stl}</strong></td>
      <td><strong>${tot.blk}</strong></td><td><strong>${tot.to}</strong></td>
      <td><strong>${tot.fls}</strong></td>
    </tr>`;
    return rows;
  }
  const hn=teamName('home'), an=teamName('away');
  const hs=state.home.score, as_=state.away.score;
  const winner = hs>as_?`<div class="winner">${hn} WIN</div>`:as_>hs?`<div class="winner">${an} WIN</div>`:`<div class="winner">TIE</div>`;
  const dateStr = new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  const win=window.open('','_blank','width=1200,height=900');
if(!win){ toast('⚠ Pop-up blocked! Allow pop-ups for this site.'); return; }
win.document.open();
win.document.write(`<!DOCTYPE html><html><head><title>Box Score</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Helvetica Neue',Arial,sans-serif;background:#fff;color:#111;padding:24px 28px;font-size:11px;}
    .report-header{text-align:center;border-bottom:2px solid #e85d24;padding-bottom:12px;margin-bottom:16px;}
    .report-title{font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#888;margin-bottom:6px;}
    .report-date{font-size:9px;color:#888;margin-bottom:10px;}
    .scoreline{display:flex;justify-content:center;align-items:center;gap:32px;margin:8px 0;}
    .team-name{font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#333;}
    .score{font-size:42px;font-weight:900;color:#111;}
    .score.winner-score{color:#e85d24;}
    .vs{font-size:12px;color:#aaa;font-weight:400;}
    .winner{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#e85d24;margin-top:4px;}
    .team-section{margin-bottom:20px;}
    .team-header{background:#e85d24;color:#fff;padding:6px 10px;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:0;}
    .team-header span{float:right;font-size:14px;}
    table{width:100%;border-collapse:collapse;margin:0;}
    thead tr{background:#f5f5f5;border-bottom:1px solid #ddd;}
    thead th{padding:5px 6px;text-align:center;font-size:8.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#555;}
    thead th.name-col{text-align:left;width:120px;}
    thead th.num-col{width:22px;}
    td{padding:4px 6px;text-align:center;border-bottom:1px solid #f0f0f0;font-size:10px;}
    td.name-col{text-align:left;font-weight:600;}
    td.num-col{color:#e85d24;font-weight:700;}
    td.pts{font-weight:700;font-size:11px;}
    td.pct{color:#888;font-size:9px;}
    tr:hover{background:#fafafa;}
    tr.bench-divider td{background:#f9f9f9;font-size:8px;font-weight:700;letter-spacing:2px;color:#aaa;text-align:left;padding:3px 6px;border-top:1px solid #eee;}
    tr.totals-row{background:#fff3ee;border-top:2px solid #e85d24;}
    tr.totals-row td{padding:5px 6px;font-size:10px;}
    .footer{text-align:center;margin-top:16px;font-size:8px;color:#bbb;letter-spacing:1px;}
    @media print{@page{size:A4 portrait;margin:8mm;} body{padding:0;}}
  </style>
  </head><body>
  <div class="report-header">
    <div class="report-title">Basketball Game Report</div>
    <div class="report-date">${dateStr} • Period: Q${state.quarter}</div>
    <div class="scoreline">
      <div style="text-align:right"><div class="team-name">${hn}</div><div class="score ${hs>=as_?'winner-score':''}">${hs}</div></div>
      <div class="vs">VS</div>
      <div style="text-align:left"><div class="team-name">${an}</div><div class="score ${as_>hs?'winner-score':''}">${as_}</div></div>
    </div>
    ${winner}
  </div>
  <div class="team-section">
    <div class="team-header">${hn} — ${hs} PTS</div>
    <table><thead><tr>
     <th class="name-col">PLAYER</th><th class="num-col">#</th><th>MIN</th>
      <th>PTS</th><th>FG</th><th>FG%</th><th>3PT</th><th>3P%</th><th>FT</th><th>FT%</th>
      <th>OR</th><th>DR</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>FLS</th>
    </tr></thead><tbody>${teamRows(state.home.players,hn)}</tbody></table>
  </div>
  <div class="team-section">
    <div class="team-header">${an} — ${as_} PTS</div>
    <table><thead><tr>
    <th class="name-col">PLAYER</th><th class="num-col">#</th><th>MIN</th>
      <th>PTS</th><th>FG</th><th>FG%</th><th>3PT</th><th>3P%</th><th>FT</th><th>FT%</th>
      <th>OR</th><th>DR</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>FLS</th>
    </tr></thead><tbody>${teamRows(state.away.players,an)}</tbody></table>
  </div>
  <div class="footer">Generated by Basketball Scorer</div>
  </body></html>`);
  win.document.close();
win.focus();
setTimeout(()=>{ win.print(); }, 800);
});

/* ══════════════════════════════
   FIBA SCORESHEET
══════════════════════════════ */
$('btnScoresheet').addEventListener('click',()=>{ buildScoresheet(); $('scoresheetModal').classList.add('visible'); });
$('closeScoresheetModal').addEventListener('click',()=>$('scoresheetModal').classList.remove('visible'));
$('closeScoresheetModal2').addEventListener('click',()=>$('scoresheetModal').classList.remove('visible'));
$('scoresheetModal').addEventListener('click',e=>{ if(e.target===$('scoresheetModal')) $('scoresheetModal').classList.remove('visible'); });
$('btnPrintScoresheet').addEventListener('click', () => {
  const ROWS=40, GROUPS=4, TOTAL=ROWS*GROUPS;
  const scoredHome={}, scoredAway={};
  let ht=0, at=0;
  for(const ev of state.scoringEvents){
    const pts=Math.max(1,ev.pts||1);
    if(ev.team==='home'){ for(let i=0;i<pts;i++){ ht++; if(ht<=TOTAL) scoredHome[ht]={playerNum:ev.playerNum,isFinal:(i===pts-1)}; } }
    else { for(let i=0;i<pts;i++){ at++; if(at<=TOTAL) scoredAway[at]={playerNum:ev.playerNum,isFinal:(i===pts-1)}; } }
  }

  // Build quarter-end maps for print
const homeQEnd={}, awayQEnd={};
let hR=0, aR=0;
for(const q of ['1','2','3','4','OT']){
  let hp=0, ap=0;
  state.scoringEvents.filter(e=>e.team==='home'&&e.quarter===q).forEach(e=>hp+=Math.max(1,e.pts||1));
  state.scoringEvents.filter(e=>e.team==='away'&&e.quarter===q).forEach(e=>ap+=Math.max(1,e.pts||1));
  if(hp>0){ hR+=hp; if(hR<=TOTAL) homeQEnd[hR]=q; }
  if(ap>0){ aR+=ap; if(aR<=TOTAL) awayQEnd[aR]=q; }
}

let rsRows='';
for(let row=0;row<ROWS;row++){
  rsRows+='<tr>';
  for(let grp=0;grp<GROUPS;grp++){
    const num=grp*ROWS+row+1;
    const evH=scoredHome[num]||null, evA=scoredAway[num]||null;
    const jA=(evH&&evH.isFinal)?String(evH.playerNum||''):'';
    const jB=(evA&&evA.isFinal)?String(evA.playerNum||''):'';
    const qHA=homeQEnd[num]?`<span style="display:block;font-size:5pt;color:#c0392b;font-weight:900;line-height:1">Q${homeQEnd[num]}</span>`:'';
    const qBA=awayQEnd[num]?`<span style="display:block;font-size:5pt;color:#0077a8;font-weight:900;line-height:1">Q${awayQEnd[num]}</span>`:'';
    const cA='rna'+(evH?evH.isFinal?' sh':' shi':'')+(homeQEnd[num]?' rq-end-a':'');
    const cB='rnb'+(evA?evA.isFinal?' sa':' sai':'')+(awayQEnd[num]?' rq-end-b':'');
    const bA=homeQEnd[num]?'border-bottom:2.5px solid #c0392b !important;':'';
    const bB=awayQEnd[num]?'border-bottom:2.5px solid #0077a8 !important;':'';
    if(grp>0) rsRows+=`<td class="rdiv"></td>`;
    rsRows+=`<td class="rja">${jA}${qHA}</td><td class="${cA}" style="${bA}">${num}</td><td class="${cB}" style="${bB}">${num}</td><td class="rjb">${jB}${qBA}</td>`;
  }
  rsRows+='</tr>';
}

  const qs=state.quarterScores;
  const hn=teamName('home'), an=teamName('away');
  const ssDate=$('ssDate')?.value||new Date().toISOString().split('T')[0];
  const ssComp=$('ssCompetition')?.value||'';
  const ssPlace=$('ssPlace')?.value||'';
  const ssRef=$('ssReferee')?.value||'';
  const ssGame=$('ssGameNo')?.value||'';
  const ssHCoach=$('ssHomeCoach')?.value||'';
  const ssACoach=$('ssAwayCoach')?.value||'';
  const leagueTxt=$('ssLeagueSelect')?.selectedOptions[0]?.text||'';
  const winnerName=state.home.score>state.away.score?hn:state.away.score>state.home.score?an:'TIE';
  const hFouls=state.home.fouls, aFouls=state.away.fouls;
 
  const win=window.open('','_blank','width=1400,height=900');
if(!win){ toast('⚠ Pop-up blocked! Allow pop-ups for this site.'); return; }
win.document.open();
function rosterRows(players){
  const max=Math.max(players.length,15);
  let r='';
  for(let i=0;i<max;i++){
    const p=players[i];
    const fd=[1,2,3,4,5].map(n=>`<span class="fd${p&&p.fls>=n?' fm':''}">${n}</span>`).join('');
    r+=`<tr><td class="rn">${p?`#${p.num}`:''}</td><td class="rnm">${p?p.name+(p.onCourt?' ★':''):''}</td><td class="rfd">${fd}</td></tr>`;
  }
  return r;
}
win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Scoresheet</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
@page{size:A4 portrait;margin:5mm;}
body{font-family:Arial,sans-serif;font-size:6.5pt;color:#000;background:#fff;}

.page{width:100%;display:grid;grid-template-columns:82mm 1fr;gap:2mm;height:277mm;}

/* ── LEFT COLUMN ── */
.left{display:flex;flex-direction:column;gap:1mm;overflow:hidden;}

.title-block{text-align:center;border:1.5px solid #000;padding:2px;}
.title-block .org{font-size:5pt;letter-spacing:.5px;}
.title-block .big{font-size:13pt;font-weight:900;letter-spacing:2px;}

.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.5mm;}
.mf{border:1px solid #aaa;padding:1px 2px;}
.mf label{font-size:4.5pt;color:#666;display:block;}
.mf span{font-size:6pt;font-weight:700;}

.score-bar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;border:1.5px solid #000;padding:1px 3px;}
.score-bar .tna{font-size:7pt;font-weight:900;color:#c0392b;}
.score-bar .tnb{font-size:7pt;font-weight:900;color:#0077a8;text-align:right;}
.score-bar .sc{font-size:13pt;font-weight:900;padding:0 4px;text-align:center;}

.tb{border:1.5px solid #000;}
.th{padding:1px 3px;font-size:6pt;font-weight:900;letter-spacing:.5px;text-transform:uppercase;border-bottom:1px solid #000;}
.th.ha{background:#ffe0d8;color:#c0392b;}
.th.hb{background:#d0eaf5;color:#0077a8;}

.tof{display:grid;grid-template-columns:1fr 1fr;gap:0.5mm;padding:1px 3px;border-bottom:1px solid #ddd;}
.tob label{font-size:4.5pt;color:#555;display:block;}
.tobx{display:flex;gap:1px;flex-wrap:wrap;}
.tobx span{width:11px;height:11px;border:1px solid #999;display:inline-flex;align-items:center;justify-content:center;font-size:4.5pt;font-weight:700;}
.tobx span.used{background:#333;color:#fff;border-color:#333;}

.rt{width:100%;border-collapse:collapse;}
.rt tr{height:4.2mm;}
.rt td{border-bottom:1px solid #eee;padding:0 2px;font-size:5.5pt;}
.rt td.rn{width:20px;color:#888;}
.rt td.rnm{overflow:hidden;white-space:nowrap;}
.rt td.rfd{white-space:nowrap;width:58px;}
.fd{display:inline-block;width:9px;height:9px;border:1px solid #bbb;border-radius:50%;text-align:center;line-height:8px;font-size:4.5pt;margin:0 0.3px;}
.fd.fm{background:#333;color:#fff;border-color:#333;}
.cr{padding:1px 3px;font-size:5.5pt;border-top:1px solid #ddd;color:#555;}

/* ── RIGHT COLUMN ── */
.right{display:flex;flex-direction:column;gap:1mm;overflow:hidden;}

.rst{text-align:center;font-size:7pt;font-weight:900;letter-spacing:2px;border:1.5px solid #000;padding:1px;background:#f0f0f0;}

.rs{border-collapse:collapse;width:100%;table-layout:fixed;}
.rs thead th{font-size:5pt;font-weight:900;padding:0;text-align:center;border:1px solid #999;height:10px;}
.rs thead th.ha{background:#ffe0d8;color:#c0392b;}
.rs thead th.hb{background:#d0eaf5;color:#0077a8;}
.rs thead th.rdivh{background:#ccc;width:2px;padding:0;border:none;}
.rs tbody tr{height:6mm;}
.rs td{border:1px solid #ddd;text-align:center;padding:0;font-size:5.5pt;font-weight:700;vertical-align:middle;}
.rja,.rjb{color:#555;width:10px;font-size:5pt;}
.rna{color:#bbb;background:#fdf8f8;}
.rnb{color:#bbb;background:#f8fcff;}
.rdiv{width:2px;background:#ccc;border:none;}
*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
.sh{background:#ff5722!important;color:#fff!important;border-color:#ff5722!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
.sa{background:#00b4d8!important;color:#fff!important;border-color:#00b4d8!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
.shi{background:rgba(255,87,34,.5)!important;color:#fff!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
.sai{background:rgba(0,180,216,.5)!important;color:#fff!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
.rna{color:#999;background:#fdf8f8;}
.rnb{color:#999;background:#f8fcff;}

/* ── BOTTOM SECTION ── */
.bottom{display:grid;grid-template-columns:1fr 1fr;gap:2mm;margin-top:1mm;}

.st{width:100%;border-collapse:collapse;font-size:5.5pt;}
.st th{background:#f0f0f0;padding:1px 3px;border:1px solid #bbb;font-weight:700;}
.st td{padding:1px 3px;border:1px solid #ddd;text-align:center;}
.st td:first-child{text-align:left;}
.fr td{background:#eee;font-weight:700;}

.sth{font-size:5.5pt;font-weight:900;letter-spacing:.5px;background:#eee;padding:1px 3px;border:1px solid #bbb;text-transform:uppercase;}
.stat{width:100%;border-collapse:collapse;font-size:5pt;}
.stat th{padding:1px 2px;background:#f5f5f5;border:1px solid #bbb;font-weight:700;}
.stat th:first-child{text-align:left;}
.stat td{padding:1px 2px;border:1px solid #eee;text-align:center;}
.stat td:first-child{text-align:left;}
.ca{color:#c0392b;font-weight:700;}
.cb{color:#0077a8;font-weight:700;}

.winner{font-size:6pt;font-weight:900;color:#c0392b;padding:1px 0;}
.officials{display:grid;grid-template-columns:1fr 1fr;gap:1mm;font-size:5.5pt;margin-top:1mm;}
.ofd{border-bottom:1px solid #999;padding:1px 0;}
.ofd label{font-size:4.5pt;color:#777;display:block;}
</style>
</head><body>
<div class="page">

  <div class="left">
    <div class="title-block">
      <div class="org">BASKETBALL SCORESHEET</div>
      <div class="big">SCORESHEET</div>
    </div>

    <div class="meta-grid">
      <div class="mf" style="grid-column:1/3"><label>COMPETITION / LEAGUE</label><span>${ssComp||leagueTxt||'—'}</span></div>
      <div class="mf"><label>DATE</label><span>${ssDate}</span></div>
      <div class="mf"><label>GAME NO.</label><span>${ssGame||'—'}</span></div>
      <div class="mf"><label>PLACE</label><span>${ssPlace||'—'}</span></div>
      <div class="mf"><label>REFEREE</label><span>${ssRef||'—'}</span></div>
    </div>

    <div class="score-bar">
      <div class="tna">${hn}</div>
      <div class="sc">${state.home.score}—${state.away.score}</div>
      <div class="tnb">${an}</div>
    </div>

    <div class="tb">
      <div class="th ha">TEAM A — ${hn}</div>
      <div class="tof">
        <div class="tob"><label>TIME-OUTS</label><div class="tobx">${[...Array(5)].map((_,i)=>`<span class="${i<(state.home.timeoutsUsed1H+state.home.timeoutsUsed2H)?'used':''}">${i<(state.home.timeoutsUsed1H+state.home.timeoutsUsed2H)?'✓':''}</span>`).join('')}</div></div>
        <div class="tob"><label>TEAM FOULS</label><div class="tobx" style="display:flex;gap:3px;flex-wrap:nowrap">${['Q1','Q2','Q3','Q4'].map((q,qi)=>`<div style="display:flex;flex-direction:column;align-items:center;gap:1px"><span style="font-size:4pt;color:#888">${q}</span><div style="display:flex;gap:1px">${[...Array(5)].map((_,i)=>`<span class="${qi*5+i<hFouls?'used':''}" style="width:8px;height:8px;font-size:0"></span>`).join('')}</div></div>`).join('')}</div></div>
      </div>
      <table class="rt"><tbody>${rosterRows(state.home.players)}</tbody></table>
      <div class="cr">Coach: ${ssHCoach||'________________________________'}</div>
    </div>

    <div class="tb">
      <div class="th hb">TEAM B — ${an}</div>
      <div class="tof">
      <div class="tob"><label>TIME-OUTS</label><div class="tobx">${[...Array(5)].map((_,i)=>`<span class="${i<(state.away.timeoutsUsed1H+state.away.timeoutsUsed2H)?'used':''}">${i<(state.away.timeoutsUsed1H+state.away.timeoutsUsed2H)?'✓':''}</span>`).join('')}</div></div>
        <div class="tob"><label>TEAM FOULS</label><div class="tobx" style="display:flex;gap:3px;flex-wrap:nowrap">${['Q1','Q2','Q3','Q4'].map((q,qi)=>`<div style="display:flex;flex-direction:column;align-items:center;gap:1px"><span style="font-size:4pt;color:#888">${q}</span><div style="display:flex;gap:1px">${[...Array(5)].map((_,i)=>`<span class="${qi*5+i<aFouls?'used':''}" style="width:8px;height:8px;font-size:0"></span>`).join('')}</div></div>`).join('')}</div></div>
      </div>
      <table class="rt"><tbody>${rosterRows(state.away.players)}</tbody></table>
      <div class="cr">Coach: ${ssACoach||'________________________________'}</div>
    </div>

    <div class="bottom">
      <div>
        <table class="st">
          <thead><tr><th>PERIOD</th><th style="color:#c0392b">A</th><th style="color:#0077a8">B</th></tr></thead>
          <tbody>
            <tr><td>① 1st Qtr</td><td>${qs['1']?qs['1'].home:'—'}</td><td>${qs['1']?qs['1'].away:'—'}</td></tr>
            <tr><td>② 2nd Qtr</td><td>${qs['2']?qs['2'].home:'—'}</td><td>${qs['2']?qs['2'].away:'—'}</td></tr>
            <tr><td>③ 3rd Qtr</td><td>${qs['3']?qs['3'].home:'—'}</td><td>${qs['3']?qs['3'].away:'—'}</td></tr>
            <tr><td>④ 4th Qtr</td><td>${qs['4']?qs['4'].home:'—'}</td><td>${qs['4']?qs['4'].away:'—'}</td></tr>
            <tr><td>Extra</td><td>${qs['OT']?qs['OT'].home:'—'}</td><td>${qs['OT']?qs['OT'].away:'—'}</td></tr>
            <tr class="fr"><td><strong>FINAL</strong></td><td><strong>${state.home.score}</strong></td><td><strong>${state.away.score}</strong></td></tr>
          </tbody>
        </table>
        <div class="winner">WINNING TEAM: ${winnerName}</div>
      </div>
      <div>
        <div class="sth">TEAM STATISTICS</div>
        <table class="stat">
          <thead><tr><th>STAT</th><th class="ca">A</th><th class="cb">B</th></tr></thead>
          <tbody>
            <tr><td>Pts from Turnovers</td><td class="ca">${state.home.pto||0}</td><td class="cb">${state.away.pto||0}</td></tr>
            <tr><td>2nd Chance Pts</td><td class="ca">${state.home.twocp||0}</td><td class="cb">${state.away.twocp||0}</td></tr>
            <tr><td>Fast Break Pts</td><td class="ca">${state.home.fbp||0}</td><td class="cb">${state.away.fbp||0}</td></tr>
            <tr><td>FB Pts from TO</td><td class="ca">${state.home.fbto||0}</td><td class="cb">${state.away.fbto||0}</td></tr>
            
          </tbody>
        </table>
        <div class="sth" style="margin-top:1mm;">GAME SUMMARY</div>
        <table class="stat">
          <thead><tr><th>STAT</th><th class="ca">A</th><th class="cb">B</th></tr></thead>
          <tbody>
           <tr><td>Biggest Lead</td><td class="ca">${state._homeLead>0?'+'+state._homeLead:'—'}</td><td class="cb">${state._awayLead>0?'+'+state._awayLead:'—'}</td></tr>
          </tbody>
        </table>
        <div class="officials">
          <div class="ofd"><label>SCOREKEEPER</label>&nbsp;</div>
          <div class="ofd"><label>TIMEKEEPER</label>&nbsp;</div>
        </div>
      </div>
    </div>
  </div>

  <div class="right">
    <div class="rst">RUNNING SCORE</div>
    <table class="rs">
      <thead><tr>
        <th class="ha" style="width:10px">A</th><th class="ha" style="width:14px"></th><th class="hb" style="width:14px"></th><th class="hb" style="width:10px">B</th>
        <th class="rdivh"></th>
        <th class="ha" style="width:10px">A</th><th class="ha" style="width:14px"></th><th class="hb" style="width:14px"></th><th class="hb" style="width:10px">B</th>
        <th class="rdivh"></th>
        <th class="ha" style="width:10px">A</th><th class="ha" style="width:14px"></th><th class="hb" style="width:14px"></th><th class="hb" style="width:10px">B</th>
        <th class="rdivh"></th>
        <th class="ha" style="width:10px">A</th><th class="ha" style="width:14px"></th><th class="hb" style="width:14px"></th><th class="hb" style="width:10px">B</th>
      </tr></thead>
      <tbody>${rsRows}</tbody>
    </table>
    <div style="text-align:center;font-size:5.5pt;border:1px solid #bbb;padding:1px;margin-top:1mm;">
      FINAL SCORE: <strong>${hn} ${state.home.score} — ${state.away.score} ${an}</strong> &nbsp;&nbsp; WINNING TEAM: <strong>${winnerName}</strong>
    </div>
  </div>

</div>
</body></html>`);
 win.document.close();
win.focus();
setTimeout(()=>{ win.print(); }, 800);
});
function buildScoresheet(){
  const hn=teamName('home'), an=teamName('away');
  $('ssTeamA').textContent=hn; $('ssTeamB').textContent=an;
  $('ssRosterTeamA').textContent=hn; $('ssRosterTeamB').textContent=an;
  if(!$('ssDate').value) $('ssDate').value=new Date().toISOString().split('T')[0];
  renderLeagueSelect();

// TIMEOUTS — 1st half has 2 boxes, 2nd half has 3 boxes, filled per half
  buildToBoxes('ssHomeTO1', 2, Math.min(state.home.timeoutsUsed1H || 0, 2));
  buildToBoxes('ssHomeTO2', 3, Math.min(state.home.timeoutsUsed2H || 0, 3));
  buildToBoxes('ssAwayTO1', 2, Math.min(state.away.timeoutsUsed1H || 0, 2));
  buildToBoxes('ssAwayTO2', 3, Math.min(state.away.timeoutsUsed2H || 0, 3));

  // TEAM FOULS — auto-fill from live scorer state
  buildFoulGrid('ssHomeFoulBoxes', 20, state.home.fouls);
  buildFoulGrid('ssAwayFoulBoxes', 20, state.away.fouls);

  buildRosterTable('ssHomeRosterBody', state.home.players);
  buildRosterTable('ssAwayRosterBody', state.away.players);

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

  
  $('ssStatPtoA').textContent=state.home.pto||0;   $('ssStatPtoB').textContent=state.away.pto||0;
  $('ssStatScpA').textContent=state.home.twocp||0; $('ssStatScpB').textContent=state.away.twocp||0;
  $('ssStatFbpA').textContent=state.home.fbp||0;   $('ssStatFbpB').textContent=state.away.fbp||0;
  $('ssStatFbtoA').textContent=state.home.fbto||0; $('ssStatFbtoB').textContent=state.away.fbto||0;
  

  // BIGGEST LEAD — auto from tracked state
  if($('ssGsBigLeadA')) $('ssGsBigLeadA').textContent=state._homeLead>0?`+${state._homeLead}`:'—';
  if($('ssGsBigLeadB')) $('ssGsBigLeadB').textContent=state._awayLead>0?`+${state._awayLead}`:'—';

  buildRunningScore();
}

function buildToBoxes(id, count, usedCount=0) {
  const el=$(id);
  if(!el) return;
  el.innerHTML='';
  for(let i=0; i<count; i++){
    const b=document.createElement('div');
    b.className='ss-to-box'+(i<usedCount?' used':'');
    b.addEventListener('click',()=>b.classList.toggle('used'));
    el.appendChild(b);
  }
}
function buildFoulGrid(id, count, markedCount=0) {
  const el=$(id);
  if(!el) return;
  el.innerHTML='';
  const quarters = ['Q1','Q2','Q3','Q4'];
  let boxNum = 0;
  quarters.forEach((qLabel, qi) => {
    const group = document.createElement('div');
    group.className = 'ss-foul-quarter-group';
    const label = document.createElement('span');
    label.className = 'ss-foul-q-label';
    label.textContent = qLabel;
    group.appendChild(label);
    const boxRow = document.createElement('div');
    boxRow.className = 'ss-foul-q-boxes';
    for(let i=0; i<5; i++){
      boxNum++;
      const b = document.createElement('div');
      b.className = 'ss-foul-box' + (boxNum <= markedCount ? ' marked' : '');
      b.addEventListener('click', () => b.classList.toggle('marked'));
      boxRow.appendChild(b);
    }
    group.appendChild(boxRow);
    el.appendChild(group);
  });
}
function buildRosterTable(tbodyId, players) {
  const tbody = $(tbodyId);
  tbody.innerHTML = '';
  const max = Math.max(players.length, 15);

  for (let i = 0; i < max; i++) {
    const p = players[i];
    const tr = document.createElement('tr');

    // Number cell
    const tdNum = document.createElement('td');
    tdNum.style.cssText = 'text-align:center;color:var(--muted);font-size:.72rem';
    tdNum.textContent = p ? `#${p.num}` : '';
    tr.appendChild(tdNum);

    // Name cell
    const tdName = document.createElement('td');
    tdName.textContent = p ? p.name + (p.onCourt ? ' ⭐' : '') : '';
    tr.appendChild(tdName);

    // Foul dots — 5 cells
    for (let n = 1; n <= 5; n++) {
      const td = document.createElement('td');
      const cell = document.createElement('div');
      cell.className = 'ss-foul-cell';

      if (p) {
        const playerFouls = Number(p.fls) || 0; // safe conversion
        const dot = document.createElement('div');
        dot.className = 'ss-pf-dot';
        if (playerFouls >= n) {
          dot.classList.add('marked'); // pre-fill based on actual fouls
        }
        dot.addEventListener('click', () => dot.classList.toggle('marked'));
        cell.appendChild(dot);
      }

      td.appendChild(cell);
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }
}

function buildRunningScore(){
  const tbody=$('ssRunningBody'); tbody.innerHTML='';
  const ROWS=40, GROUPS=4, TOTAL=ROWS*GROUPS;
  const scoredHome={}, scoredAway={};
  let homeTotal=0, awayTotal=0;

  // Build quarter-end marker maps
  const homeQEnd={}, awayQEnd={};
  let hR=0, aR=0;
  for(const q of ['1','2','3','4','OT']){
    let hp=0, ap=0;
    state.scoringEvents.filter(e=>e.team==='home'&&e.quarter===q).forEach(e=>hp+=Math.max(1,e.pts||1));
    state.scoringEvents.filter(e=>e.team==='away'&&e.quarter===q).forEach(e=>ap+=Math.max(1,e.pts||1));
    if(hp>0){ hR+=hp; if(hR<=TOTAL) homeQEnd[hR]=q; }
    if(ap>0){ aR+=ap; if(aR<=TOTAL) awayQEnd[aR]=q; }
  }

  for(const ev of state.scoringEvents){
    const pts=Math.max(1,ev.pts||1);
    const q=ev.quarter||'?';
    if(ev.team==='home'){
      for(let i=0;i<pts;i++){ homeTotal++; if(homeTotal<=TOTAL) scoredHome[homeTotal]={playerNum:ev.playerNum,isFinal:(i===pts-1),quarter:q}; }
    } else {
      for(let i=0;i<pts;i++){ awayTotal++; if(awayTotal<=TOTAL) scoredAway[awayTotal]={playerNum:ev.playerNum,isFinal:(i===pts-1),quarter:q}; }
    }
  }

  for(let row=0;row<ROWS;row++){
    const tr=document.createElement('tr'); let html='';
    for(let grp=0;grp<GROUPS;grp++){
      const num=grp*ROWS+row+1;
      if(grp>0) html+=`<td class="rs-divider-cell"></td>`;
      const evH=scoredHome[num]||null, evA=scoredAway[num]||null;
      const jerseyA=(evH&&evH.isFinal)?String(evH.playerNum||''):'';
      const jerseyB=(evA&&evA.isFinal)?String(evA.playerNum||''):'';
      const qHA=homeQEnd[num]?`<span class="rs-q-marker">Q${homeQEnd[num]}</span>`:'';
      const qBA=awayQEnd[num]?`<span class="rs-q-marker rs-q-marker-away">Q${awayQEnd[num]}</span>`:'';
      let numClassA='rs-num-a', numClassB='rs-num-b';
      if(evH) numClassA+=evH.isFinal?' scored-home':' scored-home-interim';
      if(evA) numClassB+=evA.isFinal?' scored-away':' scored-away-interim';
      if(homeQEnd[num]) numClassA+=' rs-q-end-a';
      if(awayQEnd[num]) numClassB+=' rs-q-end-b';
      html+=`<td class="rs-a">${jerseyA}${qHA}</td>`;
      html+=`<td class="${numClassA}">${num}</td>`;
      html+=`<td class="${numClassB}">${num}</td>`;
      html+=`<td class="rs-b">${jerseyB}${qBA}</td>`;
    }
    tr.innerHTML=html;
    tbody.appendChild(tr);
  }
}

/* ══════════════════════════════
   LEAGUE CRUD
══════════════════════════════ */
async function renderLeagueSelect(){
  const sel=$('ssLeagueSelect'); if(!sel) return;
  const current=sel.value; sel.innerHTML='<option value="">— Select League —</option>';
  try { const leagues=await loadLeaguesFromDB(); leagues.forEach(l=>{ const o=document.createElement('option'); o.value=l.id; o.textContent=l.category!=='Open'?`${l.name} (${l.category})`:l.name; if(l.id===current) o.selected=true; sel.appendChild(o); }); } catch(e){}
}

async function renderLeagueList(){
  const list=$('lmList'), countEl=$('lmCount'); if(!list) return;
  list.innerHTML=`<div class="lm-empty"><div class="db-spinner" style="width:16px;height:16px;border-width:2px;margin:0 auto 6px"></div></div>`;
  try {
    const leagues=await loadLeaguesFromDB(); countEl.textContent=leagues.length;
    if(!leagues.length){ list.innerHTML=`<div class="lm-empty">No leagues yet. Add one above!</div>`; return; }
    list.innerHTML='';
    leagues.forEach(l=>{
      const row=document.createElement('div'); row.className='lm-row';
      row.innerHTML=`<div class="lm-name-col"><span class="lm-name">${l.name}</span><span class="lm-cat-badge">${l.category}</span></div><div class="lm-row-actions"><button class="lm-edit-btn" data-id="${l.id}" data-name="${l.name}">✎ Edit</button><button class="lm-del-btn" data-id="${l.id}" data-name="${l.name}">🗑</button></div>`;
      row.querySelector('.lm-del-btn').addEventListener('click',async e=>{ const btn=e.currentTarget; if(!confirm(`Delete "${btn.dataset.name}"?`)) return; showLoading('Deleting...'); try{await db.delete('leagues',{'id':`eq.${btn.dataset.id}`});await renderLeagueList();await renderLeagueSelect();await renderNavLeagueSelect();toast(`🗑 Deleted: ${btn.dataset.name}`);}catch(err){toast('❌ '+err.message);}finally{hideLoading();} });
      row.querySelector('.lm-edit-btn').addEventListener('click',async e=>{ const btn=e.currentTarget; const newName=prompt('Edit league name:',btn.dataset.name); if(!newName||!newName.trim()) return; showLoading('Updating...'); try{await db.update('leagues',{name:newName.trim()},{'id':`eq.${btn.dataset.id}`});await renderLeagueList();await renderLeagueSelect();await renderNavLeagueSelect();toast('✓ Updated');}catch(err){toast('❌ '+err.message);}finally{hideLoading();} });
      list.appendChild(row);
    });
  } catch(e){ list.innerHTML=`<div class="lm-empty" style="color:var(--red)">❌ ${e.message}</div>`; }
}

$('ssLeagueManageBtn').addEventListener('click',async()=>{ await renderLeagueList(); $('leagueManagerModal').classList.add('visible'); setTimeout(()=>$('lmNameInput').focus(),200); });
$('navLeagueManageBtn').addEventListener('click',async()=>{ await renderLeagueList(); $('leagueManagerModal').classList.add('visible'); setTimeout(()=>$('lmNameInput').focus(),200); });

['closeLeagueManager','closeLeagueManager2'].forEach(id=>{
  $(id).addEventListener('click',async()=>{ $('leagueManagerModal').classList.remove('visible'); await renderLeagueSelect(); await renderNavLeagueSelect(); });
});
$('leagueManagerModal').addEventListener('click',async e=>{ if(e.target===$('leagueManagerModal')){ $('leagueManagerModal').classList.remove('visible'); await renderLeagueSelect(); await renderNavLeagueSelect(); } });

$('lmAddBtn').addEventListener('click', lmAdd);
$('lmNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') lmAdd(); });
 
async function lmAdd() {
  const name = $('lmNameInput').value.trim();
  if (!name) { $('lmNameInput').focus(); return; }
 
  // Read selected value immediately before any async
  const sel = $('lmCategoryInput');
  const category = sel.options[sel.selectedIndex].value;
 
  showLoading('Adding league...');
  try {
    await db.insert('leagues', { name, category });
    invalidateLeagueCache(); // bust cache so new league shows immediately
    $('lmNameInput').value = '';
    await renderLeagueList();
    await renderLeagueSelect();
    await renderNavLeagueSelect();
    toast(`✓ Added: ${name} (${category})`);
  } catch(e) { toast('❌ ' + e.message); }
  finally { hideLoading(); }
}

/* ══════════════════════════════
   HELPERS
══════════════════════════════ */
function teamName(team){return state[team].name||team.toUpperCase();}
function downloadFile(filename,content,type){ const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob); const a=Object.assign(document.createElement('a'),{href:url,download:filename}); document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url); }
function showLoading(msg='Loading...'){ let el=document.querySelector('.db-loading'); if(!el){el=document.createElement('div');el.className='db-loading';el.innerHTML=`<div class="db-loading-inner"><div class="db-spinner"></div><span class="db-loading-msg"></span></div>`;document.body.appendChild(el);} el.querySelector('.db-loading-msg').textContent=msg; el.classList.add('visible'); }
function hideLoading(){ const el=document.querySelector('.db-loading'); if(el) el.classList.remove('visible'); }
let toastTimer;
function toast(msg){ let el=document.querySelector('.toast'); if(!el){el=document.createElement('div');el.className='toast';document.body.appendChild(el);} el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2800); }

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
renderNavLeagueSelect();
updateGameButtons();
connectRealtime();
