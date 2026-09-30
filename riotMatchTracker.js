/**
 * Riot Client Live & Post-Match Match Details Fetcher
 * Connects directly to local Riot Client lockfile & fetches official post-match stats
 */
const https = require('https');
const fs = require('fs');

const AGENT_MAP = {
  'add6443a-41bd-e414-f6ad-e58d267f4e95': 'Jett',
  'a3bfb854-4347-226a-7dd6-01a47452c974': 'Reyna',
  'f94c3b30-42be-e959-889c-5aa313dba261': 'Raze',
  '8e252d04-4643-3281-a477-b8f40a56637e': 'Omen',
  '1e58de9c-4950-5125-93e9-a0aee9f97b07': 'Killjoy',
  '117ed9e3-49f3-6512-3ccf-0cada7e3823b': 'Cypher',
  '320799f4-40e4-e6ee-4c12-09b37e9c7e40': 'Sova',
  '569fdd95-4d10-43ab-ca70-79becc718b46': 'Sage',
  'eb93336a-449b-9c1b-0a54-a891f7921d69': 'Phoenix',
  '9f0dbe69-4521-937e-a6a6-c9f59b3295bc': 'Brimstone',
  '707eab51-4836-f488-046a-cda6bf494859': 'Viper',
  '5f8d3a7f-467b-97f3-062c-dd409903f29d': 'Breach',
  '6f2a04ca-43e0-be17-7f36-b3908627744d': 'Skye',
  '7f94d92c-4234-0a36-9646-3a87eb8b5c89': 'Yoru',
  '41fb69c1-4189-7b37-f117-bcaf1e96f1bf': 'Astra',
  '601db835-4378-8e11-aa30-2290ca30e335': 'KAY/O',
  '22697a3d-45bf-8dd7-4fec-84a9e28c69d7': 'Chamber',
  'bb2a4830-4970-4731-9e23-9774397059a3': 'Neon',
  'dade69b4-4f5a-8528-247b-219e5a1facd6': 'Fade',
  '95b78d7d-409b-86c7-3c02-5a20b1f7d82f': 'Harbor',
  'e370fa57-4757-3604-3648-499e1f642d3f': 'Gekko',
  'cc8b649d-478b-7b0c-1f5d-77ab4fa9dc74': 'Deadlock',
  '0e38b510-41a8-5780-5e7f-5e8a24abf36f': 'Iso',
  '1dbf2edd-4729-0984-3115-ffb1dde52639': 'Clove',
  'b915a30e-4453-7922-3047-b5b04e96e002': 'Vyse'
};

const MAP_MAP = {
  'Ascent': 'Ascent',
  'Split': 'Split',
  'Bind': 'Bind',
  'Breeze': 'Breeze',
  'Fracture': 'Fracture',
  'Haven': 'Haven',
  'Icebox': 'Icebox',
  'Lotus': 'Lotus',
  'Pearl': 'Pearl',
  'Sunset': 'Sunset',
  'Infinity': 'Abyss'
};

function getRiotLockfile() {
  const p = process.env.LOCALAPPDATA + '\\Riot Games\\Riot Client\\Config\\lockfile';
  if (!fs.existsSync(p)) return null;
  const content = fs.readFileSync(p, 'utf8').trim();
  const [name, pid, port, password, protocol] = content.split(':');
  return { port: parseInt(port, 10), password, protocol };
}

function getEntitlements(port, password) {
  const auth = Buffer.from('riot:' + password).toString('base64');
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: '127.0.0.1',
      port,
      path: '/entitlements/v1/token',
      method: 'GET',
      headers: { 'Authorization': 'Basic ' + auth },
      rejectUnauthorized: false
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid token response: ' + data));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function fetchPd(path, accessToken, entitlementToken) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: 'pd.ap.a.pvp.net',
      path,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'X-Riot-Entitlements-JWT': entitlementToken,
        'X-Riot-ClientPlatform': 'ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9',
        'X-Riot-ClientVersion': 'release-09.05-shipping-1-2856230'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: null });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Fetch the latest completed match results for the current player
 */
async function fetchLatestCompletedMatch() {
  const lock = getRiotLockfile();
  if (!lock) {
    throw new Error('Riot Client is not running. Please start Valorant or Riot Client.');
  }

  const ent = await getEntitlements(lock.port, lock.password);
  if (!ent || !ent.accessToken || !ent.token || !ent.subject) {
    throw new Error('Could not authenticate with local Riot Client session.');
  }

  // 1. Fetch match history
  const histRes = await fetchPd(`/match-history/v1/history/${ent.subject}?startIndex=0&endIndex=3`, ent.accessToken, ent.token);
  if (!histRes.data || !Array.isArray(histRes.data.History) || histRes.data.History.length === 0) {
    throw new Error('No match history found for current account.');
  }

  const latestMatchId = histRes.data.History[0].MatchID;

  // 2. Fetch full match details
  const matchRes = await fetchPd(`/match-details/v1/matches/${latestMatchId}`, ent.accessToken, ent.token);
  if (!matchRes.data || matchRes.status !== 200) {
    throw new Error(`Failed to fetch match details for ${latestMatchId} (HTTP ${matchRes.status})`);
  }

  const m = matchRes.data;

  // Map name detection
  let mapName = 'Ascent';
  if (m.matchInfo && m.matchInfo.mapId) {
    for (const [k, v] of Object.entries(MAP_MAP)) {
      if (m.matchInfo.mapId.includes(k)) {
        mapName = v;
        break;
      }
    }
  }

  // Parse teams & score
  let scoreRed = 0;
  let scoreBlue = 0;
  if (Array.isArray(m.teams)) {
    const redTeam = m.teams.find(t => t.teamId === 'Red');
    const blueTeam = m.teams.find(t => t.teamId === 'Blue');
    if (redTeam && typeof redTeam.roundsWon === 'number') scoreRed = redTeam.roundsWon;
    if (blueTeam && typeof blueTeam.roundsWon === 'number') scoreBlue = blueTeam.roundsWon;
  }

  // Parse players
  const players = (m.players || []).map(p => {
    const cid = (p.characterId || '').toLowerCase();
    const agentName = AGENT_MAP[cid] || 'Jett';
    const stats = p.stats || {};
    const kills = stats.kills || 0;
    const deaths = stats.deaths || 0;
    const assists = stats.assists || 0;
    const score = stats.score || 0;
    const roundsPlayed = stats.roundsPlayed || 1;
    const acs = Math.round(score / Math.max(1, roundsPlayed));

    return {
      puuid: p.subject,
      gameName: p.gameName || 'Player',
      tagLine: p.tagLine || '',
      teamId: p.teamId, // "Blue" or "Red"
      agent: agentName,
      kills,
      deaths,
      assists,
      score,
      acs: acs || (kills * 18 + assists * 6)
    };
  });

  // Sort by score/ACS descending
  players.sort((a, b) => (b.score || b.kills) - (a.score || a.kills));

  const mvp = players.length > 0 ? players[0] : null;

  return {
    matchId: latestMatchId,
    mapName,
    scoreRed,
    scoreBlue,
    players,
    mvp
  };
}

module.exports = {
  fetchLatestCompletedMatch
};
