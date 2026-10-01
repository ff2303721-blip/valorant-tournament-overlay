/**
 * tournamentPoller.js
 * ─────────────────────────────────────────────────────────
 * Auto-polls tournament.xmdofficial.in every 2 minutes and
 * imports completed match results into the overlay server state.
 *
 * When a match is detected as finished (score1 + score2 > 0),
 * it calls the onResult callback with structured result data.
 */

const https = require('https');

// ── Site match ID → our fixture matchNumber ──────────────────────
// Mapped by cross-referencing team names on each /matches/{id} page.
// (Site internal IDs do NOT equal M1/M2 fixture numbers)
const SITE_ID_TO_FIXTURE = {
  10: 1,   // M1  VRN vs NDL  Bind
  6:  2,   // M2  ATX vs BBZ  Abyss
  1:  3,   // M3  BBZ vs NDL  Corrode
  2:  4,   // M4  ATX vs NDL  Icebox
  3:  5,   // M5  NDL vs BBZ  Pearl
  4:  6,   // M6  ATX vs NDL  Corrode
  12: 7,   // M7  BBZ vs VRN  Split
  9:  8,   // M8  VRN vs ATX  Ascent
  7:  9,   // M9  VRN vs NDL  Bind
  18: 10,  // M10 VRN vs BBZ  Bind
  8:  11,  // M11 VRN vs ATX  Breeze
  17: 12,  // M12 BBZ vs ATX  Bind
  13: 13,  // M13 Qualifier 1
  14: 14,  // M14 Eliminator
  15: 15,  // M15 Qualifier 2
  16: 16,  // M16 Grand Final
};

const POLL_INTERVAL_MS = 30 * 1000; // 30 seconds
const BASE_URL = 'https://tournament.xmdofficial.in';

let pollTimer = null;
let isPolling = false;
let lastKnownResults = {}; // siteId → { score1, score2 }
let onResultCallback = null;
let onStatusCallback = null;

