/**
 * tournamentPoller.js
 * ─────────────────────────────────────────────────────────
 * Auto-polls tournament.xmdofficial.in every 30 seconds and
 * imports completed match results & player combat stats into
 * the overlay server state.
 */

const https = require('https');

// Site match slug → our fixture matchNumber
// On tournament.xmdofficial.in, the matches are at /matches/match-1 through /matches/match-16
const SITE_SLUG_TO_FIXTURE = {
  'match-1':  1,   // M1: VRN vs NDL (Bind)
  'match-2':  2,   // M2: ATX vs BBZ (Abyss)
  'match-3':  3,   // M3: ATX vs BBZ (Bind)
  'match-4':  4,   // M4: BBZ vs NDL (Corrode)
  'match-5':  5,   // M5: NDL vs BBZ (Pearl)
  'match-6':  6,   // M6: ATX vs NDL (Corrode)
  'match-7':  7,   // M7: BBZ vs VRN (Split)
  'match-8':  8,   // M8: VRN vs ATX (Ascent)
  'match-9':  9,   // M9: VRN vs NDL (Bind)
  'match-10': 10,  // M10: VRN vs BBZ (Bind)
  'match-11': 11,  // M11: VRN vs ATX (Breeze)
  'match-12': 12,  // M12: BBZ vs ATX (Bind)
  'match-13': 13,  // M13: Qualifier 1
  'match-14': 14,  // M14: Eliminator
  'match-15': 15,  // M15: Qualifier 2
  'match-16': 16,  // M16: Grand Final
};

const POLL_INTERVAL_MS = 30 * 1000; // 30 seconds
const BASE_URL = 'https://tournament.xmdofficial.in';

let pollTimer = null;
let isPolling = false;
let lastKnownResults = {}; // matchSlug → { score1, score2 }
let onResultCallback = null;
let onStatusCallback = null;
let onStatsCallback = null;
let lastStatsHash = '';

// ── HTTP fetch helper ────────────────────────────────────────────
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    };
    https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// ── Parse a match page from Next.js RSC ───────────────────────────
