const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const liveTracker = require('./liveTracker');
const riotTracker = require('./riotMatchTracker');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'match_state.json');

app.use(express.json({ limit: '10mb' }));

// Disable caching for OBS Browser Sources so updates reflect instantly
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false
}));

// Tournament Teams Catalog
const TOURNAMENT_TEAMS = [
  { id: "naadan-legacy", name: "NAADAN LEGACY", tag: "NDL", logo: "/logos/naadan-legacy.png" },
  { id: "aetrix", name: "AETRIX", tag: "ATX", logo: "/logos/aetrix.png" },
  { id: "bitter-blade-z", name: "BITTER BLADE Z", tag: "BBZ", logo: "/logos/bitter-blade-z.png" },
  { id: "veyron", name: "VEYRON", tag: "VRN", logo: "/logos/veyron.png" }
];

// Official 16 Match Tournament Fixtures
const TOURNAMENT_FIXTURES = [
  { matchNumber: 1, label: "M1: NDL vs ATX (Lotus)", stage: "Group Stage", t1: "naadan-legacy", t2: "aetrix", map: "Lotus", bestOf: "BO1" },
  { matchNumber: 2, label: "M2: NDL vs BBZ (Sunset)", stage: "Group Stage", t1: "naadan-legacy", t2: "bitter-blade-z", map: "Sunset", bestOf: "BO1" },
  { matchNumber: 3, label: "M3: NDL vs VRN (Haven)", stage: "Group Stage", t1: "naadan-legacy", t2: "veyron", map: "Haven", bestOf: "BO1" },
  { matchNumber: 4, label: "M4: ATX vs BBZ (Split)", stage: "Group Stage", t1: "aetrix", t2: "bitter-blade-z", map: "Split", bestOf: "BO1" },
  { matchNumber: 5, label: "M5: ATX vs VRN (Ascent)", stage: "Group Stage", t1: "aetrix", t2: "veyron", map: "Ascent", bestOf: "BO1" },
  { matchNumber: 6, label: "M6: BBZ vs VRN (Bind)", stage: "Group Stage", t1: "bitter-blade-z", t2: "veyron", map: "Bind", bestOf: "BO1" },
  { matchNumber: 7, label: "M7: ATX vs NDL (Breeze)", stage: "Group Stage", t1: "aetrix", t2: "naadan-legacy", map: "Breeze", bestOf: "BO1" },
  { matchNumber: 8, label: "M8: BBZ vs NDL (Bind)", stage: "Group Stage", t1: "bitter-blade-z", t2: "naadan-legacy", map: "Bind", bestOf: "BO1" },
  { matchNumber: 9, label: "M9: VRN vs NDL (Lotus)", stage: "Group Stage", t1: "veyron", t2: "naadan-legacy", map: "Lotus", bestOf: "BO1" },
  { matchNumber: 10, label: "M10: BBZ vs ATX (Sunset)", stage: "Group Stage", t1: "bitter-blade-z", t2: "aetrix", map: "Sunset", bestOf: "BO1" },
  { matchNumber: 11, label: "M11: VRN vs ATX (Haven)", stage: "Group Stage", t1: "veyron", t2: "aetrix", map: "Haven", bestOf: "BO1" },
  { matchNumber: 12, label: "M12: VRN vs BBZ (Ascent)", stage: "Group Stage", t1: "veyron", t2: "bitter-blade-z", map: "Ascent", bestOf: "BO1" },
  { matchNumber: 13, label: "M13: Playoff Q1 (Rank 1 vs 2)", stage: "Playoffs: Q1", t1: "naadan-legacy", t2: "aetrix", map: "Ascent", bestOf: "BO3" },
  { matchNumber: 14, label: "M14: Eliminator (Rank 3 vs 4)", stage: "Playoffs: Eliminator", t1: "bitter-blade-z", t2: "veyron", map: "Haven", bestOf: "BO3" },
  { matchNumber: 15, label: "M15: Playoff Q2", stage: "Playoffs: Q2", t1: "aetrix", t2: "bitter-blade-z", map: "Lotus", bestOf: "BO3" },
  { matchNumber: 16, label: "M16: Grand Finals", stage: "Grand Finals", t1: "naadan-legacy", t2: "aetrix", map: "Sunset", bestOf: "BO5" }
];