// ── HTTP fetch helper ────────────────────────────────────────────
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    };
    https.get(url, options, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// ── Parse scores from a single match page ────────────────────────
function parseMatchPage(html, siteId) {
  /**
   * The site uses Next.js RSC (React Server Components).
   * The match page renders a score element visible to screen readers:
   *   <span class="sr-only">13</span>   ← team1 score
   *   <span class="sr-only">7</span>    ← team2 score
   *
   * We also check the RSC flight data for:
   *   "upcoming":false  ← match completed
   *   "children":N      ← score values inside RSC JSON
   *
   * Strategy: Find ALL sr-only spans - the first two numeric ones are scores.
   */

  const result = {
    siteId,
    completed: false,
    score1: 0,
    score2: 0,
    team1Tag: null,
    team2Tag: null,
    map: null,
    winner: null,
  };

  // Check if match is upcoming/completed via RSC flight data
  if (html.includes('"upcoming":false') || html.includes('"completed":true')) {
    result.completed = true;
  }

  // --- Extract scores from sr-only spans ---
  // Rendered HTML has: <span class="sr-only">13</span>
  const srOnlyRegex = /<span[^>]*class="[^"]*sr-only[^"]*"[^>]*>(\d+)<\/span>/g;
  const srMatches = [];
  let m;
  while ((m = srOnlyRegex.exec(html)) !== null) {
    srMatches.push(parseInt(m[1], 10));
  }

  // The first two numeric sr-only spans in the match score block are team scores
  if (srMatches.length >= 2) {
    result.score1 = srMatches[0];
    result.score2 = srMatches[1];
    if (result.score1 > 0 || result.score2 > 0) {
      result.completed = true;
    }
  }

  // --- Extract team tags from RSC flight JSON (escaped) ---
  // Pattern: \"tag\":\"VRN\"
  const tagRegex = /\\"tag\\":\\"([A-Z]{2,4})\\"/g;
  const tags = [];
  while ((m = tagRegex.exec(html)) !== null) {
    tags.push(m[1]);
  }
  // Also try unescaped
  const tagRegex2 = /"tag":"([A-Z]{2,4})"/g;
  while ((m = tagRegex2.exec(html)) !== null) {
    tags.push(m[1]);
  }
  const uniqueTags = [...new Set(tags)];
  if (uniqueTags.length >= 2) {
    result.team1Tag = uniqueTags[0];
    result.team2Tag = uniqueTags[1];
  }

  // --- Extract map name ---
  // Format in HTML: ·Bind· or ·Ascent·
  const mapMatch = html.match(/·([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)·/);
  if (mapMatch) result.map = mapMatch[1];

  // --- Determine winner ---
  if (result.completed && result.score1 !== result.score2) {
    result.winner = result.score1 > result.score2 ? result.team1Tag : result.team2Tag;
  }

  return result;
}

// ── Poll a single match page ─────────────────────────────────────
async function pollMatch(siteId) {
  try {
    const html = await fetchUrl(`${BASE_URL}/matches/${siteId}`);
    return parseMatchPage(html, siteId);
  } catch (err) {
    console.warn(`[Poller] Failed to fetch match ${siteId}: ${err.message}`);
    return null;
  }
}

// ── Stats page scraper ────────────────────────────────────────────
/**
 * Fetches /stats from the tournament site and parses per-player stats.
 * Returns an array of:
 *   { name, teamTag, acs, kd, hs, adr, kills, deaths, assists, matches }
 *
 * The site uses Next.js RSC. Player stat rows look like (in RSC JSON):
 *   ["PlayerName","TEAMTAG","285","1.24","23%","182","24","20","5","3"]
 * When no stats: the values show as "–" (en-dash) or "–––" placeholders.
 */
async function pollStats() {
  try {
    const html = await fetchUrl(`${BASE_URL}/stats`);
    return parseStatsPage(html);
  } catch (err) {
    console.warn(`[Poller] Failed to fetch stats page: ${err.message}`);
    return [];
  }
}

function parseStatsPage(html) {
  const players = [];

  /**
   * Strategy: extract RSC flight JSON blocks and scan for player stat rows.
   * RSC lines look like:  N:["PlayerName","TAG","285","1.24","23%","182","24","20","5","3"]
   * We also try to match from rendered HTML tables.
   */

  // Known team tags for validation
  const VALID_TAGS = new Set(['ATX', 'BBZ', 'NDL', 'VRN']);

  // ── Method 1: RSC array rows ─────────────────────────────────
  // Pattern: ["Name","TAG","ACS","KD","HS%","ADR","K","D","A","Matches"]
  const rscRowRegex = /\["([^"]+)","([A-Z]{2,4})","([\d.]+)","([\d.]+)","([\d.]+)%?","([\d.]+)","(\d+)","(\d+)","(\d+)","(\d+)"\]/g;
  let m;
  while ((m = rscRowRegex.exec(html)) !== null) {
    const [, name, teamTag, acs, kd, hs, adr, kills, deaths, assists, matches] = m;
    if (!VALID_TAGS.has(teamTag)) continue;
    players.push({
      name: name.trim(),
      teamTag,
      acs: parseFloat(acs),
      kd: parseFloat(kd),
      hs: parseFloat(hs),
      adr: parseFloat(adr),
      kills: parseInt(kills),
      deaths: parseInt(deaths),
      assists: parseInt(assists),
      matches: parseInt(matches),
    });
  }

  if (players.length > 0) return players;

  // ── Method 2: Escaped RSC JSON ────────────────────────────────
  // When RSC data is JSON-string-escaped inside a script block
  const escapedRowRegex = /\[\\"([^\\"]+)\\",\\"([A-Z]{2,4})\\",\\"([\d.]+)\\",\\"([\d.]+)\\",\\"([\d.]+)%?\\",\\"([\d.]+)\\",\\"(\d+)\\",\\"(\d+)\\",\\"(\d+)\\",\\"(\d+)\\"\]/g;
  while ((m = escapedRowRegex.exec(html)) !== null) {
    const [, name, teamTag, acs, kd, hs, adr, kills, deaths, assists, matches] = m;
    if (!VALID_TAGS.has(teamTag)) continue;
    players.push({
      name: name.trim(),
      teamTag,
      acs: parseFloat(acs),
      kd: parseFloat(kd),
      hs: parseFloat(hs),
      adr: parseFloat(adr),
      kills: parseInt(kills),
      deaths: parseInt(deaths),
      assists: parseInt(assists),
      matches: parseInt(matches),
    });
  }

  if (players.length > 0) return players;

  // ── Method 3: Rendered HTML table rows ────────────────────────
  // <td>PlayerName</td><td>TAG</td><td>285</td>...
  const htmlRowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>([\w\s]+)<\/td>\s*<td[^>]*>([A-Z]{2,4})<\/td>\s*<td[^>]*>([\d.]+)<\/td>\s*<td[^>]*>([\d.]+)<\/td>\s*<td[^>]*>([\d.]+)%?<\/td>\s*<td[^>]*>([\d.]+)<\/td>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(\d+)<\/td>/g;
  while ((m = htmlRowRegex.exec(html)) !== null) {
    const [, name, teamTag, acs, kd, hs, adr, kills, deaths, assists, matches] = m;
    if (!VALID_TAGS.has(teamTag)) continue;
    players.push({
      name: name.trim(),
      teamTag,
      acs: parseFloat(acs),
      kd: parseFloat(kd),
      hs: parseFloat(hs),
      adr: parseFloat(adr),
      kills: parseInt(kills),
      deaths: parseInt(deaths),
      assists: parseInt(assists),
      matches: parseInt(matches),
    });
  }

  return players;
}

