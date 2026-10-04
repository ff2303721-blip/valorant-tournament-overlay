const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const liveTracker = require('./liveTracker');
const riotTracker = require('./riotMatchTracker');
const tournamentPoller = require('./tournamentPoller');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'match_state.json');

app.use(express.json({ limit: '10mb' }));

// API routes - disable caching so live overlay state updates reflect instantly
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Static assets (logos, player photos, images, CSS, JS) - enable browser caching
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true
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
  { matchNumber: 1, label: "M1: VRN vs NDL (Bind · Fri 2 Oct, 9:00 PM IST)", stage: "Group Stage · Week 1", t1: "veyron", t2: "naadan-legacy", map: "Bind", bestOf: "BO1", side1: "defense", side2: "attack", time: "Fri 2 Oct, 9:00 PM IST (21:00)" },
  { matchNumber: 2, label: "M2: ATX vs BBZ (Abyss · Fri 2 Oct, 10:00 PM IST)", stage: "Group Stage · Week 1", t1: "aetrix", t2: "bitter-blade-z", map: "Abyss", bestOf: "BO1", side1: "defense", side2: "attack", time: "Fri 2 Oct, 10:00 PM IST (22:00)" },
  { matchNumber: 3, label: "M3: ATX vs BBZ (Bind · Sat 3 Oct, 9:00 PM IST)", stage: "Group Stage · Week 1", t1: "aetrix", t2: "bitter-blade-z", map: "Bind", bestOf: "BO1", side1: "defense", side2: "attack", time: "Sat 3 Oct, 9:00 PM IST (21:00)" },
  { matchNumber: 4, label: "M4: BBZ vs NDL (Corrode · Sat 3 Oct, 10:00 PM IST)", stage: "Group Stage · Week 1", t1: "bitter-blade-z", t2: "naadan-legacy", map: "Corrode", bestOf: "BO1", side1: "defense", side2: "attack", time: "Sat 3 Oct, 10:00 PM IST (22:00)" },
  { matchNumber: 5, label: "M5: NDL vs BBZ (Pearl · Sun 4 Oct, 9:00 PM IST)", stage: "Group Stage · Week 1", t1: "naadan-legacy", t2: "bitter-blade-z", map: "Pearl", bestOf: "BO1", side1: "defense", side2: "attack", time: "Sun 4 Oct, 9:00 PM IST (21:00)" },
  { matchNumber: 6, label: "M6: VRN vs NDL (Bind · Sat 10 Oct, 10:00 PM IST)", stage: "Group Stage · Week 2", t1: "veyron", t2: "naadan-legacy", map: "Bind", bestOf: "BO1", side1: "defense", side2: "attack", time: "Sat 10 Oct, 10:00 PM IST (22:00)" },
  { matchNumber: 7, label: "M7: VRN vs ATX (Ascent · Sun 11 Oct, 9:00 PM IST)", stage: "Group Stage · Week 2", t1: "veyron", t2: "aetrix", map: "Ascent", bestOf: "BO1", side1: "defense", side2: "attack", time: "Sun 11 Oct, 9:00 PM IST (21:00)" },
  { matchNumber: 8, label: "M8: VRN vs ATX (Breeze · Sun 11 Oct, 11:00 PM IST)", stage: "Group Stage · Week 2", t1: "veyron", t2: "aetrix", map: "Breeze", bestOf: "BO1", side1: "attack", side2: "defense", time: "Sun 11 Oct, 11:00 PM IST (23:00)" },
  { matchNumber: 9, label: "M9: BBZ vs VRN (Split · Mon 12 Oct, 9:00 PM IST)", stage: "Group Stage · Week 3", t1: "bitter-blade-z", t2: "veyron", map: "Split", bestOf: "BO1", side1: "defense", side2: "attack", time: "Mon 12 Oct, 9:00 PM IST (21:00)" },
  { matchNumber: 10, label: "M10: VRN vs BBZ (Bind · Mon 12 Oct, 10:00 PM IST)", stage: "Group Stage · Week 2", t1: "veyron", t2: "bitter-blade-z", map: "Bind", bestOf: "BO1", side1: "defense", side2: "attack", time: "Mon 12 Oct, 10:00 PM IST (22:00)" },
  { matchNumber: 11, label: "M11: ATX vs NDL (Corrode · Sat 17 Oct, 9:00 PM IST)", stage: "Group Stage · Week 3", t1: "aetrix", t2: "naadan-legacy", map: "Corrode", bestOf: "BO1", side1: "defense", side2: "attack", time: "Sat 17 Oct, 9:00 PM IST (21:00)" },
  { matchNumber: 12, label: "M12: ATX vs NDL (Corrode · Sun 18 Oct, 9:00 PM IST)", stage: "Group Stage · Week 1", t1: "aetrix", t2: "naadan-legacy", map: "Corrode", bestOf: "BO1", side1: "defense", side2: "attack", time: "Sun 18 Oct, 9:00 PM IST (21:00)" },
  { matchNumber: 13, label: "M13: Qualifier 1 (Seed 1 vs 2 · Sat 24 Oct, 9:00 PM IST)", stage: "Playoffs: Qualifier 1", t1: "tbd", t2: "tbd", map: "TBD", bestOf: "BO3", side1: "defense", side2: "attack", time: "Sat 24 Oct, 9:00 PM IST (21:00)" },
  { matchNumber: 14, label: "M14: Eliminator (Seed 3 vs 4 · Sat 24 Oct, 9:30 PM IST)", stage: "Playoffs: Eliminator", t1: "tbd", t2: "tbd", map: "TBD", bestOf: "BO3", side1: "defense", side2: "attack", time: "Sat 24 Oct, 9:30 PM IST (21:30)" },
  { matchNumber: 15, label: "M15: Qualifier 2 (Sun 25 Oct, 9:00 PM IST)", stage: "Playoffs: Qualifier 2", t1: "tbd", t2: "tbd", map: "TBD", bestOf: "BO3", side1: "defense", side2: "attack", time: "Sun 25 Oct, 9:00 PM IST (21:00)" },
  { matchNumber: 16, label: "M16: Grand Final (Sat 31 Oct, 10:00 PM IST)", stage: "Grand Final", t1: "tbd", t2: "tbd", map: "TBD", bestOf: "BO3", side1: "attack", side2: "defense", time: "Sat 31 Oct, 10:00 PM IST (22:00)" }
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