// Official 4-Team Rosters with Player Portraits from Tournament Manager
const TOURNAMENT_ROSTERS = {
  "naadan-legacy": [
    { id: "ndl-1", name: "DOMINIC TORETTO", role: "Captain", photo: "/players/DOMINIC.png", agent: "Jett", kills: 0, deaths: 0, assists: 0, acs: 260 },
    { id: "ndl-2", name: "OUTLAWS", role: "Player", photo: "/players/DOMINIC.png", agent: "Omen", kills: 0, deaths: 0, assists: 0, acs: 195 },
    { id: "ndl-3", name: "Light yagami", role: "Player", photo: "/players/DRAIVEN.png", agent: "Sova", kills: 0, deaths: 0, assists: 0, acs: 180 },
    { id: "ndl-4", name: "TRICKY", role: "Player", photo: "/players/TRICKY.png", agent: "Killjoy", kills: 0, deaths: 0, assists: 0, acs: 170 },
    { id: "ndl-5", name: "zippaz007", role: "Player", photo: "/players/DOMINIC.png", agent: "Raze", kills: 0, deaths: 0, assists: 0, acs: 210 },
    { id: "ndl-6", name: "DRAIVEN", role: "Sub", photo: "/players/DRAIVEN.png", agent: "Breach", kills: 0, deaths: 0, assists: 0, acs: 150 }
  ],
  "aetrix": [
    { id: "atx-1", name: "AEGON XD", role: "Captain", photo: "/players/AEGON.png", agent: "Reyna", kills: 0, deaths: 0, assists: 0, acs: 250 },
    { id: "atx-2", name: "Luxy", role: "Player", photo: "/players/LUXY.png", agent: "Viper", kills: 0, deaths: 0, assists: 0, acs: 190 },
    { id: "atx-3", name: "Thakudu Scarlet", role: "Player", photo: "/players/SCARLET.png", agent: "Skye", kills: 0, deaths: 0, assists: 0, acs: 185 },
    { id: "atx-4", name: "SHREYA", role: "Player", photo: "/players/SREYA.png", agent: "Fade", kills: 0, deaths: 0, assists: 0, acs: 175 },
    { id: "atx-5", name: "PorottaBeef", role: "Player", photo: "/players/POROTTA.png", agent: "Cypher", kills: 0, deaths: 0, assists: 0, acs: 165 },
    { id: "atx-6", name: "NANDU", role: "Sub", photo: "/players/NANDU.png", agent: "Brimstone", kills: 0, deaths: 0, assists: 0, acs: 140 }
  ],
  "bitter-blade-z": [
    { id: "bbz-1", name: "Nishku", role: "Captain", photo: "/players/NISHKU.png", agent: "Jett", kills: 0, deaths: 0, assists: 0, acs: 245 },
    { id: "bbz-2", name: "ASG UnniyAppam", role: "Player", photo: "/players/AXEL.png", agent: "Omen", kills: 0, deaths: 0, assists: 0, acs: 200 },
    { id: "bbz-3", name: "Axel Blaze", role: "Player", photo: "/players/AXEL.png", agent: "Phoenix", kills: 0, deaths: 0, assists: 0, acs: 190 },
    { id: "bbz-4", name: "CUTEKIDxT", role: "Player", photo: "/players/CUTE.png", agent: "Gekko", kills: 0, deaths: 0, assists: 0, acs: 170 },
    { id: "bbz-5", name: "デヴィカ", role: "Player", photo: "/players/CUTE.png", agent: "Killjoy", kills: 0, deaths: 0, assists: 0, acs: 160 },
    { id: "bbz-6", name: "Kakashi", role: "Sub", photo: "/players/KAKASHI.png", agent: "Sova", kills: 0, deaths: 0, assists: 0, acs: 155 }
  ],
  "veyron": [
    { id: "vrn-1", name: "DEVILDOM", role: "Captain", photo: "/players/DEVILDOM.png", agent: "Reyna", kills: 0, deaths: 0, assists: 0, acs: 270 },
    { id: "vrn-2", name: "Denver", role: "Player", photo: "/players/DENVER.png", agent: "Chamber", kills: 0, deaths: 0, assists: 0, acs: 215 },
    { id: "vrn-3", name: "yrr", role: "Player", photo: "/players/PRABHU.png", agent: "KAY/O", kills: 0, deaths: 0, assists: 0, acs: 180 },
    { id: "vrn-4", name: "KM PRABHU", role: "Player", photo: "/players/PRABHU.png", agent: "Clove", kills: 0, deaths: 0, assists: 0, acs: 190 },
    { id: "vrn-5", name: "BEEMA", role: "Player", photo: "/players/BEEMA.png", agent: "Fade", kills: 0, deaths: 0, assists: 0, acs: 165 },
    { id: "vrn-6", name: "STEPHAN", role: "Sub", photo: "/players/STEPHAN.png", agent: "Iso", kills: 0, deaths: 0, assists: 0, acs: 150 }
  ]
};