function parseMatchPage(html, matchSlug) {
  const result = {
    matchSlug,
    completed: false,
    score1: 0,
    score2: 0,
    team1Tag: null,
    team2Tag: null,
    map: null,
    winner: null,
    players: [],
  };

  const rscPushes = [...html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g)].map(x => x[1]);
  const fullRSC = rscPushes.join('').replace(/\\"/g, '"').replace(/\\n/g, '\n');

  if (fullRSC.includes('"Final"') || fullRSC.includes('Winner')) {
    result.completed = true;
  }

  // 1. Extract Map round score (e.g., VRN 13 - 8 NDL)
  const scoreRegex = /"children":"([A-Z]{2,4})"\}\],\["\$","span",null,\{[^}]*"children":(\d+)\}\],\["\$","span",null,\{[^}]*"children":"[–-]"\}[^\]]*\],\["\$","span",null,\{[^}]*"children":(\d+)\}\],\["\$","span",null,\{[^}]*"children":"([A-Z]{2,4})"/;
  const matchScore = fullRSC.match(scoreRegex);
  if (matchScore) {
    result.team1Tag = matchScore[1];
    result.score1 = parseInt(matchScore[2], 10);
    result.score2 = parseInt(matchScore[3], 10);
    result.team2Tag = matchScore[4];
    if (result.score1 > 0 || result.score2 > 0) {
      result.completed = true;
    }
  }

  // Fallback: Check overall series match score (e.g. 1 : 0)
  if (result.score1 === 0 && result.score2 === 0) {
    const seriesScoreMatch = fullRSC.match(/"className":"match-intro-center[^"]*","children":\[(\d+),\["\$","span",null,\{[^}]*"children":":"\}\],(\d+)\]/);
    if (seriesScoreMatch) {
      const s1 = parseInt(seriesScoreMatch[1], 10);
      const s2 = parseInt(seriesScoreMatch[2], 10);
      if (s1 > 0 || s2 > 0) {
        result.completed = true;
      }
    }
  }

  // 2. Extract Map Name
  const mapRegex = /"className":"title-page","children":"([^"]+)"/;
  const mapMatch = fullRSC.match(mapRegex);
  if (mapMatch) result.map = mapMatch[1];

  // 3. Extract Winner
  const winnerRegex = /"className":"heading text-xl sm:text-3xl text-win","children":"([^"]+)"/;
  const winMatch = fullRSC.match(winnerRegex);
  if (winMatch) {
    result.winner = winMatch[1];
  } else if (result.completed && result.score1 !== result.score2) {
    result.winner = result.score1 > result.score2 ? result.team1Tag : result.team2Tag;
  }

  // 4. Extract Per-Player Combat Stats from match scoreboard tables (Team 1 and Team 2)
  function extractChildrenArray(str, startIndex) {
    let depth = 0;
    let inString = false;
    let escape = false;
    let startPos = -1;

    for (let i = startIndex; i < str.length; i++) {
      const ch = str[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (ch === '[') {
          if (depth === 0) startPos = i;
          depth++;
        } else if (ch === ']') {
          depth--;
          if (depth === 0) {
            return str.substring(startPos, i + 1);
          }
        }
      }
    }
    return null;
  }

  // 1. Build dictionary of all slot references
  const slots = {};
  const lines = fullRSC.split('\n');
  for (const line of lines) {
    const sm = line.match(/^([0-9a-f]+):(.*)$/);
    if (sm) {
      slots[sm[1]] = sm[2].trim();
    }
  }

  function resolveSlots(text, depth = 0) {
    if (depth > 6) return text;
    return text.replace(/"\$L([0-9a-f]+)"/g, (match, slotId) => {
      if (slots[slotId]) {
        return resolveSlots(slots[slotId], depth + 1);
      }
      return match;
    });
  }

  // Find the two table bodies
  const marker = '"className":"divide-y divide-line","children":';
  let pos = 0;
  const tableBodies = [];
  while ((pos = fullRSC.indexOf(marker, pos)) !== -1) {
    const childrenStart = pos + marker.length;
    const childrenArrayStr = extractChildrenArray(fullRSC, childrenStart);
    if (childrenArrayStr) {
      tableBodies.push(childrenArrayStr);
    }
    pos = childrenStart + 1;
  }

  function parsePlayersFromTbody(tbodyStr, teamTag) {
    if (!tbodyStr) return [];
    const resolved = resolveSlots(tbodyStr);
    const players = [];
    const trRegex = /\["\$","tr","([^"#]+)#([^"-]+)-([^"]+)",\{"className":"[^"]*"/g;
    let tm;
    while ((tm = trRegex.exec(resolved)) !== null) {
      const name = tm[1];
      const riotTag = tm[2];
      const agent = tm[3];
      const startIdx = tm.index;

      const nextTrMatch = resolved.substring(startIdx + 10).search(/\["\$","tr",/);
      const endIdx = nextTrMatch !== -1 ? startIdx + 10 + nextTrMatch : resolved.length;
      const playerChunk = resolved.substring(startIdx, endIdx);

      const directPattern = /\["\$","td",null,\{"className":"stat-cell[^"]*","children":([^}]+)\}\]/g;
      const directVals = [];
      let dm;
      while ((dm = directPattern.exec(playerChunk)) !== null) {
        let val = dm[1].trim();
        try { val = JSON.parse(val); } catch (e) {}
        directVals.push(val);
        if (directVals.length === 7) break;
      }

      const isMatchMvp = playerChunk.includes('MATCH MVP') || playerChunk.includes('Match MVP');
      const isTeamMvp = playerChunk.includes('TEAM MVP') || playerChunk.includes('Team MVP');

      players.push({
        teamTag,
        name,
        riotTag,
        agent,
        isMatchMvp,
        isTeamMvp,
        acs: typeof directVals[0] === 'number' ? directVals[0] : parseInt(directVals[0], 10) || 0,
        kills: typeof directVals[1] === 'number' ? directVals[1] : parseInt(directVals[1], 10) || 0,
        deaths: typeof directVals[2] === 'number' ? directVals[2] : parseInt(directVals[2], 10) || 0,
        assists: typeof directVals[3] === 'number' ? directVals[3] : parseInt(directVals[3], 10) || 0,
        plusMinus: directVals[4],
        adr: typeof directVals[5] === 'number' ? directVals[5] : parseInt(directVals[5], 10) || 0,
        hs: directVals[6]
      });
    }
    return players;
  }

  if (tableBodies.length >= 2) {
    const t1Players = parsePlayersFromTbody(tableBodies[0], result.team1Tag);
    const t2Players = parsePlayersFromTbody(tableBodies[1], result.team2Tag);
    result.players = [...t1Players, ...t2Players];
  } else {
    // Fallback if table bodies pattern differs
    const allPlayers = parsePlayersFromTbody(fullRSC, result.team1Tag);
    result.players = allPlayers;
  }

  return result;
}

// ── Poll a single match page ─────────────────────────────────────
async function pollMatch(matchSlug) {
  try {
    const html = await fetchUrl(`${BASE_URL}/matches/${matchSlug}`);
    return parseMatchPage(html, matchSlug);
  } catch (err) {
    console.warn(`[Poller] Failed to fetch match ${matchSlug}: ${err.message}`);
    return null;
  }
}

// ── Stats page scraper ────────────────────────────────────────────
function parseStatsPage(html) {
  const rscPushes = [...html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g)].map(x => x[1]);
  const fullRSC = rscPushes.join('').replace(/\\"/g, '"').replace(/\\n/g, '\n');

  const pRegex = /"className":"truncate","children":"([^"]+)"\}\],\["\$","\$L\w+",null,\{[^}]*\}\]\]\}\],\["\$","span",null,\{[^}]*"children":\["([A-Z]{2,4})",false\]\}\]\]\}\],\[\["\$","span","acs",\{[^}]*"children":([\d.]+)\}\],\["\$","span","kd",\{[^}]*"children":"([\d.]+)"\}\],\["\$","span","hs",\{[^}]*"children":"([\d.]+)%"\}\]\]/g;
  
  let m;
  const list = [];
  while ((m = pRegex.exec(fullRSC)) !== null) {
    list.push({
      name: m[1].trim(),
      teamTag: m[2],
      acs: parseFloat(m[3]),
      kd: parseFloat(m[4]),
      hs: parseFloat(m[5]),
    });
  }
  return list;
}