function normalizeStr(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findRosterPlayerAcrossAll(name) {
  const norm = normalizeStr(name);
  for (const teamKey of Object.keys(TOURNAMENT_ROSTERS)) {
    const list = TOURNAMENT_ROSTERS[teamKey];
    const found = list.find(p => {
      const n = normalizeStr(p.name);
      return n === norm || n.includes(norm) || norm.includes(n);
    });
    if (found) return { player: found, teamId: teamKey };
  }
  return null;
}

function applyMatchResultToState(result) {
  if (!result) return false;
  const { fixtureMatchNumber, score1, score2, team1Tag, team2Tag, winner, map, players } = result;

  // Align scores with current state.teamA and state.teamB if tags are known
  const curTagA = normalizeStr(state.teamA ? state.teamA.tag : '');
  const curTagB = normalizeStr(state.teamB ? state.teamB.tag : '');
  const rTag1 = normalizeStr(team1Tag);
  const rTag2 = normalizeStr(team2Tag);

  if (curTagA && curTagB && rTag1 && rTag2) {
    if (curTagA === rTag2 && curTagB === rTag1) {
      state.teamA.score = score2;
      state.teamB.score = score1;
    } else {
      state.teamA.score = score1;
      state.teamB.score = score2;
    }
  } else {
    state.teamA.score = score1;
    state.teamB.score = score2;
  }

  if (winner) {
    state.match.statusBanner = `${winner} WINS!`;
  } else {
    state.match.statusBanner = 'FINAL';
  }

  // Update players combat stats strictly to their corresponding team
  if (Array.isArray(players) && players.length > 0) {
    const normCurTagA = normalizeStr(state.teamA ? state.teamA.tag : '');
    const normCurTagB = normalizeStr(state.teamB ? state.teamB.tag : '');

    players.forEach(p => {
      const normName = normalizeStr(p.name);
      const pTeamTag = normalizeStr(p.teamTag);

      // Target the team that matches p.teamTag (or both if teamTag is not specified)
      const targetTeams = [];
      if (pTeamTag) {
        if (normCurTagA === pTeamTag) targetTeams.push(state.teamA);
        else if (normCurTagB === pTeamTag) targetTeams.push(state.teamB);
      }
      if (targetTeams.length === 0) {
        targetTeams.push(state.teamA, state.teamB);
      }

      targetTeams.forEach(team => {
        if (team && Array.isArray(team.players)) {
          const found = team.players.find(pl => {
            const n = normalizeStr(pl.name);
            return n === normName || n.includes(normName) || normName.includes(n);
          });
          if (found) {
            found.kills = p.kills;
            found.deaths = p.deaths;
            found.assists = p.assists;
            found.acs = p.acs;
            if (p.adr !== undefined) found.adr = p.adr;
            if (p.hs !== undefined) found.hs = p.hs;
            if (p.agent) found.agent = p.agent;
          }
        }
      });
    });

    // Auto-pick MVP from isMatchMvp badge or highest ACS in this match
    const matchMvpPlayer = players.find(p => p.isMatchMvp);
    const sorted = [...players].sort((a, b) => (b.acs || 0) - (a.acs || 0));
    const top = matchMvpPlayer || sorted[0];

    if (top) {
      const normTop = normalizeStr(top.name);
      const topTeamTag = normalizeStr(top.teamTag);
      const catalogInfo = findRosterPlayerAcrossAll(top.name);

      let assignedTeam = null;
      let rosterPlayer = null;

      // 1. Try finding in current teamA or teamB matching team tag if available
      const teamsToCheck = [];
      if (topTeamTag === normCurTagA) teamsToCheck.push(state.teamA, state.teamB);
      else if (topTeamTag === normCurTagB) teamsToCheck.push(state.teamB, state.teamA);
      else teamsToCheck.push(state.teamA, state.teamB);

      teamsToCheck.forEach(team => {
        if (team && Array.isArray(team.players) && !rosterPlayer) {
          const pl = team.players.find(p => {
            const n = normalizeStr(p.name);
            return n === normTop || n.includes(normTop) || normTop.includes(n);
          });
          if (pl) {
            assignedTeam = team;
            rosterPlayer = pl;
          }
        }
      });

      // 2. If not found in current loaded teams, try matching team tag or catalog
      if (!assignedTeam) {
        if (topTeamTag && normCurTagA === topTeamTag) {
          assignedTeam = state.teamA;
        } else if (topTeamTag && normCurTagB === topTeamTag) {
          assignedTeam = state.teamB;
        } else if (catalogInfo) {
          const matchedTeamObj = TOURNAMENT_TEAMS.find(t => t.id === catalogInfo.teamId);
          if (matchedTeamObj) {
            assignedTeam = {
              tag: matchedTeamObj.tag,
              name: matchedTeamObj.name,
              logo: matchedTeamObj.logo,
              players: TOURNAMENT_ROSTERS[catalogInfo.teamId] || []
            };
          }
        }
      }

      if (!assignedTeam) assignedTeam = state.teamA;
      if (!rosterPlayer && catalogInfo) rosterPlayer = catalogInfo.player;

      const mvpPhoto = (rosterPlayer && rosterPlayer.photo) || (catalogInfo && catalogInfo.player.photo) || '/players/DOMINIC.png';
      const mvpLogo = (assignedTeam && assignedTeam.logo) || state.teamA.logo;
      const mvpTeamTag = (assignedTeam && assignedTeam.tag) || (catalogInfo ? catalogInfo.player.id.split('-')[0].toUpperCase() : state.teamA.tag);
      const mvpTeamName = (assignedTeam && assignedTeam.name) || state.teamA.name;

      state.mvpPlayer = {
        name: rosterPlayer ? rosterPlayer.name : top.name,
        teamTag: mvpTeamTag,
        teamName: mvpTeamName,
        role: 'Match MVP',
        agent: top.agent || (rosterPlayer ? rosterPlayer.agent : 'Jett'),
        photo: mvpPhoto,
        logo: mvpLogo,
        kills: top.kills,
        deaths: top.deaths,
        assists: top.assists,
        acs: top.acs,
        adr: top.adr,
        hs: top.hs,
      };
      console.log(`[Server] ⭐ Match MVP set to: ${state.mvpPlayer.name} (${state.mvpPlayer.teamTag}) — ACS ${top.acs}, K/D/A: ${top.kills}/${top.deaths}/${top.assists}`);
    }
  }

  return true;
}

const MONTH_MAP = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

function populateFixtureTeams(fix) {
  if (!fix) return null;
  const team1 = TOURNAMENT_TEAMS.find(t => t.id === fix.t1) || { id: fix.t1, name: (fix.t1 || '').toUpperCase(), tag: (fix.t1 || '').toUpperCase().slice(0, 3), logo: '' };
  const team2 = TOURNAMENT_TEAMS.find(t => t.id === fix.t2) || { id: fix.t2, name: (fix.t2 || '').toUpperCase(), tag: (fix.t2 || '').toUpperCase().slice(0, 3), logo: '' };

  let startTimeMs = null;
  let isoString = null;
  if (fix.time) {
    const dm = fix.time.match(/(\d{1,2})\s+([A-Za-z]{3})/);
    const tm = fix.time.match(/\((\d{1,2}):(\d{2})\)/);
    if (dm && tm) {
      const now = new Date();
      const currentYear = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric' });
      const day = String(parseInt(dm[1], 10)).padStart(2, '0');
      const mIdx = MONTH_MAP[dm[2]] !== undefined ? MONTH_MAP[dm[2]] + 1 : 10;
      const monthStr = String(mIdx).padStart(2, '0');
      const hour = String(parseInt(tm[1], 10)).padStart(2, '0');
      const min = String(parseInt(tm[2], 10)).padStart(2, '0');
      isoString = `${currentYear}-${monthStr}-${day}T${hour}:${min}:00+05:30`;
      startTimeMs = new Date(isoString).getTime();
    }
  }

  return {
    ...fix,
    team1,
    team2,
    startTimeMs,
    startTimeIso: isoString
  };
}

function getTodayFixtures() {
  const now = new Date();
  const day = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', day: 'numeric' });
  const month = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', month: 'short' });
  const targetDateStr = `${day} ${month}`; // e.g. "3 Oct"

  // 1. Matches strictly scheduled today in IST
  let matches = TOURNAMENT_FIXTURES
    .filter(f => f.time && f.time.includes(targetDateStr))
    .map(populateFixtureTeams);

  // 2. If no matches scheduled today (e.g. rest day or past schedule), find next upcoming matches
  let isToday = true;
  if (matches.length === 0) {
    isToday = false;
    const nowMs = now.getTime();
    const upcoming = TOURNAMENT_FIXTURES
      .map(populateFixtureTeams)
      .filter(f => f.startTimeMs && f.startTimeMs >= nowMs - (2 * 60 * 60 * 1000))
      .sort((a, b) => a.startTimeMs - b.startTimeMs);

    matches = upcoming.length > 0 ? upcoming.slice(0, 2) : TOURNAMENT_FIXTURES.slice(0, 2).map(populateFixtureTeams);
  }

  // Active / featured match for starting soon:
  // If match 1 has already completed (result recorded), pick match 2
  let activeMatch = matches[0] || null;
  if (matches.length > 1 && state && state.completedResults) {
    if (state.completedResults[matches[0].matchNumber]) {
      activeMatch = matches[1];
    }
  }

  return {
    isToday,
    dateString: targetDateStr,
    currentIst: now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
    activeMatch,
    matches
  };
}

// Default Valorant Competitive State
const defaultState = {
  match: {
    title: "VALORANT TOURNAMENT",
    stage: "Group Stage",
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
  mvpType: 'map', // 'map' or 'match'
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
    { name: "SRB TROLLERS", handle: "@srbtrollersyt", role: "Play-by-Play" },
    { name: "SHEIKH KUNJAPPU", handle: "@sheikh_kunjappu", role: "Color Caster" }
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
    if (!state.casters || state.casters.length === 0) {
      state.casters = defaultState.casters;
    }
    state.leaderboardVisible = typeof state.leaderboardVisible === 'boolean' ? state.leaderboardVisible : false;
    state.mvpVisible = typeof state.mvpVisible === 'boolean' ? state.mvpVisible : false;
    state.castersVisible = typeof state.castersVisible === 'boolean' ? state.castersVisible : false;

    // If state has an active match or fixture with a known completed result and score is 0-0, apply it
    const activeFixtureNum = state.match ? state.match.fixtureMatchNumber : null;
    if (activeFixtureNum && state.completedResults && state.completedResults[activeFixtureNum]) {
      if (state.teamA.score === 0 && state.teamB.score === 0) {
        applyMatchResultToState(state.completedResults[activeFixtureNum]);
      }
    }

    saveStateToDisk();
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
  // Send current state and today's auto-resolved fixtures immediately on connect
  ws.send(JSON.stringify({ 
    type: 'INIT_STATE', 
    state,
    todayFixtures: getTodayFixtures()
  }));

  ws.on('message', message => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'GET_TODAY_FIXTURES') {
        ws.send(JSON.stringify({ type: 'TODAY_FIXTURES_UPDATE', todayFixtures: getTodayFixtures() }));
        return;
      }
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
        state.match.fixtureMatchNumber = matchNum;

        state.teamA.id = team1.id;
        state.teamA.name = team1.name;
        state.teamA.tag = team1.tag;
        state.teamA.logo = team1.logo;
        state.teamA.score = 0;
        state.teamA.mapWins = 0;
        state.teamA.side = fix.side1 || 'attack';
        state.teamA.color = state.teamA.side === 'attack' ? '#ff4655' : '#00f0ff';
        state.teamA.players = getRosterForTeam(team1.id);

        state.teamB.id = team2.id;
        state.teamB.name = team2.name;
        state.teamB.tag = team2.tag;
        state.teamB.logo = team2.logo;
        state.teamB.score = 0;
        state.teamB.mapWins = 0;
        state.teamB.side = fix.side2 || 'defense';
        state.teamB.color = state.teamB.side === 'attack' ? '#ff4655' : '#00f0ff';
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

        // Auto-apply saved tournament result if already completed!
        if (state.completedResults && state.completedResults[matchNum]) {
          applyMatchResultToState(state.completedResults[matchNum]);
        }

        saveStateToDisk();
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

    case 'SET_MVP_TYPE': {
      state.mvpType = payload === 'match' ? 'match' : 'map';
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
      }).catch(async (err) => {
        console.warn('[RiotTracker] Riot sync error, attempting tournament site poller sync:', err.message);
        try {
          await tournamentPoller.pollNow();
          let matchNum = parseInt(payload && (payload.fixtureMatchNumber || payload.matchNumber)) || state.match.fixtureMatchNumber;
          if (!matchNum && state.completedResults) {
            const availableNums = Object.keys(state.completedResults).map(n => parseInt(n, 10)).sort((a,b) => b - a);
            if (availableNums.length > 0) matchNum = availableNums[0];
          }
          if (!matchNum) matchNum = 1;

          if (state.completedResults && state.completedResults[matchNum]) {
            state.match.fixtureMatchNumber = matchNum;
            applyMatchResultToState(state.completedResults[matchNum]);
            saveStateToDisk();
            broadcastStateUpdate();
            broadcast({
              type: 'MATCH_SYNC_SUCCESS',
              message: `Imported Match ${matchNum} Results from Tournament Site! Winner: ${state.completedResults[matchNum].winner || ''}`
            });
            return;
          }
        } catch (pollErr) {
          console.error('[Poller] Fallback poll error:', pollErr.message);
        }
        broadcast({ type: 'MATCH_SYNC_ERROR', error: 'No completed match result found on tournament site or Riot client.' });
      });
      break;
    }

    case 'APPLY_FIXTURE_RESULT': {
      const matchNum = parseInt(payload.fixtureMatchNumber || payload.matchNumber);
      if (state.completedResults && state.completedResults[matchNum]) {
        applyMatchResultToState(state.completedResults[matchNum]);
        saveStateToDisk();
        broadcastStateUpdate();
      }
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

app.get('/api/fixtures/today', (req, res) => {
  res.json(getTodayFixtures());
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

// ── Tournament Result Auto-Poller API ───────────────────────────
app.get('/api/poller/status', (req, res) => {
  res.json(tournamentPoller.getStatus());
});

app.post('/api/poller/start', (req, res) => {
  startTournamentPoller();
  res.json({ success: true, status: tournamentPoller.getStatus() });
});

app.post('/api/poller/stop', (req, res) => {
  tournamentPoller.stop();
  res.json({ success: true, status: tournamentPoller.getStatus() });
});

app.post('/api/poller/poll-now', async (req, res) => {
  try {
    await tournamentPoller.pollNow();
    res.json({ success: true, status: tournamentPoller.getStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
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

// ── Tournament Poller: handles new result from site ───────────────
function handlePollerResult(result) {
  const { fixtureMatchNumber, score1, score2, team1Tag, team2Tag, winner, map, importedAt } = result;

  // Store in state.completedResults keyed by matchNumber
  if (!state.completedResults) state.completedResults = {};
  state.completedResults[fixtureMatchNumber] = {
    score1, score2, team1Tag, team2Tag, winner, map, players: result.players, importedAt,
  };

  // Determine if this result corresponds to currently loaded match:
  // 1. Matched by fixtureMatchNumber
  // 2. OR map and team tags match current teamA and teamB
  const curMap = normalizeStr(state.match ? state.match.mapName : '');
  const resMap = normalizeStr(map);
  const tagA = normalizeStr(state.teamA ? state.teamA.tag : '');
  const tagB = normalizeStr(state.teamB ? state.teamB.tag : '');
  const resTag1 = normalizeStr(team1Tag);
  const resTag2 = normalizeStr(team2Tag);

  const isCurrentFixture = state.match && state.match.fixtureMatchNumber === fixtureMatchNumber;
  const teamsMatch = (tagA === resTag1 && tagB === resTag2) || (tagA === resTag2 && tagB === resTag1);
  const isCurrentMatchByContext = teamsMatch && (!curMap || curMap === resMap);

  if (isCurrentFixture || isCurrentMatchByContext) {
    if (!state.match.fixtureMatchNumber) {
      state.match.fixtureMatchNumber = fixtureMatchNumber;
    }
    if (map) state.match.mapName = map;
    applyMatchResultToState(state.completedResults[fixtureMatchNumber]);
    console.log(`[Poller] 🏆 Auto-applied live score & player stats for M${fixtureMatchNumber}: ${score1}-${score2}`);
  }

  // Broadcast result event to all connected clients (overlays + admin)
  broadcast({
    type: 'TOURNAMENT_RESULT',
    fixtureMatchNumber, score1, score2,
    team1Tag, team2Tag, winner, map, importedAt,
  });

  saveStateToDisk();
  broadcastStateUpdate();
  console.log(`[Poller] 📡 Broadcast TOURNAMENT_RESULT for M${fixtureMatchNumber}`);
}

// ── Tournament Poller: auto-update player stats & MVP ────────────
function handlePollerStats(statsArray) {
  if (!statsArray || statsArray.length === 0) return;

  let updated = 0;

  // Helper: fuzzy name match (lowercase, ignore spaces/special chars)
  function normalize(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // Update players in both rosters
  const rosters = [
    { team: state.teamA, players: state.teamA.players },
    { team: state.teamB, players: state.teamB.players },
  ];

  for (const stat of statsArray) {
    const normStat = normalize(stat.name);
    const statTeamTag = normalize(stat.teamTag);
    for (const { team, players } of rosters) {
      if (!Array.isArray(players)) continue;
      if (statTeamTag && normalize(team.tag) && statTeamTag !== normalize(team.tag)) continue;
      const player = players.find(p => normalize(p.name) === normStat ||
        normalize(p.name).includes(normStat) ||
        normStat.includes(normalize(p.name)));
      if (player) {
        if (stat.kills !== undefined) player.kills = stat.kills;
        if (stat.deaths !== undefined) player.deaths = stat.deaths;
        if (stat.assists !== undefined) player.assists = stat.assists;
        if (stat.acs !== undefined) player.acs = stat.acs;
        if (stat.adr !== undefined) player.adr = stat.adr;
        if (stat.hs !== undefined) player.hs = stat.hs;
        if (stat.kd !== undefined) player.kd = stat.kd;
        updated++;
      }
    }
  }

  if (updated === 0) {
    console.log('[Poller] 📊 Stats received but no roster matches found yet.');
    return;
  }

  // Auto-pick MVP only if no match MVP is currently established
  if (!state.mvpPlayer || !state.mvpPlayer.acs || state.mvpPlayer.acs === 0) {
    const allPlayers = [
      ...(state.teamA.players || []).map(p => ({ ...p, teamTag: state.teamA.tag, teamName: state.teamA.name, logo: state.teamA.logo })),
      ...(state.teamB.players || []).map(p => ({ ...p, teamTag: state.teamB.tag, teamName: state.teamB.name, logo: state.teamB.logo })),
    ].filter(p => p.acs > 0);

    if (allPlayers.length > 0) {
      const mvp = allPlayers.reduce((best, p) => p.acs > best.acs ? p : best, allPlayers[0]);
      state.mvpPlayer = {
        name: mvp.name,
        teamTag: mvp.teamTag,
        teamName: mvp.teamName,
        role: mvp.role || 'Player',
        agent: mvp.agent || '',
        photo: mvp.photo || '',
        logo: mvp.logo || '',
        kills: mvp.kills || 0,
        deaths: mvp.deaths || 0,
        assists: mvp.assists || 0,
        acs: mvp.acs || 0,
      };
      console.log(`[Poller] ⭐ Auto-MVP (Stats Fallback): ${mvp.name} (${mvp.teamTag}) — ACS ${mvp.acs}`);
    }
  }

  saveStateToDisk();
  broadcastStateUpdate();

  // Also send a dedicated stats event so the admin can show a toast
  broadcast({
    type: 'STATS_UPDATE',
    playersUpdated: updated,
    totalPlayers: statsArray.length,
    mvp: state.mvpPlayer,
    importedAt: new Date().toISOString(),
  });

  console.log(`[Poller] 📊 Updated ${updated} player(s) in roster from site stats.`);
}

function startTournamentPoller() {
  tournamentPoller.start(
    handlePollerResult,
    (statusUpdate) => broadcast({ type: 'POLLER_STATUS', ...statusUpdate }),
    handlePollerStats
  );
}

server.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(` VALORANT TOURNAMENT OVERLAY SERVER RUNNING!   `);
  console.log(`-------------------------------------------------`);
  console.log(` Operator Control Panel: http://localhost:${PORT}/admin`);
  console.log(` OBS Scoreboard Overlay: http://localhost:${PORT}/overlays/scoreboard`);
  console.log(` OBS Caster Lower Third: http://localhost:${PORT}/overlays/casters`);
  console.log(` OBS Versus / Pre-Match: http://localhost:${PORT}/overlays/versus`);
  console.log(` OBS Starting Soon:      http://localhost:${PORT}/overlays/starting-soon`);
  console.log(`=================================================`);

  // Auto-start the tournament result poller (polls every 2 min)
  startTournamentPoller();
});