function getRosterForTeam(teamIdOrName) {
  if (!teamIdOrName) return [];
  const normalized = teamIdOrName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  for (const key of Object.keys(TOURNAMENT_ROSTERS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return JSON.parse(JSON.stringify(TOURNAMENT_ROSTERS[key]));
    }
  }
  return [];
}

// Default Valorant Competitive State
const defaultState = {
  match: {
    title: "VALORANT TOURNAMENT",
    stage: "GRAND FINALS",
    seriesType: "BO3", // BO1, BO3, BO5
    currentMapIndex: 1,
    mapName: "Ascent",
    phase: "live", // "prematch", "live", "halftime", "overtime", "ended"
    statusBanner: "" // e.g. "MATCH POINT", "OVERTIME", "TACTICAL TIMEOUT"
  },
  teamsList: TOURNAMENT_TEAMS,
  fixturesList: TOURNAMENT_FIXTURES,
  teamA: {
    id: "naadan-legacy",
    name: "NAADAN LEGACY",
    tag: "NDL",
    score: 0,
    mapWins: 0,
    side: "attack", // "attack" or "defense"
    color: "#ff4655", // Valorant attack red
    logo: "/logos/naadan-legacy.png",
    players: getRosterForTeam("naadan-legacy")
  },
  teamB: {
    id: "aetrix",
    name: "AETRIX",
    tag: "ATX",
    score: 0,
    mapWins: 0,
    side: "defense", // "defense" or "attack"
    color: "#00f0ff", // Valorant defense cyan
    logo: "/logos/aetrix.png",
    players: getRosterForTeam("aetrix")
  },
  leaderboardVisible: false,
  mvpVisible: false,
  mvpPlayer: {
    name: "DOMINIC TORETTO",
    teamTag: "NDL",
    teamName: "NAADAN LEGACY",
    role: "Captain",
    agent: "Jett",
    photo: "/players/DOMINIC.png",
    logo: "/logos/naadan-legacy.png",
    kills: 22,
    deaths: 9,
    assists: 5,
    acs: 298
  },
  timeout: {
    active: false,
    team: "",
    duration: 60,
    remaining: 60
  },
  casters: [
    { name: "Apex", handle: "@apexcast", role: "Play-by-Play" },
    { name: "Vortex", handle: "@vortex_val", role: "Color Caster" }
  ],
  castersVisible: false,
  veto: [
    { map: "Ascent", status: "PICK", team: "SEN", score: "" },
    { map: "Bind", status: "BAN", team: "FNC", score: "" },
    { map: "Haven", status: "PICK", team: "FNC", score: "" },
    { map: "Lotus", status: "BAN", team: "SEN", score: "" },
    { map: "Sunset", status: "DECIDER", team: "REMAINING", score: "" },
    { map: "Split", status: "BAN", team: "SEN", score: "" },
    { map: "Abyss", status: "BAN", team: "FNC", score: "" }
  ]
};

let state = { ...defaultState };