// ── Main poll cycle ───────────────────────────────────────────────
let lastStatsHash = ''; // detect stats changes without re-broadcasting identical data
let onStatsCallback = null;

async function pollCycle() {
  if (isPolling) return; // Skip if already running
  isPolling = true;

  const timestamp = new Date().toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit', minute: '2-digit',
  });

  console.log(`[Poller] 🔄 Polling tournament site at ${timestamp} IST...`);
  if (onStatusCallback) onStatusCallback({ status: 'polling', time: timestamp });

  const siteIds = Object.keys(SITE_ID_TO_FIXTURE).map(Number);
  let newResults = 0;

  for (const siteId of siteIds) {
    const result = await pollMatch(siteId);
    if (!result || !result.completed) continue;

    const key = siteId;
    const prev = lastKnownResults[key];
    const hasChanged = !prev ||
      prev.score1 !== result.score1 ||
      prev.score2 !== result.score2;

    if (hasChanged && (result.score1 > 0 || result.score2 > 0)) {
      const fixtureNumber = SITE_ID_TO_FIXTURE[siteId];
      lastKnownResults[key] = { score1: result.score1, score2: result.score2 };
      newResults++;

      console.log(`[Poller] ✅ NEW RESULT: Site Match ${siteId} → Fixture M${fixtureNumber}`);
      console.log(`         Score: ${result.team1Tag || 'T1'} ${result.score1} - ${result.score2} ${result.team2Tag || 'T2'}`);
      console.log(`         Winner: ${result.winner || 'TBD'} | Map: ${result.map || 'Unknown'}`);

      if (onResultCallback) {
        onResultCallback({
          siteMatchId: siteId,
          fixtureMatchNumber: fixtureNumber,
          score1: result.score1,
          score2: result.score2,
          team1Tag: result.team1Tag,
          team2Tag: result.team2Tag,
          map: result.map,
          winner: result.winner,
          importedAt: new Date().toISOString(),
        });
      }
    }

    // Small delay between requests to be respectful
    await new Promise(r => setTimeout(r, 300));
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
    console.log(`[Poller] ℹ️ No new results found.`);
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

/**
 * Start the poller.
 * @param {Function} onResult  - called with result object when a match result is found
 * @param {Function} onStatus  - called with status updates
 * @param {Function} onStats   - called with player stats array when stats change
 */
function start(onResult, onStatus, onStats) {
  if (pollTimer) {
    console.log('[Poller] Already running.');
    return;
  }
  onResultCallback = onResult;
  onStatusCallback = onStatus;
  onStatsCallback = onStats || null;

  console.log(`[Poller] 🚀 Starting tournament result auto-poller (every ${POLL_INTERVAL_MS/1000}s)...`);

  // Run immediately on start
  pollCycle().catch(console.error);

  // Then on interval
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
    siteIdToFixtureMap: SITE_ID_TO_FIXTURE,
  };
}

/** Force an immediate poll (used by admin API) */
function pollNow() {
  return pollCycle();
}

module.exports = { start, stop, getStatus, pollNow, pollStats, SITE_ID_TO_FIXTURE };