async function pollStats() {
  try {
    const html = await fetchUrl(`${BASE_URL}/stats`);
    return parseStatsPage(html);
  } catch (err) {
    console.warn(`[Poller] Failed to fetch stats page: ${err.message}`);
    return [];
  }
}

// ── Main poll cycle ───────────────────────────────────────────────
async function pollCycle() {
  if (isPolling) return;
  isPolling = true;

  const timestamp = new Date().toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit', minute: '2-digit',
  });

  console.log(`[Poller] 🔄 Polling tournament site at ${timestamp} IST...`);
  if (onStatusCallback) onStatusCallback({ status: 'polling', time: timestamp });

  const slugs = Object.keys(SITE_SLUG_TO_FIXTURE);
  let newResults = 0;

  for (const slug of slugs) {
    const result = await pollMatch(slug);
    if (!result || !result.completed) continue;

    const fixtureNumber = SITE_SLUG_TO_FIXTURE[slug];
    const prev = lastKnownResults[slug];
    const playersCount = (result.players && result.players.length) || 0;
    const hasChanged = !prev ||
      prev.score1 !== result.score1 ||
      prev.score2 !== result.score2 ||
      (playersCount > 0 && (!prev.playersCount || prev.playersCount === 0));

    if (hasChanged && (result.score1 > 0 || result.score2 > 0)) {
      lastKnownResults[slug] = { score1: result.score1, score2: result.score2, playersCount };
      newResults++;

      console.log(`[Poller] ✅ NEW RESULT: ${slug} → Fixture M${fixtureNumber}`);
      console.log(`         Score: ${result.team1Tag || 'T1'} ${result.score1} - ${result.score2} ${result.team2Tag || 'T2'}`);
      console.log(`         Winner: ${result.winner || 'TBD'} | Map: ${result.map || 'Unknown'}`);
      console.log(`         Players parsed: ${result.players.length}`);

      if (onResultCallback) {
        onResultCallback({
          siteMatchId: slug,
          fixtureMatchNumber: fixtureNumber,
          score1: result.score1,
          score2: result.score2,
          team1Tag: result.team1Tag,
          team2Tag: result.team2Tag,
          map: result.map,
          winner: result.winner,
          players: result.players,
          importedAt: new Date().toISOString(),
        });
      }
    }

    await new Promise(r => setTimeout(r, 200));
  }

  // ── Also poll /stats for player leaderboard & MVP data ─────────
  try {
    const statsData = await pollStats();
    if (statsData.length > 0) {
      const hash = JSON.stringify(statsData);
      if (hash !== lastStatsHash) {
        lastStatsHash = hash;
        console.log(`[Poller] 📊 Stats updated: ${statsData.length} players found`);
        if (onStatsCallback) onStatsCallback(statsData);
      }
    }
  } catch (err) {
    console.warn(`[Poller] Stats poll error: ${err.message}`);
  }

  if (newResults === 0) {
    console.log(`[Poller] ℹ️ Checked all matches. No new results.`);
  } else {
    console.log(`[Poller] 🏆 Imported ${newResults} new result(s).`);
  }

  if (onStatusCallback) {
    onStatusCallback({
      status: 'idle',
      lastCheck: timestamp,
      resultsFound: newResults,
    });
  }

  isPolling = false;
}

// ── Public API ────────────────────────────────────────────────────
function start(onResult, onStatus, onStats) {
  if (pollTimer) {
    console.log('[Poller] Already running.');
    return;
  }
  onResultCallback = onResult;
  onStatusCallback = onStatus;
  onStatsCallback = onStats || null;

  console.log(`[Poller] 🚀 Starting tournament result auto-poller (every ${POLL_INTERVAL_MS/1000}s)...`);

  pollCycle().catch(console.error);

  pollTimer = setInterval(() => {
    pollCycle().catch(console.error);
  }, POLL_INTERVAL_MS);
}

function stop() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    isPolling = false;
    console.log('[Poller] 🛑 Poller stopped.');
  }
}

function getStatus() {
  return {
    running: !!pollTimer,
    pollIntervalSeconds: POLL_INTERVAL_MS / 1000,
    lastKnownResults,
    siteIdToFixtureMap: SITE_SLUG_TO_FIXTURE,
  };
}

function pollNow() {
  return pollCycle();
}

module.exports = { start, stop, getStatus, pollNow, pollStats, pollMatch, parseMatchPage, SITE_ID_TO_FIXTURE: SITE_SLUG_TO_FIXTURE };