// Load persistent state if available
try {
  if (fs.existsSync(DATA_FILE)) {
    const rawData = fs.readFileSync(DATA_FILE, 'utf8');
    state = JSON.parse(rawData);
    state.teamsList = TOURNAMENT_TEAMS;
    state.fixturesList = TOURNAMENT_FIXTURES;
    if (!state.teamA.players || state.teamA.players.length === 0) {
      state.teamA.players = getRosterForTeam(state.teamA.id || state.teamA.name);
    }
    if (!state.teamB.players || state.teamB.players.length === 0) {
      state.teamB.players = getRosterForTeam(state.teamB.id || state.teamB.name);
    }
    if (!state.mvpPlayer) {
      state.mvpPlayer = defaultState.mvpPlayer;
    }
    state.leaderboardVisible = typeof state.leaderboardVisible === 'boolean' ? state.leaderboardVisible : false;
    state.mvpVisible = typeof state.mvpVisible === 'boolean' ? state.mvpVisible : false;
    state.castersVisible = typeof state.castersVisible === 'boolean' ? state.castersVisible : false;
    console.log('[Server] Loaded existing match state from disk and verified rosters.');
  } else {
    state.teamsList = TOURNAMENT_TEAMS;
    state.fixturesList = TOURNAMENT_FIXTURES;
    saveStateToDisk();
  }
} catch (err) {
  console.error('[Server] Error loading state file, using defaults:', err.message);
}

function saveStateToDisk() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('[Server] Failed to save state to disk:', err.message);
  }
}

// Broadcast state to all connected WebSocket clients
function broadcast(payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

function broadcastStateUpdate() {
  saveStateToDisk();
  broadcast({ type: 'STATE_UPDATE', state });
}

// Timeout timer handler
let timeoutTimer = null;
function startTimeout(teamTag) {
  if (timeoutTimer) clearInterval(timeoutTimer);
  state.timeout.active = true;
  state.timeout.team = teamTag;
  state.timeout.remaining = state.timeout.duration || 60;
  state.match.statusBanner = `TIMEOUT: ${teamTag || 'TACTICAL'}`;

  broadcastStateUpdate();

  timeoutTimer = setInterval(() => {
    if (state.timeout.remaining > 0) {
      state.timeout.remaining -= 1;
      broadcast({ type: 'TIMEOUT_TICK', remaining: state.timeout.remaining });
    } else {
      stopTimeout();
    }
  }, 1000);
}

function stopTimeout() {
  if (timeoutTimer) {
    clearInterval(timeoutTimer);
    timeoutTimer = null;
  }
  state.timeout.active = false;
  if (state.match.statusBanner.startsWith('TIMEOUT')) {
    state.match.statusBanner = '';
  }
  broadcastStateUpdate();
}

// WebSocket Connection Handling
wss.on('connection', ws => {
  // Send current state immediately on connect
  ws.send(JSON.stringify({ type: 'INIT_STATE', state }));

  ws.on('message', message => {
    try {
      const data = JSON.parse(message);
      handleClientAction(data);
    } catch (err) {
      console.error('[Server] Error handling WS message:', err.message);
    }
  });
});

function handleClientAction(data) {
  const { action, payload } = data;

  switch (action) {
    case 'SET_STATE':
      state = { ...state, ...payload };
      broadcastStateUpdate();
      break;

    case 'UPDATE_MATCH':
      state.match = { ...state.match, ...payload };
      broadcastStateUpdate();
      break;

    case 'LOAD_FIXTURE': {
      const matchNum = parseInt(payload.matchNumber);
      const fix = TOURNAMENT_FIXTURES.find(f => f.matchNumber === matchNum);
      if (fix) {
        const team1 = TOURNAMENT_TEAMS.find(t => t.id === fix.t1) || TOURNAMENT_TEAMS[0];
        const team2 = TOURNAMENT_TEAMS.find(t => t.id === fix.t2) || TOURNAMENT_TEAMS[1];

        state.match.stage = fix.stage;
        state.match.seriesType = fix.bestOf;
        state.match.mapName = fix.map;
        state.match.currentMapIndex = 1;
        state.match.statusBanner = '';

        state.teamA.id = team1.id;
        state.teamA.name = team1.name;
        state.teamA.tag = team1.tag;
        state.teamA.logo = team1.logo;
        state.teamA.score = 0;
        state.teamA.mapWins = 0;
        state.teamA.side = 'attack';
        state.teamA.players = getRosterForTeam(team1.id);

        state.teamB.id = team2.id;
        state.teamB.name = team2.name;
        state.teamB.tag = team2.tag;
        state.teamB.logo = team2.logo;
        state.teamB.score = 0;
        state.teamB.mapWins = 0;
        state.teamB.side = 'defense';
        state.teamB.players = getRosterForTeam(team2.id);

        if (state.teamA.players && state.teamA.players.length > 0) {
          const cap = state.teamA.players.find(p => p.role === 'Captain') || state.teamA.players[0];
          state.mvpPlayer = {
            name: cap.name,
            teamTag: team1.tag,
            teamName: team1.name,
            role: cap.role || 'Captain',
            agent: cap.agent || 'Jett',
            photo: cap.photo,
            logo: team1.logo,
            kills: 0,
            deaths: 0,
            assists: 0,
            acs: 200
          };
        }

        if (state.timeout) {
          state.timeout.active = false;
          state.timeout.team = team1.tag;
        }

        broadcastStateUpdate();
      }
      break;
    }

    case 'UPDATE_TEAM': {
      const { teamKey, updates } = payload;
      if (state[teamKey]) {
        state[teamKey] = { ...state[teamKey], ...updates };
        if (updates.id && (!updates.players || updates.players.length === 0)) {
          state[teamKey].players = getRosterForTeam(updates.id);
        }
        broadcastStateUpdate();
      }
      break;
    }

    case 'INC_ROUND_SCORE': {
      const { teamKey } = payload;
      if (state[teamKey]) {
        state[teamKey].score = Math.max(0, state[teamKey].score + 1);
        checkMatchAlerts();
        broadcastStateUpdate();
      }
      break;
    }

    case 'DEC_ROUND_SCORE': {
      const { teamKey } = payload;
      if (state[teamKey]) {
        state[teamKey].score = Math.max(0, state[teamKey].score - 1);
        checkMatchAlerts();
        broadcastStateUpdate();
      }
      break;
    }

    case 'INC_MAP_SCORE': {
      const { teamKey } = payload;
      if (state[teamKey]) {
        state[teamKey].mapWins = Math.max(0, state[teamKey].mapWins + 1);
        broadcastStateUpdate();
      }
      break;
    }

    case 'DEC_MAP_SCORE': {
      const { teamKey } = payload;
      if (state[teamKey]) {
        state[teamKey].mapWins = Math.max(0, state[teamKey].mapWins - 1);
        broadcastStateUpdate();
      }
      break;
    }

    case 'SWAP_SIDES': {
      const tempSide = state.teamA.side;
      state.teamA.side = state.teamB.side;
      state.teamB.side = tempSide;

      // Swap accent side colors if standard
      if (state.teamA.side === 'attack') {
        state.teamA.color = '#ff4655';
        state.teamB.color = '#00f0ff';
      } else {
        state.teamA.color = '#00f0ff';
        state.teamB.color = '#ff4655';
      }
      broadcastStateUpdate();
      break;
    }

    case 'RESET_ROUNDS':
      state.teamA.score = 0;
      state.teamB.score = 0;
      state.match.statusBanner = '';
      broadcastStateUpdate();
      break;

    case 'START_TIMEOUT':
      startTimeout(payload.team || '');
      break;

    case 'STOP_TIMEOUT':
      stopTimeout();
      break;

    case 'TOGGLE_CASTERS':
      state.castersVisible = typeof payload === 'boolean' ? payload : !state.castersVisible;
      broadcastStateUpdate();
      break;

    case 'UPDATE_CASTERS':
      state.casters = payload;
      broadcastStateUpdate();
      break;

    case 'UPDATE_VETO':
      state.veto = payload;
      broadcastStateUpdate();
      break;

    case 'UPDATE_PLAYER_STAT': {
      const { teamKey, playerId, updates } = payload;
      if (state[teamKey] && Array.isArray(state[teamKey].players)) {
        const player = state[teamKey].players.find(p => p.id === playerId);
        if (player) {
          Object.assign(player, updates);
          // If this player is current MVP, sync stats
          if (state.mvpPlayer && state.mvpPlayer.name === player.name) {
            state.mvpPlayer.kills = player.kills;
            state.mvpPlayer.deaths = player.deaths;
            state.mvpPlayer.assists = player.assists;
            state.mvpPlayer.agent = player.agent;
            if (player.acs) state.mvpPlayer.acs = player.acs;
          }
          broadcastStateUpdate();
        }
      }
      break;
    }

    case 'SET_MVP': {
      state.mvpPlayer = { ...state.mvpPlayer, ...payload };
      broadcastStateUpdate();
      break;
    }

    case 'TOGGLE_LEADERBOARD':
      state.leaderboardVisible = typeof payload === 'boolean' ? payload : !state.leaderboardVisible;
      broadcastStateUpdate();
      break;

    case 'TOGGLE_MVP':
      state.mvpVisible = typeof payload === 'boolean' ? payload : !state.mvpVisible;
      broadcastStateUpdate();
      break;

    case 'RESET_PLAYER_STATS': {
      if (state.teamA && state.teamA.players) {
        state.teamA.players.forEach(p => { p.kills = 0; p.deaths = 0; p.assists = 0; });
      }
      if (state.teamB && state.teamB.players) {
        state.teamB.players.forEach(p => { p.kills = 0; p.deaths = 0; p.assists = 0; });
      }
      if (state.mvpPlayer) {
        state.mvpPlayer.kills = 0;
        state.mvpPlayer.deaths = 0;
        state.mvpPlayer.assists = 0;
      }
      broadcastStateUpdate();
      break;
    }

    case 'RESET_MATCH':
      stopTimeout();
      state = JSON.parse(JSON.stringify(defaultState));
      broadcastStateUpdate();
      break;

    case 'START_TRACKER':
      liveTracker.startTracking((scoreA, scoreB) => {
        console.log(`[AutoTracker] Detected live score: ${scoreA} - ${scoreB}`);
        state.teamA.score = scoreA;
        state.teamB.score = scoreB;
        checkMatchAlerts();
        broadcastStateUpdate();
      }, 2000);
      broadcast({ type: 'TRACKER_STATUS', tracker: liveTracker.getStatus() });
      break;

    case 'STOP_TRACKER':
      liveTracker.stopTracking();
      broadcast({ type: 'TRACKER_STATUS', tracker: liveTracker.getStatus() });
      break;

    case 'SYNC_POST_MATCH': {
      riotTracker.fetchLatestCompletedMatch().then(res => {
        console.log(`[RiotTracker] Auto-imported match ${res.matchId}, Map: ${res.mapName}`);
        if (res.mapName) state.match.mapName = res.mapName;
        
        // Sync players
        const allParsed = res.players || [];
        allParsed.forEach((p, idx) => {
          if (idx < 5 && state.teamA.players[idx]) {
            state.teamA.players[idx].kills = p.kills;
            state.teamA.players[idx].deaths = p.deaths;
            state.teamA.players[idx].assists = p.assists;
            state.teamA.players[idx].agent = p.agent;
            state.teamA.players[idx].acs = p.acs;
          } else if (idx >= 5 && idx < 10 && state.teamB.players[idx - 5]) {
            state.teamB.players[idx - 5].kills = p.kills;
            state.teamB.players[idx - 5].deaths = p.deaths;
            state.teamB.players[idx - 5].assists = p.assists;
            state.teamB.players[idx - 5].agent = p.agent;
            state.teamB.players[idx - 5].acs = p.acs;
          }
        });

        // Set MVP
        if (res.mvp) {
          const isTeamA = allParsed.indexOf(res.mvp) < 5;
          const assignedTeam = isTeamA ? state.teamA : state.teamB;
          const playerObj = assignedTeam.players ? assignedTeam.players[isTeamA ? allParsed.indexOf(res.mvp) : allParsed.indexOf(res.mvp) - 5] : null;
          state.mvpPlayer = {
            name: playerObj ? playerObj.name : (res.mvp.gameName || 'Match MVP'),
            teamTag: assignedTeam.tag,
            teamName: assignedTeam.name,
            role: 'Match MVP',
            agent: res.mvp.agent || 'Jett',
            photo: playerObj ? playerObj.photo : '/players/DOMINIC.png',
            logo: assignedTeam.logo,
            kills: res.mvp.kills,
            deaths: res.mvp.deaths,
            assists: res.mvp.assists,
            acs: res.mvp.acs
          };
        }

        broadcastStateUpdate();
        broadcast({ 
          type: 'MATCH_SYNC_SUCCESS', 
          message: `Imported Match Results! Map: ${res.mapName} · Top Fragger: ${res.mvp ? res.mvp.kills + ' Kills (' + res.mvp.agent + ')' : ''}` 
        });
      }).catch(err => {
        console.error('[RiotTracker] Error syncing match:', err.message);
        broadcast({ type: 'MATCH_SYNC_ERROR', error: err.message });
      });
      break;
    }

    default:
      console.warn('[Server] Unknown action received:', action);
  }
}

function checkMatchAlerts() {
  const a = state.teamA.score;
  const b = state.teamB.score;

  // Overtime detection (12-12+)
  if (a >= 12 && b >= 12) {
    if (a === b) {
      state.match.statusBanner = 'OVERTIME';
    } else if (Math.abs(a - b) === 1) {
      const leading = a > b ? state.teamA.tag : state.teamB.tag;
      state.match.statusBanner = `MATCH POINT - ${leading}`;
    }
  } else if (a === 12 || b === 12) {
    const leader = a === 12 ? state.teamA.tag : state.teamB.tag;
    state.match.statusBanner = `MATCH POINT - ${leader}`;
  } else if (a + b === 12) {
    state.match.statusBanner = 'HALFTIME';
  } else if (!state.timeout.active) {
    state.match.statusBanner = '';
  }
}

// REST Endpoints
app.get('/api/state', (req, res) => {
  res.json(state);
});

app.post('/api/action', (req, res) => {
  handleClientAction(req.body);
  res.json({ success: true, state });
});

app.post('/api/reset', (req, res) => {
  stopTimeout();
  state = JSON.parse(JSON.stringify(defaultState));
  broadcastStateUpdate();
  res.json({ success: true, state });
});

app.get('/api/tracker/status', (req, res) => {
  res.json(liveTracker.getStatus());
});

app.post('/api/tracker/start', (req, res) => {
  handleClientAction({ action: 'START_TRACKER' });
  res.json({ success: true, tracker: liveTracker.getStatus() });
});

app.post('/api/tracker/stop', (req, res) => {
  handleClientAction({ action: 'STOP_TRACKER' });
  res.json({ success: true, tracker: liveTracker.getStatus() });
});

// Explicit routes for admin panel (handles both /admin and /admin/ cleanly)
app.get(['/admin', '/admin/'], (req, res) => {
  const adminHtml = path.join(__dirname, 'public', 'admin', 'index.html');
  if (fs.existsSync(adminHtml)) {
    return res.sendFile(adminHtml);
  }
  res.status(404).send(`
    <!DOCTYPE html>
    <html>
    <head><title>Admin Panel Missing</title><style>body{font-family:sans-serif;background:#0d1117;color:#e6edf3;padding:40px;line-height:1.6;}code{background:#161b22;padding:3px 6px;border-radius:4px;color:#58a6ff;}</style></head>
    <body>
      <h2 style="color:#ff4655;">⚠️ Missing 'public' Directory</h2>
      <p>The server could not locate <code>public/admin/index.html</code>.</p>
      <p><b>How to fix:</b></p>
      <ol>
        <li>Make sure you extracted the complete ZIP file (do not run <code>server.js</code> alone).</li>
        <li>Verify that the <code>public</code> folder exists right next to <code>server.js</code>.</li>
      </ol>
    </body>
    </html>
  `);
});

// Explicit routes for overlays
app.get('/overlays/:name', (req, res) => {
  const overlayHtml = path.join(__dirname, 'public', 'overlays', req.params.name, 'index.html');
  if (fs.existsSync(overlayHtml)) {
    return res.sendFile(overlayHtml);
  }
  res.status(404).send(`Overlay "${req.params.name}" not found in public/overlays/`);
});

// Root redirects to operator dashboard
app.get('/', (req, res) => {
  res.redirect('/admin');
});

server.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(` VALORANT TOURNAMENT OVERLAY SERVER RUNNING!   `);
  console.log(`-------------------------------------------------`);
  console.log(` Operator Control Panel: http://localhost:${PORT}/admin`);
  console.log(` OBS Scoreboard Overlay: http://localhost:${PORT}/overlays/scoreboard`);
  console.log(` OBS Pick/Ban Veto View: http://localhost:${PORT}/overlays/veto`);
  console.log(` OBS Caster Lower Third: http://localhost:${PORT}/overlays/casters`);
  console.log(` OBS Versus / Pre-Match: http://localhost:${PORT}/overlays/versus`);
  console.log(`=================================================`);
});
