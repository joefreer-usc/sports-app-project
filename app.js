"use strict";

// Each sport is a tab.
//  - "league" tabs show scores (scores file) plus standings or rankings (extra file).
//  - the F1 tab has its own layout.
const SPORTS = [
  { id: "nfl", label: "NFL", kind: "league", espn: "football/nfl", scores: "data/nfl.json", extra: "data/nfl_standings.json", extraType: "standings" },
  { id: "nba", label: "NBA", kind: "league", espn: "basketball/nba", scores: "data/nba.json", extra: "data/nba_standings.json", extraType: "standings" },
  { id: "mlb", label: "MLB", kind: "league", espn: "baseball/mlb", scores: "data/mlb.json", extra: "data/mlb_standings.json", extraType: "standings" },
  { id: "cfb", label: "CFB", kind: "league", espn: "football/college-football", scores: "data/cfb.json", extra: "data/cfb_rankings.json", extraType: "rankings" },
  { id: "nhl", label: "NHL", kind: "league", espn: "hockey/nhl", scores: "data/nhl.json", extra: "data/nhl_standings.json", extraType: "standings" },
  // Men's and women's college basketball share one tab with a switch at the top.
  { id: "cbb", label: "CBB", kind: "league", espn: "basketball/mens-college-basketball", scores: "data/cbb.json", extra: "data/cbb_rankings.json", extraType: "rankings", group: "cbb", side: "Men's" },
  { id: "wcbb", label: "CBB", kind: "league", espn: "basketball/womens-college-basketball", scores: "data/wcbb.json", extra: "data/wcbb_rankings.json", extraType: "rankings", group: "cbb", side: "Women's", hidden: true },
  // Premier League and Champions League share one tab with a switch at the top.
  { id: "epl", label: "FC", kind: "league", espn: "soccer/eng.1", scores: "data/epl.json", extra: "data/epl_table.json", extraType: "table", group: "fc", side: "Premier League" },
  { id: "ucl", label: "FC", kind: "league", espn: "soccer/uefa.champions", scores: "data/ucl.json", extra: "data/ucl_table.json", extraType: "table", group: "fc", side: "Champions League", hidden: true },
  { id: "laliga", label: "FC", kind: "league", espn: "soccer/esp.1", scores: "data/laliga.json", extra: "data/laliga_table.json", extraType: "table", group: "fc", side: "LaLiga", hidden: true },
  { id: "golf", label: "Golf", kind: "golf", file: "data/golf.json" },
  { id: "f1", label: "F1", kind: "f1", file: "data/f1.json" }
];

const LEAGUE_TILES = [
  { id: "nfl", name: "NFL", desc: "Pro football", logo: "assets/logos/nfl.png", color: "rgba(1, 51, 105, .28)" },
  { id: "nba", name: "NBA", desc: "Pro basketball", logo: "assets/logos/nba.png", color: "rgba(200, 16, 46, .22)" },
  { id: "mlb", name: "MLB", desc: "Pro baseball", logo: "assets/logos/mlb.png", color: "rgba(0, 45, 98, .3)" },
  { id: "cfb", name: "College Football", desc: "Scores & rankings", logo: "assets/logos/cfp.png", color: "rgba(248, 88, 0, .2)" },
  { id: "cbb", name: "College Basketball", desc: "Men's & women's", logo: "assets/logos/ncaa.png", color: "rgba(76, 194, 255, .18)" },
  { id: "golf", name: "Golf", desc: "PGA leaderboard", logo: "assets/logos/pga.png", color: "rgba(42, 166, 74, .22)" },
  { id: "epl", name: "Football Club", desc: "Premier League & UCL", logo: "assets/logos/premier-league.png", color: "rgba(0, 255, 133, .16)" },
  { id: "f1", name: "Formula 1", desc: "Races, drivers & laps", logo: "assets/logos/f1.png", color: "rgba(225, 6, 0, .22)" },
  { id: "nhl", name: "NHL", desc: "Pro hockey", logo: "assets/logos/nhl.png", color: "rgba(160, 174, 192, .16)" }
];

// How each league asks ESPN for live scores straight from the phone.
//  - query: one request with this query string
//  - days:  one request per day (offsets from today), plus an optional extra query
const LIVE = {
  nfl:  { query: "" },
  cfb:  { query: "?groups=80&limit=200" },
  nba:  { days: [-1, 0] },
  mlb:  { days: [-1, 0] },
  nhl:  { days: [-1, 0] },
  cbb:  { days: [-1, 0], extra: "&groups=50&limit=400" },
  wcbb: { days: [-1, 0], extra: "&groups=50&limit=400" },
  epl:  { days: [-1, 0] },
  ucl:  { days: [-1, 0] },
  laliga: { days: [-1, 0] }
};

const view = document.getElementById("view");
const pageMenu = document.getElementById("pageMenu");
const brandHome = document.getElementById("brandHome");
const updatedEl = document.getElementById("updated");

let current = loadTab();

// Games from the most recent scores render, so a tapped game can be looked up by id.
let gamesById = {};
// When set, the page shows one game's box score instead of the tab's usual content.
let detail = null; // { sportId, id, game }

const FAVORITES_KEY = "sports-hub-favorites-v1";
const ODDS_KEY = "sports-hub-odds-api-key-v1";
const ODDS_CACHE_KEY = "sports-hub-nba-props-cache-v1";
const ODDS_HISTORY_KEY = "sports-hub-nba-form-cache-v1";
const ODDS_CACHE_MS = 10 * 60 * 1000;
const ODDS_HISTORY_MS = 24 * 60 * 60 * 1000;
const ODDS_API = "https://api.sportsgameodds.com/v2/events";
let oddsState = { props: [], events: [], fetchedAt: 0, error: "", loading: false, filter: "all", sort: "heat", query: "" };
let oddsHistoryEvents = [];

// ---- helpers ----------------------------------------------------------------

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadTab() {
  let saved = null;
  try { saved = localStorage.getItem("sports-hub-tab"); } catch (e) { /* ignore */ }
  const wanted = (location.hash || "").replace("#", "") || saved;
  return SPORTS.some((s) => s.id === wanted) || ["home", "live", "favorites", "odds"].includes(wanted) ? wanted : "home";
}

function saveTab(id) {
  try { localStorage.setItem("sports-hub-tab", id); } catch (e) { /* ignore */ }
}

function syncPageMenu() {
  pageMenu.value = ["home", "live", "favorites", "odds"].includes(current) ? current : "";
}

function oddsApiKey() {
  try { return localStorage.getItem(ODDS_KEY) || ""; } catch (e) { return ""; }
}

function saveOddsKey(value) {
  try {
    if (value) localStorage.setItem(ODDS_KEY, value);
    else localStorage.removeItem(ODDS_KEY);
  } catch (e) { /* storage can be unavailable in private browsing */ }
}

function readOddsCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(ODDS_CACHE_KEY) || "null");
    return cached && Array.isArray(cached.events) ? cached : null;
  } catch (e) { return null; }
}

function writeOddsCache(events) {
  try { localStorage.setItem(ODDS_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), events: events })); } catch (e) { /* ignore */ }
}

function readOddsHistoryCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(ODDS_HISTORY_KEY) || "null");
    return cached && Array.isArray(cached.events) ? cached : null;
  } catch (e) { return null; }
}

function resultNumber(value) {
  if (value && typeof value === "object") value = value.value != null ? value.value : (value.score != null ? value.score : value.displayValue);
  return numberValue(value);
}

function propForm(playerId, stat, line) {
  const values = oddsHistoryEvents.map((event) => {
    const game = event.results && event.results.game || {};
    const player = game[playerId] || {};
    return { at: Date.parse(event.status && event.status.startsAt || event.startsAt || "") || 0, value: resultNumber(player[stat]) };
  }).filter((item) => item.value != null).sort((a, b) => b.at - a.at).slice(0, 10).map((item) => item.value);
  if (!values.length) return null;
  const recent = values.slice(0, 5);
  const hits = recent.filter((value) => value > line).length;
  return { games: recent.length, hits: hits, average: recent.reduce((sum, value) => sum + value, 0) / recent.length, streak: values.findIndex((value) => value <= line) < 0 ? values.length : values.findIndex((value) => value <= line) };
}

async function loadOddsHistory(key) {
  const cached = readOddsHistoryCache();
  if (cached) oddsHistoryEvents = cached.events;
  if (cached && Date.now() - cached.fetchedAt < ODDS_HISTORY_MS) return;
  const after = new Date(Date.now() - 15 * 86400000).toISOString();
  const before = new Date().toISOString();
  const params = new URLSearchParams({ leagueID: "NBA", finalized: "true", expandResults: "true", startsAfter: after, startsBefore: before, limit: "50" });
  try {
    const response = await fetch(ODDS_API + "?" + params.toString(), { cache: "no-store", headers: { "x-api-key": key } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) return;
    oddsHistoryEvents = Array.isArray(payload.data) ? payload.data : oddsHistoryEvents;
    localStorage.setItem(ODDS_HISTORY_KEY, JSON.stringify({ fetchedAt: Date.now(), events: oddsHistoryEvents }));
  } catch (e) { /* current props still work if form data is unavailable */ }
}

function numberValue(value) {
  const n = Number(String(value == null ? "" : value).replace("+", ""));
  return Number.isFinite(n) ? n : null;
}

function americanLabel(value) {
  const n = numberValue(value);
  if (n == null) return "—";
  return n > 0 ? "+" + n : String(n);
}

function impliedProbability(value) {
  const n = numberValue(value);
  if (n == null || n === 0) return 0;
  return n < 0 ? (-n) / ((-n) + 100) : 100 / (n + 100);
}

function propPlayerName(odd) {
  const named = odd.player && (odd.player.name || odd.player.displayName || odd.player.fullName);
  if (named) return named;
  const market = String(odd.marketName || odd.name || "");
  const suffixes = [" Points", " Rebounds", " Assists", " Three Pointers", " 3-Pointers", " Over/Under"];
  let name = market;
  suffixes.forEach((suffix) => { const at = name.indexOf(suffix); if (at > 0) name = name.slice(0, at); });
  if (name && name !== market) return name.trim();
  return String(odd.statEntityID || odd.playerID || "Player").replace(/_\d+_NBA$/i, "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function eventTeamName(event, side) {
  const team = event && event.teams && event.teams[side] || {};
  return (team.names && (team.names.short || team.names.medium || team.names.long)) || team.name || team.displayName || side;
}

function oddsStatLabel(stat) {
  const labels = { points: "Points", rebounds: "Rebounds", assists: "Assists", threePointersMade: "3-Pointers", threePointFieldGoalsMade: "3-Pointers", pointsReboundsAssists: "Pts + Reb + Ast" };
  return labels[stat] || String(stat || "Prop").replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function normalizeNbaProps(events) {
  const groups = {};
  (events || []).forEach((event) => {
    Object.keys(event.odds || {}).forEach((oddId) => {
      const odd = event.odds[oddId] || {};
      const entity = String(odd.statEntityID || odd.playerID || "");
      if (!entity || ["home", "away", "all"].includes(entity.toLowerCase())) return;
      if (odd.periodID && odd.periodID !== "game") return;
      if (odd.betTypeID && odd.betTypeID !== "ou") return;
      const side = String(odd.sideID || "").toLowerCase();
      if (side !== "over" && side !== "under") return;
      const stat = odd.statID || "prop";
      const allowed = ["points", "rebounds", "assists", "threePointersMade", "threePointFieldGoalsMade", "pointsReboundsAssists"];
      if (!allowed.includes(stat)) return;
      const books = odd.byBookmaker || {};
      Object.keys(books).forEach((bookId) => {
        const book = books[bookId] || {};
        if (book.available === false) return;
        const line = numberValue(book.overUnder != null ? book.overUnder : (book.line != null ? book.line : odd.bookOverUnder));
        const price = numberValue(book.odds != null ? book.odds : book.price);
        if (line == null || price == null) return;
        const key = [event.eventID || event.id, entity, stat, line].join("|");
        if (!groups[key]) groups[key] = {
          id: key, eventId: event.eventID || event.id || "", playerId: odd.playerID || entity,
          player: propPlayerName(odd), stat: stat, statLabel: oddsStatLabel(stat), line: line,
          startsAt: event.status && event.status.startsAt || event.startsAt || "",
          matchup: eventTeamName(event, "away") + " @ " + eventTeamName(event, "home"), over: [], under: []
        };
        groups[key][side].push({ book: bookId, price: price, updated: book.lastUpdatedAt || odd.lastUpdatedAt || "" });
      });
    });
  });
  return Object.values(groups).map((prop) => {
    const best = (items) => items.slice().sort((a, b) => b.price - a.price)[0] || null;
    const all = prop.over.concat(prop.under);
    const overBest = best(prop.over), underBest = best(prop.under);
    const newest = all.map((item) => Date.parse(item.updated)).filter(Number.isFinite).sort((a, b) => b - a)[0] || 0;
    const form = propForm(prop.playerId, prop.stat, prop.line);
    return Object.assign(prop, {
      bestOver: overBest, bestUnder: underBest, books: new Set(all.map((item) => item.book)).size,
      form: form,
      heat: Math.round(Math.min(99, 40 + Math.abs((impliedProbability(overBest && overBest.price) || .5) - .5) * 110 + Math.min(18, all.length * 2) + (form ? (form.hits / form.games) * 20 : 0))),
      updatedAt: newest ? new Date(newest).toISOString() : ""
    });
  });
}

function bookLabel(id) {
  const labels = { draftkings: "DraftKings", fanduel: "FanDuel", betmgm: "BetMGM", caesars: "Caesars", espnbet: "ESPN BET", fanatics: "Fanatics", bovada: "Bovada" };
  return labels[String(id || "").toLowerCase()] || String(id || "Book").replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderOddsSetup(message) {
  updatedEl.textContent = "";
  view.innerHTML = '<section class="odds-hero"><div><p class="eyebrow">NBA RESEARCH</p><h2>Odds &amp; Props</h2>' +
    '<p>Live player-prop lines, best prices and market signals—without entering lines yourself.</p></div><span class="odds-live-pill">AUTO REFRESH</span></section>' +
    '<section class="card odds-setup"><div class="odds-setup-icon" aria-hidden="true">↗</div><div><h2>Connect live NBA props</h2>' +
    '<p>Paste a SportsGameOdds API key once. It stays in this browser and is used only to request odds.</p>' +
    (message ? '<p class="odds-error">' + esc(message) + '</p>' : '') +
    '<form id="oddsKeyForm"><label for="oddsApiKey">API key</label><div class="odds-key-row"><input id="oddsApiKey" name="apiKey" type="password" autocomplete="off" placeholder="Paste your API key" required>' +
    '<button type="submit">Connect props</button></div></form><p class="odds-help">Create a free Amateur key at <a href="https://sportsgameodds.com" target="_blank" rel="noopener noreferrer">sportsgameodds.com</a>. Free data normally refreshes about every ten minutes.</p></div></section>';
}

function oddsFilters() {
  const stats = [{ id: "all", label: "All props" }, { id: "points", label: "Points" }, { id: "rebounds", label: "Rebounds" }, { id: "assists", label: "Assists" }, { id: "threePointersMade", label: "3-Pointers" }, { id: "pointsReboundsAssists", label: "PRA" }];
  return '<div class="odds-toolbar"><div class="prop-tabs" role="group" aria-label="Prop market">' + stats.map((item) =>
    '<button type="button" class="prop-tab' + (oddsState.filter === item.id ? ' active' : '') + '" data-prop-filter="' + esc(item.id) + '">' + esc(item.label) + '</button>').join("") +
    '</div><div class="odds-controls"><label class="sr-only" for="propSearch">Search players</label><input id="propSearch" type="search" placeholder="Search player" value="' + esc(oddsState.query) + '">' +
    '<label class="sr-only" for="propSort">Sort props</label><select id="propSort"><option value="heat"' + (oddsState.sort === "heat" ? " selected" : "") + '>Market heat</option><option value="time"' + (oddsState.sort === "time" ? " selected" : "") + '>Game time</option><option value="player"' + (oddsState.sort === "player" ? " selected" : "") + '>Player</option><option value="books"' + (oddsState.sort === "books" ? " selected" : "") + '>Most books</option></select>' +
    '<button type="button" class="odds-refresh" data-refresh-odds>Refresh</button><button type="button" class="odds-settings" data-odds-settings aria-label="Odds settings">•••</button></div></div>';
}

function filteredProps() {
  const query = oddsState.query.trim().toLowerCase();
  const list = oddsState.props.filter((prop) => (oddsState.filter === "all" || prop.stat === oddsState.filter || (oddsState.filter === "threePointersMade" && prop.stat === "threePointFieldGoalsMade")) &&
    (!query || prop.player.toLowerCase().includes(query) || prop.matchup.toLowerCase().includes(query)));
  return list.sort((a, b) => {
    if (oddsState.sort === "time") return Date.parse(a.startsAt) - Date.parse(b.startsAt);
    if (oddsState.sort === "player") return a.player.localeCompare(b.player);
    if (oddsState.sort === "books") return b.books - a.books;
    return b.heat - a.heat || b.books - a.books;
  });
}

function propCard(prop) {
  const when = prop.startsAt ? new Date(prop.startsAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : "Upcoming";
  const price = (item) => item ? '<strong>' + americanLabel(item.price) + '</strong><small>' + esc(bookLabel(item.book)) + '</small>' : '<strong>—</strong><small>Unavailable</small>';
  const signal = prop.form && prop.form.games >= 3 && prop.form.hits === prop.form.games ? "Great form" : (prop.heat >= 75 ? "Hot market" : (prop.books >= 4 ? "Strong coverage" : "Limited books"));
  return '<article class="prop-card"><div class="prop-card-head"><div><span class="prop-market">' + esc(prop.statLabel) + '</span><h3>' + esc(prop.player) + '</h3><p>' + esc(prop.matchup) + ' · ' + esc(when) + '</p></div><span class="heat-badge heat-' + (prop.heat >= 75 ? "hot" : "normal") + '">' + esc(signal) + '</span></div>' +
    '<div class="prop-line"><span>Consensus line</span><strong>' + esc(prop.line) + '</strong><small>' + prop.books + ' book' + (prop.books === 1 ? '' : 's') + '</small></div>' +
    '<div class="prop-sides"><div><span>OVER ' + esc(prop.line) + '</span>' + price(prop.bestOver) + '</div><div><span>UNDER ' + esc(prop.line) + '</span>' + price(prop.bestUnder) + '</div></div>' +
    (prop.form ? '<div class="prop-form"><span>Last ' + prop.form.games + ': <b>' + prop.form.hits + ' hits</b></span><span>Avg <b>' + esc(prop.form.average.toFixed(1)) + '</b></span>' + (prop.form.streak >= 2 ? '<span><b>' + prop.form.streak + '-game</b> run</span>' : '') + '</div>' : '') +
    '<div class="prop-card-foot"><span>Research score <b>' + esc(prop.heat) + '</b></span><span>' + (prop.updatedAt ? 'Updated ' + esc(timeAgo(prop.updatedAt)) : 'Live market') + '</span></div></article>';
}

function paintOdds() {
  if (current !== "odds") return;
  const props = filteredProps();
  const hot = oddsState.props.slice().sort((a, b) => b.heat - a.heat).slice(0, 3);
  updatedEl.textContent = oddsState.fetchedAt ? "Odds updated " + timeAgo(new Date(oddsState.fetchedAt).toISOString()) : "";
  view.innerHTML = '<section class="odds-hero"><div><p class="eyebrow">NBA RESEARCH</p><h2>Odds &amp; Props</h2><p>Compare current player props and find the strongest market signals.</p></div><span class="odds-live-pill"><i></i> LIVE LINES</span></section>' +
    (hot.length ? '<section class="hot-strip"><div class="hot-strip-title"><span>🔥</span><div><strong>Form &amp; market leaders</strong><small>Recent results plus current sportsbook signals</small></div></div>' + hot.map((prop, i) => '<button type="button" data-prop-player="' + esc(prop.player) + '"><span>#' + (i + 1) + '</span><strong>' + esc(prop.player) + '</strong><small>' + esc(prop.statLabel) + ' ' + esc(prop.line) + (prop.form ? ' · ' + prop.form.hits + '/' + prop.form.games : '') + '</small></button>').join("") + '</section>' : '') +
    oddsFilters() + (oddsState.error ? '<div class="odds-notice"><strong>Couldn\'t refresh:</strong> ' + esc(oddsState.error) + ' Showing the last saved board.</div>' : '') +
    '<div class="prop-results-head"><strong>' + props.length + ' props</strong><span>Lines can move quickly. Verify before acting.</span></div>' +
    (props.length ? '<section class="prop-grid">' + props.map(propCard).join("") + '</section>' : '<section class="empty-state odds-empty"><h2>No matching props</h2><p>NBA player props are usually posted closer to game time. Try another filter or refresh later.</p></section>') +
    '<p class="responsible-note">For research and entertainment only. Research score combines recent results, sportsbook coverage and pricing strength; it is not a prediction or guarantee.</p>';
}

async function fetchNbaProps(force) {
  const key = oddsApiKey();
  if (!key) { renderOddsSetup(); return; }
  const cached = readOddsCache();
  if (!force && cached && Date.now() - cached.fetchedAt < ODDS_CACHE_MS) {
    await loadOddsHistory(key);
    oddsState.events = cached.events;
    oddsState.props = normalizeNbaProps(cached.events);
    oddsState.fetchedAt = cached.fetchedAt;
    oddsState.error = "";
    paintOdds();
    return;
  }
  oddsState.loading = true;
  oddsState.error = "";
  view.innerHTML = '<section class="odds-loading"><span></span><h2>Loading NBA props</h2><p>Comparing lines across sportsbooks…</p></section>';
  try {
    const params = new URLSearchParams({ leagueID: "NBA", oddsAvailable: "true", includeOpposingOdds: "true", includeAltLines: "false", limit: "15" });
    const response = await fetch(ODDS_API + "?" + params.toString(), { cache: "no-store", headers: { "x-api-key": key } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) throw new Error(payload.error || "The odds service returned " + response.status);
    const events = Array.isArray(payload.data) ? payload.data : [];
    await loadOddsHistory(key);
    writeOddsCache(events);
    oddsState.events = events;
    oddsState.props = normalizeNbaProps(events);
    oddsState.fetchedAt = Date.now();
    paintOdds();
  } catch (error) {
    oddsState.error = error && error.message ? error.message : "Unable to reach the odds service.";
    if (cached && cached.events.length) {
      oddsState.events = cached.events;
      oddsState.props = normalizeNbaProps(cached.events);
      oddsState.fetchedAt = cached.fetchedAt;
      paintOdds();
    } else renderOddsSetup(oddsState.error + " Check the key and try again.");
  } finally { oddsState.loading = false; }
}

async function renderOdds() {
  updatedEl.textContent = "";
  await fetchNbaProps(false);
}

function loadFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch (e) { return {}; }
}

function favoriteKey(sportId, abbr) {
  return String(sportId || "").toLowerCase() + ":" + String(abbr || "").toUpperCase();
}

function isFavorite(sportId, abbr) {
  return !!loadFavorites()[favoriteKey(sportId, abbr)];
}

function favoriteButton(sportId, team, extraClass) {
  if (!sportId || !team || !team.abbr) return "";
  const active = isFavorite(sportId, team.abbr);
  const label = (active ? "Remove " : "Add ") + (team.name || team.abbr) + (active ? " from favorites" : " to favorites");
  return '<button type="button" class="favorite-button' + (active ? ' active' : '') + (extraClass ? ' ' + esc(extraClass) : '') + '"' +
    ' data-favorite-sport="' + esc(sportId) + '" data-favorite-abbr="' + esc(team.abbr) + '"' +
    ' data-favorite-name="' + esc(team.name || team.abbr) + '" data-favorite-logo="' + esc(team.logo || "") + '"' +
    ' aria-pressed="' + (active ? "true" : "false") + '" aria-label="' + esc(label) + '" title="' + esc(label) + '">' +
    '<span aria-hidden="true">' + (active ? "★" : "☆") + '</span></button>';
}

function toggleFavorite(button) {
  const sportId = button.getAttribute("data-favorite-sport");
  const abbr = button.getAttribute("data-favorite-abbr");
  if (!sportId || !abbr) return;
  const key = favoriteKey(sportId, abbr);
  const favorites = loadFavorites();
  if (favorites[key]) delete favorites[key];
  else favorites[key] = {
    sportId: sportId,
    abbr: abbr,
    name: button.getAttribute("data-favorite-name") || abbr,
    logo: button.getAttribute("data-favorite-logo") || ""
  };
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch (e) { /* ignore */ }
  if (current === "favorites") renderFavorites();
  else show();
}

function renderLeagueTiles() {
  return '<section class="league-grid" aria-label="Sports leagues">' + LEAGUE_TILES.map((l) =>
      '<button type="button" class="league-tile' + (l.disabled ? ' disabled' : '') + '"' +
      (l.disabled ? ' disabled' : ' data-league="' + esc(l.id) + '"') + ' style="--tile-glow:' + esc(l.color) + '">' +
      (l.disabled ? '<span class="coming">Coming soon</span>' : '') +
      '<span class="league-mark"><img class="league-logo" src="' + esc(l.logo) + '" alt="' + esc(l.name) + ' logo" loading="lazy"></span>' +
      '<span class="league-copy"><span class="league-name">' + esc(l.name) + '</span>' +
      '<span class="league-desc">' + esc(l.desc) + '</span></span>' +
      (l.disabled ? '' : '<span class="league-arrow" aria-hidden="true">&rsaquo;</span>') + '</button>'
    ).join("") + '</section>';
}

function homeExplore() {
  return '<section class="home-intro home-explore"><h2>Explore leagues</h2>' +
    '<p>Scores, standings, profiles and game centers.</p></section>' + renderLeagueTiles();
}

async function renderHome() {
  updatedEl.textContent = "";
  const favoriteMap = loadFavorites();
  const favorites = Object.values(favoriteMap);
  if (!favorites.length) {
    view.innerHTML = '<section class="for-you-welcome"><div><p class="eyebrow">FOR YOU</p><h2>Make Sports Hub yours</h2>' +
      '<p>Star teams from any scores page and their next games will appear here.</p></div><button type="button" data-league="nfl">Find a team</button></section>' + homeExplore();
    return;
  }

  view.innerHTML = '<section class="for-you-head"><div><p class="eyebrow">PERSONALIZED</p><h2>For You</h2></div>' +
    '<span>' + favorites.length + ' favorite' + (favorites.length === 1 ? '' : 's') + '</span></section>' +
    '<div class="for-you-loading">Updating your teams&hellip;</div>' + homeExplore();

  const leagues = SPORTS.filter((sport) => sport.kind === "league");
  const results = await Promise.allSettled(leagues.map((sport) => getJson(sport.scores)));
  if (current !== "home") return;
  const games = [];
  const teamUpdates = {};
  results.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    const sport = leagues[index];
    ((result.value.data && result.value.data.games) || []).forEach((game) => {
      const teams = [game.away || {}, game.home || {}];
      teams.forEach((team) => {
        const key = favoriteKey(sport.id, team.abbr);
        if (favoriteMap[key]) teamUpdates[key] = Object.assign({}, favoriteMap[key], team);
      });
      if (teams.some((team) => favoriteMap[favoriteKey(sport.id, team.abbr)])) games.push({ sport: sport, game: game });
    });
  });
  const now = Date.now();
  const priority = (item) => item.game.state === "in" ? 0 : (Date.parse(item.game.date) >= now ? 1 : 2);
  games.sort((a, b) => {
    const pa = priority(a), pb = priority(b);
    if (pa !== pb) return pa - pb;
    return pa === 2 ? Date.parse(b.game.date) - Date.parse(a.game.date) : Date.parse(a.game.date) - Date.parse(b.game.date);
  });
  const featured = games.slice(0, 6);
  gamesById = {};
  featured.forEach((item) => { gamesById[item.sport.id + ":" + item.game.id] = item.game; });
  const teamsHtml = favorites.map((saved) => {
    const team = teamUpdates[favoriteKey(saved.sportId, saved.abbr)] || saved;
    const opensProfile = ["nfl", "nba"].includes(saved.sportId);
    return '<button type="button" class="for-you-team" ' + (opensProfile
      ? 'data-team="' + esc(saved.abbr) + '" data-team-sport="' + esc(saved.sportId) + '"'
      : 'data-league="' + esc(saved.sportId) + '"') + '>' +
      (team.logo ? '<img src="' + esc(team.logo) + '" alt="" loading="lazy">' : '<span>' + esc(saved.abbr) + '</span>') +
      '<strong>' + esc(team.name || saved.name || saved.abbr) + '</strong></button>';
  }).join("");
  const gamesHtml = featured.length ? featured.map((item) => '<article class="for-you-game"><div class="league-tag">' +
    esc(item.sport.side || item.sport.label) + '</div>' + gameCard(item.game, !!item.game.id, item.sport.id) + '</article>').join("") :
    '<div class="for-you-no-games"><strong>No games in the current schedule window</strong><span>Your teams are still saved and will appear here when new games are posted.</span></div>';
  view.innerHTML = '<section class="for-you-head"><div><p class="eyebrow">PERSONALIZED</p><h2>For You</h2></div>' +
    '<button type="button" data-open-favorites>Manage favorites</button></section><section class="for-you-teams" aria-label="Favorite teams">' + teamsHtml + '</section>' +
    '<section class="for-you-section"><div class="for-you-section-title"><h3>Your games</h3><span>Live and coming up</span></div>' +
    '<div class="for-you-games">' + gamesHtml + '</div></section>' + homeExplore();
}

async function renderLive() {
  updatedEl.textContent = "";
  view.innerHTML = '<div class="message">Finding live games&hellip;</div>';
  const leagues = SPORTS.filter((s) => s.kind === "league");
  const results = await Promise.allSettled(leagues.map((s) => getJson(s.scores)));
  if (current !== "live") return;
  const live = [];
  results.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    const games = (r.value.data && r.value.data.games) || [];
    games.filter((g) => g.state === "in").forEach((g) => live.push({ sport: leagues[i], game: g }));
  });
  if (!live.length) {
    view.innerHTML = '<section class="empty-state"><h2>No games are live right now</h2>' +
      '<p>Check back when play begins, or choose a league from Home to see recent and upcoming games.</p>' +
      '<button type="button" data-go-home>Browse leagues</button></section>';
    refreshLiveScreen();
    return;
  }
  renderLiveCards(live);
  refreshLiveScreen();
}

function renderLiveCards(live) {
  gamesById = {};
  live.forEach((x) => { gamesById[x.sport.id + ":" + x.game.id] = x.game; });
  view.innerHTML = '<div class="section-title"><h2><span class="live-dot"></span>Live now</h2>' +
    '<span class="live-count">' + live.length + (live.length === 1 ? ' game' : ' games') + '</span></div>' +
    '<section class="live-grid">' + live.map((x) =>
      '<article class="live-league-card"><div class="league-tag">' + esc(x.sport.side || x.sport.label) + '</div>' +
      gameCard(x.game, true, x.sport.id) + '</article>').join("") + '</section>';
}

async function renderFavorites() {
  updatedEl.textContent = "";
  const favorites = Object.values(loadFavorites());
  if (!favorites.length) {
    view.innerHTML = '<section class="empty-state favorites-empty"><div class="empty-star" aria-hidden="true">☆</div>' +
      '<h2>Build your favorites feed</h2><p>Tap the star beside a team on any scores page. Its games will appear here automatically.</p>' +
      '<button type="button" data-go-home>Find a team</button></section>';
    return;
  }

  view.innerHTML = '<div class="message">Loading your teams&hellip;</div>';
  const leagues = SPORTS.filter((sport) => sport.kind === "league");
  const results = await Promise.allSettled(leagues.map((sport) => getJson(sport.scores)));
  if (current !== "favorites") return;
  const favoriteMap = loadFavorites();
  const games = [];
  results.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    const sport = leagues[index];
    ((result.value.data && result.value.data.games) || []).forEach((game) => {
      const teams = [game.away || {}, game.home || {}];
      if (teams.some((team) => favoriteMap[favoriteKey(sport.id, team.abbr)])) games.push({ sport: sport, game: game });
    });
  });
  games.sort((a, b) => Date.parse(a.game.date) - Date.parse(b.game.date));
  gamesById = {};
  games.forEach((item) => { gamesById[item.sport.id + ":" + item.game.id] = item.game; });

  const teamCards = Object.values(favoriteMap).map((team) => {
    const sport = SPORTS.find((item) => item.id === team.sportId) || {};
    const canOpen = ["nfl", "nba"].includes(team.sportId);
    return '<article class="favorite-team-card">' +
      '<button type="button" class="favorite-team-main" ' + (canOpen
        ? 'data-team="' + esc(team.abbr) + '" data-team-sport="' + esc(team.sportId) + '"'
        : 'data-league="' + esc(team.sportId) + '"') + '>' +
      (team.logo ? '<img src="' + esc(team.logo) + '" alt="" loading="lazy">' : '<span class="favorite-team-fallback">' + esc(team.abbr) + '</span>') +
      '<span><strong>' + esc(team.name) + '</strong><small>' + esc(sport.side || sport.label || team.sportId.toUpperCase()) + '</small></span></button>' +
      favoriteButton(team.sportId, team, "favorite-remove") + '</article>';
  }).join("");

  const gameCards = games.length
    ? games.map((item) => '<article class="favorite-game-card"><div class="league-tag">' + esc(item.sport.side || item.sport.label) + '</div>' +
      gameCard(item.game, !!item.game.id && (item.game.state !== "pre" || item.sport.id === "nfl"), item.sport.id) + '</article>').join("")
    : '<section class="card favorites-no-games"><h2>No games in the current window</h2><p>Your teams are saved. Their games will show here when the schedule data includes them.</p></section>';

  view.innerHTML = '<div class="section-title favorites-title"><div><p class="eyebrow">YOUR TEAMS</p><h2>My Favorites</h2></div>' +
    '<span class="live-count">' + Object.keys(favoriteMap).length + ' saved</span></div>' +
    '<section class="favorite-team-grid" aria-label="Favorite teams">' + teamCards + '</section>' +
    '<div class="favorites-games-heading"><h2>Games</h2><span>Live, upcoming and recent</span></div>' +
    '<section class="favorites-game-grid">' + gameCards + '</section>';
}

function timeAgo(iso) {
  const ms = Date.parse(iso);
  if (isNaN(ms)) return "";
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return mins + " min ago";
  const hours = Math.round(mins / 60);
  if (hours < 48) return hours + " hr ago";
  return Math.round(hours / 24) + " days ago";
}

function table(headers, rows) {
  const head = headers
    .map((h) => '<th class="' + (h.num ? "num" : "") + '">' + esc(h.label) + "</th>")
    .join("");
  return "<table><thead><tr>" + head + "</tr></thead><tbody>" + rows.join("") + "</tbody></table>";
}

async function getJson(path) {
  const res = await fetch(path + "?t=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

// ---- F1 ---------------------------------------------------------------------

function raceStartMs(race) {
  return Date.parse(race.date + "T" + (race.time || "00:00:00Z"));
}

function fmtRaceWhen(race) {
  const ms = raceStartMs(race);
  if (isNaN(ms)) return race.date || "";
  const opts = race.time
    ? { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { weekday: "short", month: "short", day: "numeric" };
  return new Date(ms).toLocaleString([], opts);
}

function fmtShortDate(race) {
  const ms = raceStartMs(race);
  if (isNaN(ms)) return race.date || "";
  return new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });
}

function driverFlag(driver, large) {
  if (!driver || !driver.flagCode) return "";
  return '<img class="driver-flag' + (large ? ' large' : '') + '" src="https://flagcdn.com/w40/' +
    esc(String(driver.flagCode).toLowerCase()) + '.png" alt="' + esc(driver.nationality || "Country") + ' flag" loading="lazy">';
}

function driverName(driver) {
  const name = esc(driver.name || driver.code || "Driver");
  if (!driver.driverId) return driverFlag(driver, false) + name;
  return '<button type="button" class="driver-link" data-driver="' + esc(driver.driverId) + '">' +
    driverFlag(driver, false) + '<span>' + name + '</span></button>';
}

function renderF1(payload) {
  const d = payload.data || {};
  const drivers = d.drivers || [];
  const constructors = d.constructors || [];
  const schedule = d.schedule || [];
  const last = d.lastRace || { results: [] };

  const now = Date.now();
  const next = schedule.find((r) => raceStartMs(r) > now);

  let html = "";

  html += '<section class="card next-race"><h2>Next race</h2>';
  if (next) {
    html +=
      '<div class="tap" data-round="' + esc(next.round) + '">' +
      '<div class="name">' + esc(next.name) + ' <span class="chev">&rsaquo;</span></div>' +
      '<div class="when">' + esc(fmtRaceWhen(next)) + "</div>" +
      '<div class="where">' + esc(next.circuit) + " &middot; " + esc(next.location) +
      " &middot; Round " + esc(next.round) + "</div></div>";
  } else {
    html += '<div class="muted">No upcoming races on the schedule.</div>';
  }
  html += "</section>";

  html += '<section class="card"><details><summary>Driver standings</summary>';
  if (drivers.length) {
    html += table(
      [{ label: "#" }, { label: "Driver" }, { label: "Wins", num: true }, { label: "Pts", num: true }],
      drivers.map((r) =>
        '<tr class="tap"><td class="pos">' + esc(r.position) + "</td><td>" + driverName(r) +
        '<span class="sub">' + esc(r.team) + "</span></td>" +
        '<td class="num">' + esc(r.wins) + '</td><td class="num">' + esc(r.points) + "</td></tr>"
      )
    );
  } else {
    html += '<div class="muted">No standings yet.</div>';
  }
  html += "</details></section>";

  html += '<section class="card"><details><summary>Constructor standings</summary>';
  if (constructors.length) {
    html += table(
      [{ label: "#" }, { label: "Team" }, { label: "Wins", num: true }, { label: "Pts", num: true }],
      constructors.map((r) =>
        '<tr><td class="pos">' + esc(r.position) + "</td><td>" + esc(r.name) + "</td>" +
        '<td class="num">' + esc(r.wins) + '</td><td class="num">' + esc(r.points) + "</td></tr>"
      )
    );
  } else {
    html += '<div class="muted">No standings yet.</div>';
  }
  html += "</details></section>";

  html += '<section class="card"><h2' + (last.round > 0 ? ' class="tap" data-round="' + esc(last.round) + '"' : "") + ">Last race" +
    (last.name ? "<small>" + esc(last.name) + "</small>" : "") +
    (last.round > 0 ? ' <span class="chev">&rsaquo;</span>' : "") + "</h2>";
  if (last.results && last.results.length) {
    html += table(
      [{ label: "#" }, { label: "Driver" }, { label: "Result", num: true }, { label: "Pts", num: true }],
      last.results.map((r) =>
        '<tr class="tap"><td class="pos">' + esc(r.position) + "</td><td>" + driverName(r) +
        '<span class="sub">' + esc(r.team) + "</span></td>" +
        '<td class="num">' + esc(r.result) + '</td><td class="num">' + esc(r.points) + "</td></tr>"
      )
    );
  } else {
    html += '<div class="muted">No results yet.</div>';
  }
  html += "</section>";

  html += '<section class="card"><details open><summary>Season schedule <small class="muted">tap a race for details</small></summary>';
  if (schedule.length) {
    html += table(
      [{ label: "Rd" }, { label: "Race" }, { label: "Date", num: true }],
      schedule.map((r) =>
        '<tr class="tap ' + (raceStartMs(r) < now ? "past" : "") + '" data-round="' + esc(r.round) + '"><td class="pos">' + esc(r.round) +
        "</td><td>" + esc(r.name) + '<span class="sub">' + esc(r.location) + "</span></td>" +
        '<td class="num">' + esc(fmtShortDate(r)) + "</td></tr>"
      )
    );
  } else {
    html += '<div class="muted">No schedule yet.</div>';
  }
  html += "</details></section>";

  return html;
}

function driverAge(dateOfBirth) {
  const born = new Date(dateOfBirth);
  if (isNaN(born.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  if (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())) age--;
  return age;
}

function renderDriverProfile(driver, results, season) {
  const finishes = results.map((r) => Number(r.position)).filter((x) => x > 0);
  const podiums = finishes.filter((x) => x <= 3).length;
  const best = finishes.length ? Math.min.apply(null, finishes) : "—";
  const average = finishes.length ? (finishes.reduce((a, b) => a + b, 0) / finishes.length).toFixed(1) : "—";
  const age = driverAge(driver.dateOfBirth);
  const born = driver.dateOfBirth ? new Date(driver.dateOfBirth).toLocaleDateString([], {
    year: "numeric", month: "long", day: "numeric"
  }) : "";
  const facts = [
    ["Championship", driver.position ? "P" + driver.position : "—"],
    ["Points", driver.points != null ? driver.points : "—"],
    ["Wins", driver.wins != null ? driver.wins : "—"],
    ["Podiums", podiums],
    ["Best finish", best === "—" ? best : "P" + best],
    ["Average finish", average]
  ];
  const color = String(driver.teamColor || "e10600").replace(/[^0-9a-f]/gi, "").slice(0, 6) || "e10600";
  const portrait = driver.headshot
    ? '<img class="driver-photo" src="' + esc(driver.headshot) + '" alt="' + esc(driver.name) + '" loading="eager" onerror="this.style.display=\'none\'">'
    : '';
  let html = backButton() + '<section class="driver-hero" style="--driver-color:#' + esc(color) + '">' +
    '<div class="driver-portrait">' + portrait + '<span class="driver-number">' + esc(driver.number || driver.code || "F1") +
    '</span></div><div class="driver-bio">' +
    '<div class="eyebrow">FORMULA 1 DRIVER</div><h2>' + esc(driver.name) + '</h2><p>' +
    driverFlag(driver, false) + esc([driver.nationality, driver.team, driver.number ? "Car " + driver.number : ""].filter(Boolean).join(" · ")) +
    '</p>' + (born ? '<small>Born ' + esc(born) + (age !== "" ? " · Age " + esc(age) : "") + '</small>' : '') + '</div></section>';
  html += '<section class="card"><h2>' + esc(season) + ' season</h2><div class="driver-stat-grid">' +
    facts.map((x) => '<div><span>' + esc(x[0]) + '</span><strong>' + esc(x[1]) + '</strong></div>').join("") + '</div></section>';
  html += '<section class="card"><details open><summary>Season results</summary>' +
    (results.length ? table(
      [{ label: "Rd" }, { label: "Race" }, { label: "Grid", num: true }, { label: "Finish", num: true }, { label: "Pts", num: true }],
      results.map((r) => '<tr><td class="pos">' + esc(r.round) + '</td><td>' + esc(r.race) +
        '<span class="sub">' + esc(r.date || "") + '</span></td><td class="num">' + esc(r.grid) +
        '</td><td class="num"><b>P' + esc(r.position) + '</b><span class="sub">' + esc(r.result) +
        '</span></td><td class="num">' + esc(r.points) + '</td></tr>')
    ) : '<div class="muted">No race results yet.</div>') + '</details></section>';
  if (driver.profileUrl) html += '<p class="muted small driver-source"><a href="' + esc(driver.profileUrl) +
    '" target="_blank" rel="noopener">Driver biography</a></p>';
  return html;
}

async function showF1Driver() {
  const d = detail;
  updatedEl.textContent = "";
  view.innerHTML = backButton() + '<div class="message">Loading driver&hellip;</div>';
  try {
    const payload = await getJson("data/f1.json");
    if (detail !== d) return;
    const data = payload.data || {};
    const driver = (data.drivers || []).find((x) => x.driverId === d.driverId);
    if (!driver) throw new Error("Driver unavailable");
    const results = ((data.driverResults && data.driverResults[d.driverId]) || []).slice()
      .sort((a, b) => Number(a.round) - Number(b.round));
    view.innerHTML = renderDriverProfile(driver, results, data.season || "Current");
  } catch (err) {
    if (detail !== d) return;
    view.innerHTML = backButton() + '<div class="message">Driver information is not available yet. Run the sports-data workflow once, then refresh.</div>';
  }
}

function openF1Driver(driverId) {
  detail = { sportId: "f1", kind: "driver", driverId: driverId, returnTo: current };
  history.pushState({ detail: true }, "", location.href);
  window.scrollTo(0, 0);
  show();
}

// ---- F1 race detail (tap a race) --------------------------------------------

let raceData = null; // results and lap times for the race being viewed

function sessionStartMs(s) {
  return Date.parse(s.date + "T" + (s.time || "00:00:00Z"));
}

function fmtSession(s) {
  const ms = sessionStartMs(s);
  if (isNaN(ms)) return s.date || "";
  const opts = s.time
    ? { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { weekday: "short", month: "short", day: "numeric" };
  return new Date(ms).toLocaleString([], opts);
}

function renderSessions(race) {
  const list = (race.sessions || [])
    .concat([{ name: "Race", date: race.date, time: race.time }])
    .filter((s) => s.date)
    .sort((a, b) => sessionStartMs(a) - sessionStartMs(b));
  const now = Date.now();
  let tz = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { /* ignore */ }

  const rows = list.map((s) =>
    '<tr class="' + (sessionStartMs(s) + 2 * 3600 * 1000 < now ? "past" : "") + '"><td>' + esc(s.name) +
    '</td><td class="num">' + esc(fmtSession(s)) + "</td></tr>"
  );
  return '<section class="card"><h2>Session times</h2>' +
    table([{ label: "Session" }, { label: "When", num: true }], rows) +
    '<p class="muted small">Shown in your local time' + (tz ? " (" + esc(tz) + ")" : "") + ".</p></section>";
}

function f1Seconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return "";
  const mins = Math.floor(seconds / 60);
  return mins ? mins + ":" + (seconds % 60).toFixed(3).padStart(6, "0") : seconds.toFixed(3);
}

function f1SessionValue(value) {
  if (Array.isArray(value)) {
    const available = value.filter((x) => Number.isFinite(Number(x)));
    return available.length ? f1Seconds(available[available.length - 1]) : "—";
  }
  return f1Seconds(value) || "—";
}

function f1WeekendDrivers(weekend) {
  const out = {};
  (weekend.drivers || []).forEach((driver) => { out[String(driver.number)] = driver; });
  return out;
}

function f1SessionRows(session, weekend, limit) {
  const drivers = f1WeekendDrivers(weekend);
  return (session.results || []).slice().sort((a, b) => Number(a.position) - Number(b.position))
    .slice(0, limit || 100).map((result) => {
      const driver = drivers[String(result.driver_number)] || {};
      const gapRaw = Array.isArray(result.gap_to_leader)
        ? result.gap_to_leader.filter((x) => x != null).slice(-1)[0] : result.gap_to_leader;
      const gap = Number(result.position) === 1 ? "LEADER" : (Number.isFinite(Number(gapRaw)) ? "+" + Number(gapRaw).toFixed(3) : "");
      const status = result.dsq ? "DSQ" : result.dns ? "DNS" : result.dnf ? "DNF" : "";
      return { result: result, driver: driver, gap: status || gap, time: f1SessionValue(result.duration) };
    });
}

function f1TrackAsset(race) {
  const text = [race.circuitId, race.circuit, race.name, race.location].filter(Boolean).join(" ").toLowerCase();
  const matches = [
    [/madring|madrid/, "madring"], [/barcelona|catalunya/, "catalunya"], [/albert|melbourne/, "albert_park"],
    [/shanghai|chinese/, "shanghai"], [/suzuka|japanese/, "suzuka"], [/miami/, "miami"],
    [/villeneuve|montreal|canadian/, "villeneuve"], [/monaco|monte carlo/, "monaco"],
    [/red bull ring|spielberg|austrian/, "red_bull_ring"], [/silverstone|british/, "silverstone"],
    [/spa|belgian/, "spa"], [/hungaroring|hungarian/, "hungaroring"], [/zandvoort|dutch/, "zandvoort"],
    [/monza|italian/, "monza"], [/baku|azerbaijan/, "baku"], [/sepang|kuala lumpur|malaysia/, "sepang"],
    [/marina bay|singapore/, "marina_bay"], [/americas|austin|united states/, "americas"],
    [/rodríguez|rodriguez|mexico/, "rodriguez"], [/interlagos|josé carlos pace|jose carlos pace|brazil|são paulo|sao paulo/, "interlagos"],
    [/vegas/, "vegas"], [/lusail|losail|qatar/, "losail"], [/yas marina|abu dhabi/, "yas_marina"]
  ];
  const found = matches.find((item) => item[0].test(text));
  return found ? found[1] : "";
}

function renderF1TrackSvg(track, race) {
  const id = f1TrackAsset(race);
  if (id) {
    const fallback = race.image ? " onerror=\"this.onerror=null;this.src='" + esc(race.image) + "'\"" : "";
    return '<img class="f1-owned-track-img" src="assets/tracks/' + esc(id) + '.svg" alt="' +
      esc(race.circuit) + ' sector map" loading="eager"' + fallback + '>';
  }
  return race.image ? '<img src="' + esc(race.image) + '" alt="' + esc(race.circuit) + ' layout">' : '<div class="f1-track-placeholder">TRACK MAP</div>';
}

function renderF1WeekendControl(race, weekend, track) {
  const sessions = (weekend && weekend.sessions || []).slice().sort((a, b) => Date.parse(a.dateStart) - Date.parse(b.dateStart));
  const completed = sessions.filter((s) => (s.results || []).length);
  const active = completed.length ? completed[completed.length - 1] : null;
  const timing = active ? f1SessionRows(active, weekend, 10) : [];
  const tower = timing.length ? timing.map((row) => {
    const color = String(row.driver.teamColor || "66788d").replace(/[^0-9a-f]/gi, "").slice(0, 6) || "66788d";
    return '<div class="f1-timing-row" style="--f1-team:#' + esc(color) + '"><b>' + esc(row.result.position) +
      '</b><span class="f1-driver-code">' + esc(row.driver.code || row.result.driver_number) + '</span><span class="f1-driver-team">' +
      esc(row.driver.team || "") + '</span><strong>' + esc(row.gap || row.time) + '</strong></div>';
  }).join("") : '<div class="f1-control-empty">Timing appears after the first completed session.</div>';
  const trackArt = renderF1TrackSvg(track, race);
  const cards = sessions.length ? sessions.map((session) => {
    const hasResults = (session.results || []).length > 0;
    const start = Date.parse(session.dateStart);
    const when = isNaN(start) ? "" : new Date(start).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
    return '<button type="button" class="f1-session-link' + (hasResults ? ' complete' : '') + '" data-f1-session="' +
      esc(session.sessionKey) + '" data-f1-round="' + esc(race.round) + '"><span>' + esc(session.name) + '</span><small>' +
      esc(hasResults ? "View results" : when || "Scheduled") + '</small><i>&rsaquo;</i></button>';
  }).join("") : "";
  return '<section class="f1-control"><div class="f1-control-head"><div><span class="f1-control-kicker">WEEKEND CONTROL</span><h2>' +
    esc(race.name) + '</h2><p>' + esc(race.circuit) + ' · Round ' + esc(race.round) + '</p></div><div class="f1-control-state"><i></i>' +
    esc(active ? "LATEST: " + active.name : "UPCOMING") + '</div></div><div class="f1-control-grid"><div class="f1-timing-tower"><div class="f1-timing-head"><span>POS</span><span>DRIVER</span><span>TEAM</span><span>GAP / TIME</span></div>' +
    tower + '</div><div class="f1-track-panel">' + trackArt + '<div><span>' + esc(race.location) + '</span><strong>' +
    esc(active ? active.name : fmtRaceWhen(race)) + '</strong></div></div></div>' +
    (cards ? '<div class="f1-session-links">' + cards + '</div>' : '') + '</section>';
}

function renderF1SessionPage(race, weekend, session) {
  const rows = f1SessionRows(session, weekend);
  const drivers = f1WeekendDrivers(weekend);
  const start = Date.parse(session.dateStart);
  const subtitle = [race.name, isNaN(start) ? "" : new Date(start).toLocaleString([], {
    weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
  })].filter(Boolean).join(" · ");
  return backButton() + '<section class="f1-session-hero"><span>SESSION RESULTS</span><h2>' + esc(session.name) +
    '</h2><p>' + esc(subtitle) + '</p></section><section class="card f1-session-results">' +
    (rows.length ? '<div class="scroll">' + table([{ label: "Pos" }, { label: "Driver" }, { label: "Team" }, { label: "Best / Time", num: true },
      { label: "Gap", num: true }, { label: "Laps", num: true }], rows.map((row) => {
        const driver = drivers[String(row.result.driver_number)] || row.driver;
        return '<tr><td class="pos"><b>' + esc(row.result.position) + '</b></td><td><span class="f1-result-driver"><i style="--f1-team:#' +
          esc(String(driver.teamColor || "66788d").replace(/[^0-9a-f]/gi, "")) + '"></i><strong>' + esc(driver.name || driver.code || row.result.driver_number) +
          '</strong></span></td><td>' + esc(driver.team || "") + '</td><td class="num">' + esc(row.time) + '</td><td class="num">' +
          esc(row.gap) + '</td><td class="num">' + esc(row.result.number_of_laps == null ? "" : row.result.number_of_laps) + '</td></tr>';
      })) + '</div>' : '<div class="muted">Results will appear after this session is complete and the data workflow runs.</div>') + '</section>';
}

function renderTrack(race) {
  if (!race.image && !race.circuitUrl) return "";
  let html = '<section class="card"><h2>Track layout</h2>';
  if (race.image) {
    html += '<div class="track"><img class="trackimg" src="' + esc(race.image) + '" alt="' +
      esc(race.circuit) + ' layout" loading="lazy"></div>';
  }
  html += '<p class="muted small">' + esc(race.circuit);
  if (race.circuitUrl) {
    html += ' &middot; <a href="' + esc(race.circuitUrl) + '" target="_blank" rel="noopener">Circuit on Wikipedia</a>';
  }
  return html + "</p></section>";
}

function lapMs(t) {
  if (!t) return NaN;
  const parts = String(t).split(":");
  if (parts.length === 2) return parseInt(parts[0], 10) * 60000 + parseFloat(parts[1]) * 1000;
  return parseFloat(parts[0]) * 1000;
}

function bestLap(driver) {
  let best = { ms: Infinity, lap: 0 };
  (driver.times || []).forEach((t, i) => {
    const ms = lapMs(t);
    if (!isNaN(ms) && ms < best.ms) best = { ms: ms, lap: i + 1 };
  });
  return best.ms === Infinity ? null : best;
}

function renderRaceResults(rd) {
  const results = rd.results || [];
  if (!results.length) return "";
  return '<section class="card"><h2>Results</h2>' + table(
    [{ label: "#" }, { label: "Driver" }, { label: "Grid", num: true }, { label: "Result", num: true }, { label: "Pts", num: true }],
    results.map((r) =>
      '<tr class="tap"><td class="pos">' + esc(r.position) + "</td><td>" + driverName(r) +
      '<span class="sub">' + esc(r.team) + "</span></td>" +
      '<td class="num">' + esc(r.grid) + '</td><td class="num">' + esc(r.result) +
      '</td><td class="num">' + esc(r.points) + "</td></tr>"
    )
  ) + "</section>";
}

function renderLapTable(rd, driverId) {
  const drivers = rd.laps || [];
  const drv = drivers.find((x) => x.driverId === driverId) || drivers[0];
  if (!drv) return "";
  const best = bestLap(drv);

  let overall = Infinity;
  drivers.forEach((x) => { const b = bestLap(x); if (b && b.ms < overall) overall = b.ms; });

  const rows = (drv.times || []).map((t, i) => {
    const ms = lapMs(t);
    const isBest = best && best.lap === i + 1;
    const delta = best && !isNaN(ms) ? (ms === best.ms ? "best" : "+" + ((ms - best.ms) / 1000).toFixed(3)) : "";
    const pos = drv.positions && drv.positions[i] ? drv.positions[i] : "";
    const cls = (isBest ? "best" : "") + (isBest && best.ms === overall ? " fastest" : "");
    return '<tr class="' + cls + '"><td class="pos">' + (i + 1) + '</td><td class="num">' + esc(t) +
      '</td><td class="num">' + esc(pos) + '</td><td class="num">' + esc(delta) + "</td></tr>";
  });

  return table(
    [{ label: "Lap" }, { label: "Time", num: true }, { label: "Pos", num: true }, { label: "vs best", num: true }],
    rows
  );
}

function renderLapSection(rd) {
  const drivers = rd.laps || [];
  if (!drivers.length) {
    return '<section class="card"><h2>Lap times</h2><div class="muted">Lap times aren\'t available for this race.</div></section>';
  }

  // Fastest lap per driver, quickest first.
  const ranked = drivers
    .map((x) => ({ x: x, b: bestLap(x) }))
    .filter((e) => e.b)
    .sort((a, b) => a.b.ms - b.b.ms);
  const fastest = ranked.length ? ranked[0].b.ms : 0;

  const bestRows = ranked.map((e, i) =>
    '<tr><td class="pos">' + (i + 1) + "</td><td>" + esc(e.x.name) + '</td><td class="num">' +
    esc(e.x.times[e.b.lap - 1]) + '</td><td class="num">' + e.b.lap + '</td><td class="num">' +
    (i === 0 ? "" : "+" + ((e.b.ms - fastest) / 1000).toFixed(3)) + "</td></tr>"
  );

  const options = drivers.map((x) =>
    '<option value="' + esc(x.driverId) + '">' + esc(x.name) + "</option>"
  ).join("");

  return '<section class="card"><details open><summary>Fastest laps</summary>' +
    table([{ label: "#" }, { label: "Driver" }, { label: "Best", num: true }, { label: "Lap", num: true }, { label: "Gap", num: true }], bestRows) +
    "</details></section>" +
    '<section class="card"><h2>Lap by lap</h2>' +
    '<label class="sel">Driver <select id="lapDriver">' + options + "</select></label>" +
    '<div id="lapTable">' + renderLapTable(rd, drivers[0].driverId) + "</div></section>";
}

function wireTrackImage() {
  if (!view.querySelectorAll) return;
  view.querySelectorAll("img.trackimg").forEach((img) => {
    img.addEventListener("error", () => { img.parentNode.style.display = "none"; });
  });
}

async function showRace() {
  const d = detail;
  const key = "f1:" + d.round;
  // Already showing this race: leave it alone so your scroll and driver choice stay put.
  if (view.getAttribute("data-detail") === key) return;

  updatedEl.textContent = "";
  view.innerHTML = backButton() + '<div class="message">Loading&hellip;</div>';
  view.setAttribute("data-detail", key);

  let f1;
  try {
    f1 = await getJson("data/f1.json");
  } catch (err) {
    if (detail !== d) return;
    view.innerHTML = backButton() + NO_DATA;
    return;
  }
  if (detail !== d) return;

  const data = f1.data || {};
  const race = (data.schedule || []).find((r) => r.round === d.round);
  if (!race) {
    view.innerHTML = backButton() + '<div class="message">Couldn\'t find that race.</div>';
    return;
  }

  let weekend = null;
  try {
    weekend = (await getJson("data/f1_weekend_" + (data.season || "") + "_" + String(race.round).padStart(2, "0") + ".json")).data || null;
  } catch (err) { /* The workflow may not have created this weekend yet. */ }
  if (detail !== d) return;

  let html = backButton() + renderF1WeekendControl(race, weekend || {}, null);
  if (!weekend) html += renderSessions(race);

  const finished = raceStartMs(race) + 3 * 3600 * 1000 < Date.now();
  if (finished) {
    const file = "data/f1_race_" + (data.season || "") + "_" + String(race.round).padStart(2, "0") + ".json";
    try {
      const rd = (await getJson(file)).data || {};
      if (detail !== d) return;
      const driverMeta = {};
      (data.drivers || []).forEach((x) => { driverMeta[x.driverId] = x; });
      rd.results = (rd.results || []).map((r) => Object.assign({}, driverMeta[r.driverId] || {}, r));
      raceData = rd;
      html += renderRaceResults(rd) + renderLapSection(rd);
    } catch (err) {
      if (detail !== d) return;
      html += '<section class="card"><h2>Results and lap times</h2><div class="muted">' +
        "Not saved yet. The data updater adds finished races a few at a time, so check back after the next update.</div></section>";
    }
  } else {
    html += '<section class="card"><div class="muted">Results and lap times show up here after the race.</div></section>';
  }

  if (detail !== d) return;
  view.innerHTML = html;
  wireTrackImage();
}

async function showF1Session() {
  const d = detail;
  updatedEl.textContent = "";
  view.innerHTML = backButton() + '<div class="message">Loading session results&hellip;</div>';
  try {
    const f1 = await getJson("data/f1.json");
    const data = f1.data || {};
    const race = (data.schedule || []).find((item) => Number(item.round) === Number(d.round));
    if (!race) throw new Error("Race missing");
    const weekend = (await getJson("data/f1_weekend_" + (data.season || "") + "_" + String(d.round).padStart(2, "0") + ".json")).data || {};
    const session = (weekend.sessions || []).find((item) => String(item.sessionKey) === String(d.sessionKey));
    if (!session) throw new Error("Session missing");
    if (detail !== d) return;
    view.innerHTML = renderF1SessionPage(race, weekend, session);
  } catch (err) {
    if (detail !== d) return;
    view.innerHTML = backButton() + '<div class="message">These session results have not been downloaded yet. Run the data workflow once, then refresh.</div>';
  }
}

function openF1Session(round, sessionKey) {
  detail = { sportId: "f1", kind: "f1-session", round: Number(round), sessionKey: String(sessionKey), returnTo: "f1" };
  history.pushState({ detail: true }, "", location.href);
  window.scrollTo(0, 0);
  show();
}

function openRace(round) {
  detail = { sportId: "f1", kind: "race", round: round };
  history.pushState({ detail: true }, "", location.href);
  window.scrollTo(0, 0);
  show();
}

// ---- NFL / NBA / MLB / CFB --------------------------------------------------

function dayKey(ms) {
  const d = new Date(ms);
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

function dayLabel(ms) {
  const key = dayKey(ms);
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();
  if (key === dayKey(now)) return "Today";
  if (key === dayKey(now - DAY)) return "Yesterday";
  if (key === dayKey(now + DAY)) return "Tomorrow";
  return new Date(ms).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function teamRow(t, state, isWinner, sportId) {
  const rank = t.rank > 0 ? '<span class="rank">' + esc(t.rank) + "</span> " : "";
  const rec = t.record ? "<small>" + esc(t.record) + "</small>" : "";
  const score = state === "pre" ? "" : esc(t.score);
  const mark = t.logo
    ? '<img class="team-logo" src="' + esc(t.logo) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
    : '<span class="team-fallback">' + esc(t.abbr || "") + '</span>';
  const name = '<span class="team-name">' + esc(t.name || t.abbr) + '</span>';
  const linkedName = ["nfl", "nba"].includes(sportId) && t.abbr
    ? '<button type="button" class="team-link" data-team="' + esc(t.abbr) + '" data-team-sport="' + esc(sportId) + '" aria-label="View ' +
      esc(t.name || t.abbr) + '">' + name + '</button>'
    : name;
  return '<div class="team' + (isWinner ? " win" : "") + '">' +
    '<span class="team-mark">' + mark + '</span>' +
    '<span class="tname">' + rank + linkedName + rec + "</span>" +
    favoriteButton(sportId, t, "game-favorite") +
    '<span class="score">' + score + "</span></div>";
}

function gameCard(g, tappable, sportId) {
  const away = g.away || {};
  const home = g.home || {};
  let awayWin = !!away.winner;
  let homeWin = !!home.winner;
  if (g.state === "post" && !awayWin && !homeWin) {
    const a = parseInt(away.score, 10);
    const h = parseInt(home.score, 10);
    if (!isNaN(a) && !isNaN(h) && a !== h) { awayWin = a > h; homeWin = h > a; }
  }

  let status = esc(g.detail);
  if (g.state === "pre") {
    const ms = Date.parse(g.date);
    if (!isNaN(ms)) {
      status = esc(new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    }
  }

  const attrs = tappable
    ? ' class="game tap" role="button" tabindex="0" data-id="' + esc(g.id) + '"' +
      (sportId ? ' data-sport="' + esc(sportId) + '"' : '')
    : ' class="game"';

  return "<div" + attrs + ">" +
    '<div class="game-status"><span class="status ' + esc(g.state) + '">' + status + '</span></div>' +
    '<div class="teams">' + teamRow(away, g.state, awayWin, sportId) + teamRow(home, g.state, homeWin, sportId) + "</div>" +
    (tappable ? '<div class="view-game">View game <span aria-hidden="true">&rarr;</span></div>' : '') + '</div>';
}

function renderGames(games, sport) {
  if (!games.length) {
    return '<section class="card"><h2>Scores</h2>' +
      '<div class="muted">No games to show right now.</div></section>';
  }

  gamesById = {};
  games.forEach((g) => { gamesById[g.id] = g; });

  const sorted = games.slice().sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const groups = [];
  const byKey = {};
  sorted.forEach((g) => {
    const ms = Date.parse(g.date);
    const key = isNaN(ms) ? "tbd" : dayKey(ms);
    if (!byKey[key]) {
      byKey[key] = { label: isNaN(ms) ? "Date TBD" : dayLabel(ms), games: [] };
      groups.push(byKey[key]);
    }
    byKey[key].games.push(g);
  });

  return groups.map((grp, index) => {
    const hasLive = grp.games.some((g) => g.state === "in");
    const open = grp.label === "Today" || hasLive || (index === 0 && !groups.some((x) => x.label === "Today"));
    return '<section class="card game-day"><details' + (open ? " open" : "") + '><summary><span>' + esc(grp.label) +
      '</span><small>' + grp.games.length + ' game' + (grp.games.length === 1 ? "" : "s") + '</small></summary><div class="game-day-list">' +
      grp.games.map((g) => gameCard(g, !!g.id, sport && sport.id)).join("") +
      "</div></details></section>";
  }).join("");
}

function standingLogoFallback(sportId, teamId, abbr) {
  const league = { nfl: "nfl", nba: "nba", mlb: "mlb", nhl: "nhl" }[sportId];
  const key = teamId || String(abbr || "").toLowerCase();
  return league && key ? "https://a.espncdn.com/i/teamlogos/" + league + "/500/" + encodeURIComponent(key) + ".png" : "";
}

function renderStandings(data, sportId, scoreLogos) {
  const groups = (data && data.groups) || [];
  if (!groups.length) return "";
  const season = data.season ? " &middot; " + esc(data.season) : "";

  const body = groups.map((grp) => {
    const teams = grp.teams || [];
    const hasGb = teams.some((t) => t.gb && t.gb !== "-" && t.gb !== "0");
    const hasStreak = teams.some((t) => t.streak);
    const hasLastTen = teams.some((t) => t.lastTen);

    const headers = [{ label: "#" }, { label: "Team" }, { label: "Record", num: true }];
    if (hasGb) headers.push({ label: "GB", num: true });
    if (hasLastTen) headers.push({ label: "L10", num: true });
    if (hasStreak) headers.push({ label: "Strk", num: true });

    const rows = teams.map((t, index) => {
      const crest = t.logo || (scoreLogos && scoreLogos[String(t.abbr || "").toUpperCase()]) || standingLogoFallback(sportId, t.id, t.abbr);
      const displayTeam = Object.assign({}, t, { logo: crest });
      const name = '<span class="standings-team-name">' + esc(t.name || t.abbr) + '</span>';
      const linked = ["nfl", "nba"].includes(sportId) && t.abbr
        ? '<button type="button" class="team-link" data-team="' + esc(t.abbr) + '" data-team-sport="' + esc(sportId) + '">' + name + '</button>' : name;
      let cells = '<td class="pos">' + (index + 1) + '</td><td><span class="standings-team">' +
        (crest ? '<img src="' + esc(crest) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '<span class="standings-abbr">' + esc(t.abbr || "") + '</span>') +
        '<span>' + linked + (t.note ? '<small>' + esc(t.note) + '</small>' : '') + '</span>' + favoriteButton(sportId, displayTeam, "standings-favorite") +
        '</span></td><td class="num">' + esc(t.record) + "</td>";
      if (hasGb) cells += '<td class="num">' + esc(t.gb) + "</td>";
      if (hasLastTen) cells += '<td class="num standings-form">' + esc(t.lastTen) + "</td>";
      if (hasStreak) cells += '<td class="num">' + esc(t.streak) + "</td>";
      return '<tr class="standings-row">' + cells + "</tr>";
    });

    return (grp.name ? '<h3 class="standings-group-title">' + esc(grp.name) + "</h3>" : "") +
      '<div class="standings-scroll">' + table(headers, rows).replace('<table>', '<table class="standings-table">') + '</div>';
  }).join("");

  const open = window.matchMedia && window.matchMedia("(min-width: 721px)").matches ? " open" : "";
  return '<section class="card"><details' + open + '><summary>Standings' + season + "</summary>" + body + "</details></section>";
}

function nflLeaderCandidates(node, path, out) {
  if (!node || typeof node !== "object") return out;
  const nextPath = path + " " + (node.name || node.displayName || node.label || "");
  if (node.athlete && (node.displayValue != null || node.value != null)) {
    const athlete = node.athlete || {};
    const raw = node.value != null ? Number(node.value) : Number(String(node.displayValue).replace(/[^0-9.-]/g, ""));
    out.push({ athlete: athlete, value: Number.isFinite(raw) ? raw : 0,
      displayValue: node.displayValue != null ? node.displayValue : node.value, path: nextPath });
  }
  Object.keys(node).forEach((key) => {
    const value = node[key];
    if (value && typeof value === "object") nflLeaderCandidates(value, nextPath + " " + key, out);
  });
  return out;
}

function nflTeamPlayerLeader(entry, pattern) {
  const candidates = nflLeaderCandidates((entry && entry.leaders) || {}, "", [])
    .filter((item) => pattern.test(item.path));
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.value - a.value);
  return candidates[0];
}

function nflTeamStatNumber(entry, names, pathTest) {
  return findTeamNumber(flattenTeamStats((entry && entry.stats) || {}, "", []), names, pathTest);
}

function renderNFLSeasonLeaders(cache) {
  const teams = cache && cache.data && cache.data.teams || {};
  const entries = Object.keys(teams).map((abbr) => ({ abbr: abbr, entry: teams[abbr] }));
  if (!entries.length) return "";

  const playerGroups = [
    { label: "QB", title: "Passing yards", pattern: /pass[^ ]*yard|passing yards|passing.*yard/i },
    { label: "RB", title: "Rushing yards", pattern: /rush[^ ]*yard|rushing yards|rushing.*yard/i },
    { label: "WR", title: "Receiving yards", pattern: /receiv[^ ]*yard|receiving yards|receiving.*yard/i }
  ];
  const playerHtml = playerGroups.map((group) => {
    const leaders = entries.map(({ abbr, entry }) => {
      const lead = nflTeamPlayerLeader(entry, group.pattern);
      if (!lead) return null;
      const athlete = lead.athlete || {};
      return { abbr: abbr, id: athlete.id || athleteId(athlete), name: athlete.shortName || athlete.displayName || athlete.fullName || "Player",
        value: lead.value, displayValue: lead.displayValue, headshot: nflPlayerImage(athlete) };
    }).filter(Boolean).sort((a, b) => b.value - a.value).slice(0, 5);
    return '<div class="leader-board"><div class="leader-board-title"><span>' + esc(group.label) + '</span><div><strong>' + esc(group.title) +
      '</strong><small>Top 5</small></div></div>' + (leaders.length ? leaders.map((lead, index) =>
        '<div class="season-leader-row"><b>' + (index + 1) + '</b>' + (lead.headshot ? '<img src="' + esc(lead.headshot) + '" alt="">' : '<span class="leader-avatar">' + esc(lead.abbr) + '</span>') +
        '<div><button type="button" class="nfl-player-link" data-nfl-player="' + esc(lead.id) + '" data-player-team="' + esc(lead.abbr) + '">' +
        esc(lead.name) + '</button><small>' + esc(lead.abbr) + '</small></div><strong>' + esc(lead.displayValue) + '</strong></div>').join("")
        : '<div class="muted small leader-empty">Leader data is updating.</div>') + '</div>';
  }).join("");

  const teamMetrics = [
    { section: "Offensive leaders", label: "Total yards", names: ["totalYards", "totalOffensiveYards", "offensiveYards"], path: /offen|team|general/i, low: false },
    { section: "Offensive leaders", label: "Passing yards", names: ["passingYards", "netPassingYards"], path: /offen|team|pass/i, low: false },
    { section: "Offensive leaders", label: "Rushing yards", names: ["rushingYards", "totalRushingYards"], path: /offen|team|rush/i, low: false },
    { section: "Defensive leaders", label: "Yards allowed", names: ["totalYardsAllowed", "yardsAllowed", "opponentTotalYards"], path: /defen|opponent/i, low: true },
    { section: "Defensive leaders", label: "Sacks", names: ["sacks", "totalSacks"], path: /defen/i, low: false },
    { section: "Defensive leaders", label: "Turnovers", names: ["takeaways", "totalTakeaways", "turnoversForced"], path: /defen|opponent/i, low: false }
  ];
  const teamSections = ["Offensive leaders", "Defensive leaders"].map((section) => {
    const metrics = teamMetrics.filter((metric) => metric.section === section).map((metric) => {
      const ranked = entries.map(({ abbr, entry }) => {
        const value = nflTeamStatNumber(entry, metric.names, metric.path);
        return value == null ? null : { abbr: abbr, entry: entry, value: value };
      }).filter(Boolean).sort((a, b) => metric.low ? a.value - b.value : b.value - a.value).slice(0, 3);
      return '<div class="team-leader-metric"><h4>' + esc(metric.label) + '</h4>' + (ranked.length ? ranked.map((row, index) => {
        const team = row.entry.team || {};
        const logo = teamLogo(team);
        return '<div><b>' + (index + 1) + '</b>' + (logo ? '<img src="' + esc(logo) + '" alt="">' : '') +
          '<button type="button" class="team-link" data-team="' + esc(row.abbr) + '" data-team-sport="nfl"><span class="team-name">' +
          esc(team.shortDisplayName || team.name || row.abbr) + '</span></button><strong>' + esc(Number(row.value).toLocaleString()) + '</strong></div>';
      }).join("") : '<p class="muted small">Updating</p>') + '</div>';
    }).join("");
    return '<div class="team-leader-group"><h3>' + esc(section) + '</h3><div class="team-leader-grid">' + metrics + '</div></div>';
  }).join("");

  const open = window.matchMedia && window.matchMedia("(min-width: 721px)").matches ? " open" : "";
  return '<section class="card nfl-season-leaders"><details' + open + '><summary>Season leaders</summary><h3>Player leaders</h3>' +
    '<div class="player-leader-grid">' + playerHtml + '</div><div class="team-leaders-wrap">' + teamSections + '</div>' +
    '<p class="muted small">NFL regular-season totals. Yards allowed ranks the lowest total first.</p></details></section>';
}

function renderRankings(data) {
  const teams = (data && data.teams) || [];
  if (!teams.length) return "";

  const rows = teams.map((t) => {
    let trend = "";
    if (t.previous > 0 && t.previous !== t.rank) {
      trend = t.rank < t.previous
        ? '<span class="up">&#9650;' + (t.previous - t.rank) + "</span>"
        : '<span class="down">&#9660;' + (t.rank - t.previous) + "</span>";
    }
    return '<tr><td class="pos">' + esc(t.rank) + "</td><td>" + esc(t.name) +
      (t.record ? '<span class="sub">' + esc(t.record) + "</span>" : "") + "</td>" +
      '<td class="num">' + trend + "</td></tr>";
  });

  const open = window.matchMedia && window.matchMedia("(min-width: 721px)").matches ? " open" : "";
  return '<section class="card"><details' + open + '><summary>' + esc(data.name || "Top 25") + "</summary>" +
    table([{ label: "#" }, { label: "Team" }, { label: "", num: true }], rows) +
    "</details></section>";
}

function sideSwitch(sport) {
  if (!sport.group) return "";
  return '<div class="switch">' + SPORTS.filter((s) => s.group === sport.group).map((s) =>
    '<button type="button" data-switch="' + esc(s.id) + '" class="' + (s.id === sport.id ? "active" : "") + '">' +
    esc(s.side) + "</button>"
  ).join("") + "</div>";
}

// ---- Golf ---------------------------------------------------------------------

function fmtRange(startIso, endIso) {
  const a = Date.parse(startIso);
  const b = Date.parse(endIso);
  if (isNaN(a)) return "";
  const opts = { month: "short", day: "numeric" };
  const s = new Date(a).toLocaleDateString([], opts);
  // ESPN's end time is early on the day after the last round, so back it up an hour.
  const e = isNaN(b) ? "" : new Date(b - 3600 * 1000).toLocaleDateString([], opts);
  return e && e !== s ? s + " – " + e : s;
}

function golfHeadshot(player, profile) {
  const image = (profile && profile.headshot) || player.headshot || "";
  if (typeof image === "string") return image;
  return image.href || "";
}

function golfStatEntries(summary) {
  const found = [];
  const visit = (node, path) => {
    if (!node || typeof node !== "object") return;
    if (node.name && (node.displayValue != null || node.value != null)) {
      found.push({ name: node.name, label: node.displayName || node.label || node.name,
        value: node.displayValue != null ? node.displayValue : node.value, path: path });
    }
    Object.keys(node).forEach((key) => {
      if (node[key] && typeof node[key] === "object") visit(node[key], path + " " + key);
    });
  };
  visit({ stats: summary.stats || [], rounds: summary.rounds || [] }, "");
  return found;
}

function golfStat(stats, names) {
  const clean = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const wanted = names.map(clean);
  const hit = stats.find((x) => wanted.includes(clean(x.name)) || wanted.includes(clean(x.label))) ||
    stats.find((x) => wanted.some((name) => name.length > 6 && (clean(x.name).includes(name) || clean(x.label).includes(name))));
  return hit ? hit.value : "Not available";
}

function renderGolfPerformance(summary) {
  const stats = golfStatEntries(summary || {});
  const requested = [
    ["SG: Total", ["strokesGainedTotal", "strokesGained", "sgTotal"]],
    ["Scoring average", ["scoringAverage", "scoreAverage", "avgScore"]],
    ["SG: Off-the-Tee", ["strokesGainedOffTheTee", "strokesGainedTee", "sgOffTheTee"]],
    ["SG: Approach", ["strokesGainedApproach", "strokesGainedApproachTheGreen", "sgApproach"]],
    ["SG: Around-the-Green", ["strokesGainedAroundTheGreen", "strokesGainedAroundGreen", "sgAroundTheGreen"]],
    ["SG: Putting", ["strokesGainedPutting", "sgPutting"]]
  ];
  return '<section class="card team-section"><h2>Performance</h2><div class="golf-stat-grid">' +
    requested.map((item) => statTile(item[0], golfStat(stats, item[1]))).join("") + '</div>' +
    '<p class="muted small">Tournament statistics from ESPN. Strokes-gained data is not published for every course or event.</p></section>';
}

function golfScoreTypeClass(hole) {
  const name = String((hole.scoreType || {}).name || "").toLowerCase();
  if (/eagle|albatross/.test(name)) return "eagle";
  if (/birdie/.test(name)) return "birdie";
  if (/double|triple|worse/.test(name)) return "double";
  if (/bogey/.test(name)) return "bogey";
  return "";
}

function renderGolfScorecards(summary, player) {
  const rounds = (summary.rounds || []).slice().sort((a, b) => Number(a.period) - Number(b.period));
  if (!rounds.length) {
    const fallback = (player.rounds || []).map((score, index) =>
      '<details class="golf-round"' + (index === 0 ? " open" : "") + '><summary>Round ' + (index + 1) + '<strong>' + esc(score) +
      '</strong></summary><div class="muted golf-round-note">Hole-by-hole scores are not available yet.</div></details>').join("");
    return '<section class="card team-section"><h2>Scorecard</h2>' + (fallback || '<div class="muted">No rounds posted yet.</div>') + '</section>';
  }
  const html = rounds.map((round, index) => {
    const holes = round.linescores || [];
    const rows = holes.map((hole) => '<tr><td class="pos">' + esc(hole.period) + '</td><td class="num">' + esc(hole.par) +
      '</td><td class="num"><span class="golf-hole-score ' + golfScoreTypeClass(hole) + '">' + esc(hole.displayValue || hole.value) +
      '</span></td><td>' + esc((hole.scoreType || {}).displayName || "") + '</td></tr>');
    const total = round.displayValue || round.value || "";
    const split = [round.outScore != null ? "Out " + round.outScore : "", round.inScore != null ? "In " + round.inScore : ""].filter(Boolean).join(" · ");
    return '<details class="golf-round"' + (index === rounds.length - 1 ? " open" : "") + '><summary>Round ' +
      esc(round.period || index + 1) + '<span>' + esc(split) + '</span><strong>' + esc(total) + '</strong></summary>' +
      (rows.length ? '<div class="scroll">' + table([{ label: "Hole" }, { label: "Par", num: true }, { label: "Score", num: true }, { label: "Result" }], rows) + '</div>' :
        '<div class="muted golf-round-note">Hole-by-hole scores are not available yet.</div>') + '</details>';
  }).join("");
  return '<section class="card team-section"><h2>Scorecard</h2>' + html + '</section>';
}

async function showGolfPlayer() {
  const d = detail;
  updatedEl.textContent = "";
  view.innerHTML = backButton() + '<div class="message">Loading golfer profile&hellip;</div>';
  try {
    const golf = await getJson("data/golf.json");
    const data = golf.data || {};
    const player = (data.players || []).find((x) => String(x.id) === String(d.playerId));
    if (!player) throw new Error("Player not found");
    let summary = {};
    try {
      const event = data.event || {};
      const url = "https://site.web.api.espn.com/apis/site/v2/sports/golf/pga/leaderboard/" +
        encodeURIComponent(event.id) + "/playersummary?season=" + encodeURIComponent(event.season || new Date().getFullYear()) +
        "&player=" + encodeURIComponent(player.id);
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) summary = await response.json();
    } catch (err) { /* leaderboard data still supplies a useful fallback profile */ }
    if (detail !== d) return;
    const profile = summary.profile || {};
    const photo = golfHeadshot(player, profile) || (player.id ? "https://a.espncdn.com/i/headshots/golf/players/full/" + encodeURIComponent(player.id) + ".png" : "");
    const bio = [profile.age ? "Age " + profile.age : "", profile.college || "", profile.hand ? profile.hand + "-handed" : "", player.country || ""].filter(Boolean);
    view.innerHTML = backButton() + '<section class="golfer-hero">' +
      (photo ? '<img src="' + esc(photo) + '" alt="' + esc(player.name) + '" onerror="this.style.display=\'none\'">' : '') +
      '<div><div class="eyebrow">PGA TOUR PLAYER</div><h2>' + esc(profile.displayName || player.name) + '</h2><p>' + esc(bio.join(" · ")) +
      '</p><div class="golfer-current"><b>' + esc(player.pos) + '</b><span>' + esc(player.toPar) + '</span><small>' + esc(player.thru) + '</small></div></div></section>' +
      renderGolfPerformance(summary) + renderGolfScorecards(summary, player);
  } catch (err) {
    if (detail !== d) return;
    view.innerHTML = backButton() + '<div class="message">Couldn\'t load this golfer right now. Try again after the next data update.</div>';
  }
}

function openGolfPlayer(playerId) {
  detail = { sportId: "golf", kind: "golfer", playerId: playerId, returnTo: current };
  history.pushState({ detail: true }, "", location.href);
  window.scrollTo(0, 0);
  show();
}

function renderGolf(payload) {
  const d = payload.data || {};
  const ev = d.event;
  const players = d.players || [];
  const schedule = d.schedule || [];
  let html = "";

  if (ev) {
    const live = ev.state === "in";
    html += '<section class="card next-race"><div class="name">' + esc(ev.name) + "</div>" +
      '<div class="when">' + esc(fmtRange(ev.start, ev.end)) + "</div>" +
      '<div class="where"><span class="' + (live ? "livetag" : "") + '">' + esc(ev.detail || "") + "</span></div></section>";

    if (players.length) {
      if (ev.round >= 2 && ev.cutLine) {
        html += '<div class="golf-cut-line"><span>' + (ev.cutOfficial ? "CUT LINE" : "PROJECTED CUT") + '</span><strong>' + esc(ev.cutLine) + '</strong></div>';
      }
      const maxRounds = Math.min(4, Math.max.apply(null, players.map((p) => (p.rounds || []).length).concat([0])));
      const heads = [{ label: "Pos" }, { label: "Player" }, { label: "Score", num: true }, { label: "Thru", num: true }];
      for (let i = 1; i <= maxRounds; i++) heads.push({ label: "R" + i, num: true });

      const rows = players.map((p) => {
        let cells = '<td class="pos">' + esc(p.pos) + '</td><td><button type="button" class="golfer-link" data-golfer="' + esc(p.id) + '">' + esc(p.name) + '</button>' +
          (p.country ? '<span class="sub">' + esc(p.country) + "</span>" : "") + "</td>" +
          '<td class="num"><b>' + esc(p.toPar) + "</b></td>" +
          '<td class="num">' + esc(p.thru) + "</td>";
        for (let i = 0; i < maxRounds; i++) cells += '<td class="num">' + esc((p.rounds || [])[i] || "") + "</td>";
        return "<tr>" + cells + "</tr>";
      });
      html += '<section class="card"><h2>Leaderboard<small>' + players.length + ' players</small></h2>' +
        '<div class="scroll"><table class="box">' +
        "<thead><tr>" + heads.map((h) => '<th class="' + (h.num ? "num" : "") + '">' + esc(h.label) + "</th>").join("") + "</tr></thead>" +
        "<tbody>" + rows.join("") + "</tbody></table></div></section>";
    } else {
      html += '<section class="card"><div class="muted">The leaderboard shows up here once the field is posted ' +
        "and play starts. It refreshes every few minutes.</div></section>";
    }
  } else {
    html += '<section class="card"><div class="muted">No tournament on the schedule right now.</div></section>';
  }

  if (schedule.length) {
    const now = Date.now();
    const rows = schedule.map((t) => {
      const past = Date.parse(t.end) < now;
      return '<tr class="' + (past ? "past" : "") + '"><td>' + esc(t.name) + '</td><td class="num">' +
        esc(fmtRange(t.start, t.end)) + "</td></tr>";
    });
    html += '<section class="card"><details><summary>Season schedule</summary>' +
      table([{ label: "Tournament" }, { label: "Dates", num: true }], rows) + "</details></section>";
  }
  return html;
}

// League table for soccer: position, team, played, won, drawn, lost, goal difference, points.
function renderSoccerTable(data) {
  const groups = (data && data.groups) || [];
  if (!groups.length) return "";
  const season = data.season ? ' <small class="muted">' + esc(data.season) + "</small>" : "";

  const body = groups.map((grp) => {
    const teams = grp.teams || [];
    const heads = [
      { label: "#" }, { label: "Team" }, { label: "P", num: true }, { label: "W", num: true },
      { label: "D", num: true }, { label: "L", num: true }, { label: "GD", num: true }, { label: "Pts", num: true }
    ];
    const rows = teams.map((t) => {
      const crest = t.logo || (t.id ? "https://a.espncdn.com/i/teamlogos/soccer/500/" + encodeURIComponent(t.id) + ".png" : "");
      const noteClass = /relegat/i.test(t.note || "") ? " relegation-zone" : (/champion|qualif|playoff/i.test(t.note || "") ? " qualification-zone" : "");
      return (
      '<tr class="soccer-standing-row' + noteClass + '"><td class="pos">' + esc(t.rank || "") + '</td><td><span class="table-team">' +
      (crest ? '<img src="' + esc(crest) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '') + '<span>' + esc(t.name || t.abbr) + '</span></span>' +
      (t.note ? '<span class="sub">' + esc(t.note) + "</span>" : "") + "</td>" +
      '<td class="num">' + esc(t.played) + '</td><td class="num">' + esc(t.won) +
      '</td><td class="num">' + esc(t.drawn) + '</td><td class="num">' + esc(t.lost) +
      '</td><td class="num">' + esc(t.gd) + '</td><td class="num"><b>' + esc(t.pts) + "</b></td></tr>"
      );
    });
    return (groups.length > 1 && grp.name ? "<h3>" + esc(grp.name) + "</h3>" : "") +
      '<div class="scroll">' + table(heads, rows) + "</div>";
  }).join("");

  const open = window.matchMedia && window.matchMedia("(min-width: 721px)").matches ? " open" : "";
  return '<section class="card"><details' + open + '><summary>League table' + season + "</summary>" + body + "</details></section>";
}

function renderLeague(sport, scores, extra, nflTeams) {
  let html = sideSwitch(sport);
  html += '<div class="league-layout"><div class="league-primary">';
  if (scores) {
    // The games sit in their own box so live updates can swap them without
    // collapsing the standings dropdown below.
    html += '<div id="games">' + renderGames((scores.data && scores.data.games) || [], sport) + "</div>";
  } else {
    html += '<section class="card"><h2>Scores</h2><div class="muted">No scores yet.</div></section>';
  }
  html += '</div><aside class="league-sidebar">';
  if (extra) {
    const scoreLogos = {};
    (((scores || {}).data || {}).games || []).forEach((game) => [game.away || {}, game.home || {}].forEach((team) => {
      if (team.abbr && team.logo) scoreLogos[String(team.abbr).toUpperCase()] = team.logo;
    }));
    if (sport.extraType === "rankings") html += renderRankings(extra.data);
    else if (sport.extraType === "table") html += renderSoccerTable(extra.data);
    else html += renderStandings(extra.data, sport.id, scoreLogos);
  }
  if (sport.id === "nfl" && nflTeams) html += renderNFLSeasonLeaders(nflTeams);
  html += '</aside></div>';
  return html;
}

// ---- box score (tap a game) -------------------------------------------------

// Asks ESPN directly from the browser (box scores and live scores both use this).
async function espnGet(path) {
  const urls = ["https://site.api.espn.com" + path, "https://site.web.api.espn.com" + path];
  let lastErr = new Error("no response");
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// The box score is requested straight from ESPN when you tap a game.
function getSummary(espnPath, id) {
  return espnGet("/apis/site/v2/sports/" + espnPath + "/summary?event=" + encodeURIComponent(id));
}

function cap(s) {
  const t = String(s || "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// One group of players (e.g. NFL passing, MLB batting, NBA players) as a table.
function playerTable(group, sportId, teamAbbr) {
  const labels = group.labels || [];
  const rows = [];
  (group.athletes || []).forEach((a) => {
    const stats = a.stats || [];
    if (!stats.length) return; // did not play
    const ath = a.athlete || {};
    const name = ath.shortName || ath.displayName || "";
    const pos = ath.position && ath.position.abbreviation
      ? '<span class="sub">' + esc(ath.position.abbreviation) + "</span>" : "";
    let linkedName = esc(name);
    if (ath.id && sportId === "nfl") {
      linkedName = '<button type="button" class="nfl-player-link" data-nfl-player="' + esc(ath.id) + '" data-player-team="' + esc(teamAbbr || "") + '">' + esc(name) + '</button>';
    } else if (ath.id && sportId === "nba") {
      linkedName = '<button type="button" class="nba-player-link" data-nba-player="' + esc(ath.id) + '" data-player-team="' + esc(teamAbbr || "") + '">' + esc(name) + '</button>';
    }
    rows.push(
      "<tr><td>" + linkedName + pos + "</td>" +
      labels.map((_, i) => '<td class="num">' + esc(stats[i]) + "</td>").join("") + "</tr>"
    );
  });
  if (!rows.length) return "";

  if (group.totals && group.totals.length) {
    rows.push(
      '<tr class="tot"><td>Total</td>' +
      labels.map((_, i) => '<td class="num">' + esc(group.totals[i]) + "</td>").join("") + "</tr>"
    );
  }

  const head = "<th>Player</th>" + labels.map((l) => '<th class="num">' + esc(l) + "</th>").join("");
  return '<div class="scroll"><table class="box"><thead><tr>' + head + "</tr></thead><tbody>" +
    rows.join("") + "</tbody></table></div>";
}

function flatStats(team) {
  const out = [];
  ((team && team.statistics) || []).forEach((item) => {
    if (item && Array.isArray(item.stats)) item.stats.forEach((s) => out.push(s));
    else if (item) out.push(item);
  });
  return out;
}

function statLabel(s) { return s.label || s.displayName || s.shortDisplayName || s.name || ""; }
function statValue(s) { return s.displayValue != null ? s.displayValue : (s.value != null ? s.value : ""); }

function renderTeamStats(data) {
  const teams = (data.boxscore && data.boxscore.teams) || [];
  if (teams.length !== 2) return "";
  const a = flatStats(teams[0]);
  const b = flatStats(teams[1]);
  if (!a.length || a.length !== b.length) return "";

  const nameOf = (t) => (t.team && (t.team.abbreviation || t.team.displayName)) || "";
  const rows = [];
  a.forEach((s, i) => {
    const label = statLabel(s);
    if (!label) return;
    rows.push("<tr><td>" + esc(label) + '</td><td class="num">' + esc(statValue(s)) +
      '</td><td class="num">' + esc(statValue(b[i])) + "</td></tr>");
  });
  if (!rows.length) return "";

  return '<section class="card"><details><summary>Team stats</summary>' +
    table([{ label: "Stat" }, { label: nameOf(teams[0]), num: true }, { label: nameOf(teams[1]), num: true }], rows) +
    "</details></section>";
}

function renderLinescore(data) {
  const comp = data.header && data.header.competitions && data.header.competitions[0];
  const comps = (comp && comp.competitors) || [];
  if (comps.length !== 2 || !comps.every((c) => Array.isArray(c.linescores) && c.linescores.length)) return "";

  const ordered = comps.slice().sort(
    (x, y) => (x.homeAway === "away" ? 0 : 1) - (y.homeAway === "away" ? 0 : 1)
  );
  const n = Math.max(ordered[0].linescores.length, ordered[1].linescores.length);
  const head = "<th></th>" +
    Array.from({ length: n }, (_, i) => '<th class="num">' + (i + 1) + "</th>").join("") +
    '<th class="num">T</th>';
  const rows = ordered.map((c) => {
    const nm = (c.team && (c.team.abbreviation || c.team.displayName)) || "";
    const cells = Array.from({ length: n }, (_, i) => {
      const ls = c.linescores[i];
      return '<td class="num">' + esc(ls ? (ls.displayValue != null ? ls.displayValue : ls.value) : "") + "</td>";
    }).join("");
    return "<tr><td>" + esc(nm) + "</td>" + cells + '<td class="num"><b>' + esc(c.score) + "</b></td></tr>";
  });

  return '<section class="card"><h2>Line score</h2><div class="scroll"><table class="box"><thead><tr>' +
    head + "</tr></thead><tbody>" + rows.join("") + "</tbody></table></div></section>";
}

function playList(data) {
  const out = [];
  if (Array.isArray(data.plays)) out.push.apply(out, data.plays);
  const drives = data.drives || {};
  const previous = Array.isArray(drives.previous) ? drives.previous : (Array.isArray(drives) ? drives : []);
  previous.forEach((drive) => { if (Array.isArray(drive.plays)) out.push.apply(out, drive.plays); });
  if (drives.current && Array.isArray(drives.current.plays)) out.push.apply(out, drives.current.plays);
  const seen = {};
  return out.filter((p) => {
    const key = p.id || [p.period && (p.period.number || p.period), p.clock && p.clock.displayValue, p.text].join("|");
    if (seen[key]) return false;
    seen[key] = true;
    return !!(p.text || p.shortText);
  });
}

function playTeam(play, data) {
  const id = play.team && play.team.id;
  const comp = data.header && data.header.competitions && data.header.competitions[0];
  const teams = (comp && comp.competitors) || [];
  const found = teams.find((x) => String((x.team && x.team.id) || x.id) === String(id));
  return (found && found.team) || play.team || {};
}

function playLogo(team) {
  const logos = team.logos || [];
  const src = team.logo || (logos[0] && logos[0].href) || "";
  return src ? '<img src="' + esc(src) + '" alt="" loading="lazy">' : '<span></span>';
}

function playPeriodLabel(play, sportId) {
  const raw = play.period;
  const number = Number(raw && typeof raw === "object" ? raw.number : raw);
  const display = raw && typeof raw === "object" ? (raw.displayValue || raw.shortDisplayName || raw.name) : "";
  if (display) return display;
  if (!Number.isFinite(number)) return "";
  if (["nfl", "nba", "cbb", "wcbb"].includes(sportId)) return number > 4 ? "OT" : "Q" + number;
  if (sportId === "nhl") return number > 3 ? "OT" : "P" + number;
  if (sportId === "mlb") return "Inn " + number;
  return number === 1 ? "1st" : number === 2 ? "2nd" : String(number);
}

function renderPlayByPlay(data, sportId) {
  const plays = playList(data).slice(-50).reverse();
  if (!plays.length) return '<section class="card play-card"><h2>Play-by-play</h2><div class="muted">Play-by-play is not available yet.</div></section>';
  const rows = plays.map((play) => {
    const team = playTeam(play, data);
    const clock = play.clock && play.clock.displayValue ? play.clock.displayValue : "";
    const periodText = playPeriodLabel(play, sportId);
    const score = play.awayScore != null && play.homeScore != null ? play.awayScore + "–" + play.homeScore : "";
    const scoring = play.scoringPlay || (play.shootingPlay && Number(play.scoreValue) > 0);
    return '<div class="play-row' + (scoring ? ' scoring' : '') + '"><div class="play-time"><strong>' +
      esc([periodText, clock].filter(Boolean).join(" ")) + '</strong><span>' + esc(score) + '</span></div>' +
      '<div class="play-mark">' + playLogo(team) + '</div><div class="play-copy"><strong>' +
      esc(play.text || play.shortText || "Play") + '</strong>' +
      (scoring ? '<span class="score-tag">Scoring play</span>' : '') + '</div></div>';
  }).join("");
  return '<section class="card play-card"><details open><summary>Play-by-play <small>Latest first</small></summary>' +
    '<div class="play-feed">' + rows + '</div></details></section>';
}

function nflLiveTeams(data, game) {
  const comp = data.header && data.header.competitions && data.header.competitions[0];
  const competitors = (comp && comp.competitors) || [];
  const side = (homeAway) => {
    const raw = competitors.find((item) => item.homeAway === homeAway) || {};
    const team = raw.team || {};
    const fallback = game[homeAway] || {};
    return {
      id: String(team.id || raw.id || ""), name: team.displayName || team.shortDisplayName || fallback.name || "",
      abbr: team.abbreviation || fallback.abbr || "",
      logo: team.logo || (team.logos && team.logos[0] && team.logos[0].href) || fallback.logo || "",
      score: raw.score != null ? String(raw.score) : String(fallback.score || "0"),
      timeouts: raw.timeouts != null ? Number(raw.timeouts) : null
    };
  };
  return { away: side("away"), home: side("home") };
}

function nflLatestPlay(data) {
  const plays = playList(data);
  return plays.length ? plays[plays.length - 1] : {};
}

function nflFieldState(data, teams) {
  const situation = data.situation || {};
  const play = situation.lastPlay || nflLatestPlay(data) || {};
  const drives = data.drives || {};
  const drive = drives.current || {};
  const spot = play.end || drive.end || play.start || drive.start || {};
  const possessionId = String(situation.possession || (drive.team && drive.team.id) ||
    (play.team && play.team.id) || (spot.team && spot.team.id) || "");
  const spotTeamId = String((spot.team && spot.team.id) || possessionId);
  const yardLine = spot.yardLine == null || spot.yardLine === "" ? NaN : Number(spot.yardLine);
  let fieldX = 50;
  if (Number.isFinite(yardLine)) {
    fieldX = spotTeamId === teams.home.id ? 100 - yardLine : yardLine;
    fieldX = Math.max(2, Math.min(98, fieldX));
  }
  const offense = possessionId === teams.home.id ? teams.home : teams.away;
  return {
    play: play, offense: offense, fieldX: fieldX, hasSpot: Number.isFinite(yardLine),
    down: situation.shortDownDistanceText || situation.downDistanceText || play.shortText || "Drive in progress",
    driveText: drive.description || drive.displayResult || drive.result || "Current possession"
  };
}

function nflTimeoutDots(team) {
  if (!Number.isFinite(team.timeouts)) return "";
  return '<span class="nfl-timeouts" aria-label="' + esc(team.timeouts) + ' timeouts remaining">' +
    Array.from({ length: 3 }, (_, i) => '<i class="' + (i < team.timeouts ? "on" : "") + '"></i>').join("") + '</span>';
}

function renderNFLLiveCenter(data, game) {
  const teams = nflLiveTeams(data, game);
  const field = nflFieldState(data, teams);
  const status = ((data.header && data.header.competitions && data.header.competitions[0] &&
    data.header.competitions[0].status && data.header.competitions[0].status.type) || {});
  const liveText = status.shortDetail || status.detail || game.detail || "Live";
  const lastText = field.play.text || field.play.shortText || "Live drive information will update automatically.";
  const possessionName = field.offense.abbr || field.offense.name || "Offense";
  const teamBlock = (team, side) => '<div class="nfl-live-team ' + side + '">' +
    (team.logo ? '<img src="' + esc(team.logo) + '" alt="' + esc(team.name) + ' logo">' : '') +
    '<div><span>' + esc(team.abbr || team.name) + '</span><strong>' + esc(team.score) + '</strong>' + nflTimeoutDots(team) + '</div></div>';
  return '<section class="nfl-live-center"><div class="nfl-live-scorebar">' + teamBlock(teams.away, "away") +
    '<div class="nfl-live-status"><span><i></i> LIVE</span><strong>' + esc(liveText) + '</strong><small>' +
    esc(field.down) + '</small></div>' + teamBlock(teams.home, "home") + '</div>' +
    '<div class="nfl-field-shell"><div class="nfl-field" style="--ball-x:' + field.fieldX + '%">' +
    '<div class="nfl-endzone nfl-away-endzone"><span>' + esc(teams.away.abbr) + '</span></div>' +
    '<div class="nfl-field-numbers"><span>10</span><span>20</span><span>30</span><span>40</span><span>50</span><span>40</span><span>30</span><span>20</span><span>10</span></div>' +
    '<div class="nfl-scrimmage"></div>' + (field.hasSpot ? '<div class="nfl-ball-marker"><b></b><span>' + esc(possessionName) + '</span></div>' : '') +
    '<div class="nfl-endzone nfl-home-endzone"><span>' + esc(teams.home.abbr) + '</span></div></div></div>' +
    '<div class="nfl-drive-strip"><div><span>POSSESSION</span><strong>' + esc(possessionName) + '</strong></div>' +
    '<div><span>CURRENT DRIVE</span><strong>' + esc(field.driveText) + '</strong></div></div>' +
    '<div class="nfl-last-play"><span>LATEST PLAY</span><p>' + esc(lastText) + '</p></div></section>';
}

function renderBoxscore(data, sportId) {
  let html = renderLinescore(data);

  ((data.boxscore && data.boxscore.players) || []).forEach((tp) => {
    const teamName = tp.team ? (tp.team.displayName || tp.team.name || "") : "";
    (tp.statistics || []).forEach((group) => {
      const t = playerTable(group, sportId, tp.team && tp.team.abbreviation);
      if (!t) return;
      const title = cap(group.text || group.displayName || group.name || group.type || "Players");
      html += '<section class="card"><h2>' + esc(teamName) + "<small>" + esc(title) + "</small></h2>" + t + "</section>";
    });
  });

  html += renderTeamStats(data);

  if (!html) html = '<div class="message">No box score is available for this game yet.</div>';
  return html;
}

// ---- NFL pregame matchup ---------------------------------------------------

function renderPregameInfo(data, game) {
  const info = data.gameInfo || {};
  const venue = info.venue || {};
  const weather = info.weather || {};
  const broadcasts = ((data.header && data.header.competitions && data.header.competitions[0] &&
    data.header.competitions[0].broadcasts) || [])
    .flatMap((b) => b.names || []).filter(Boolean);
  const rows = [];
  const start = Date.parse(game.date);
  if (!isNaN(start)) rows.push(["Start", new Date(start).toLocaleString([], {
    weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
  })]);
  const place = [venue.fullName, venue.address && venue.address.city, venue.address && venue.address.state]
    .filter(Boolean).join(" · ");
  if (place) rows.push(["Venue", place]);
  const forecast = [weather.displayValue, weather.temperature != null ? weather.temperature + "°" : ""]
    .filter(Boolean).join(" · ");
  if (forecast) rows.push(["Weather", forecast]);
  if (broadcasts.length) rows.push(["Watch", broadcasts.join(", ")]);
  if (!rows.length) return "";
  return '<section class="card pregame-card"><h2>Game information</h2><div class="pregame-list">' +
    rows.map((r) => '<div><span>' + esc(r[0]) + '</span><strong>' + esc(r[1]) + '</strong></div>').join("") +
    "</div></section>";
}

function oddsValue(x, key) {
  if (!x) return "";
  const value = x[key];
  return value == null ? "" : String(value);
}

function renderPregameOdds(data) {
  const lines = data.pickcenter || [];
  if (!lines.length) {
    return '<section class="card pregame-card"><h2>Odds</h2><div class="muted">Odds are not available for this matchup yet.</div></section>';
  }
  const line = lines[0] || {};
  const provider = line.provider && line.provider.name ? line.provider.name : "Consensus";
  const home = line.homeTeamOdds || {};
  const away = line.awayTeamOdds || {};
  const items = [];
  if (line.details) items.push(["Spread", line.details]);
  if (line.overUnder != null) items.push(["Total", "O/U " + line.overUnder]);
  const awayMl = oddsValue(away, "moneyLine") || oddsValue(away, "moneyline");
  const homeMl = oddsValue(home, "moneyLine") || oddsValue(home, "moneyline");
  if (awayMl || homeMl) items.push(["Moneyline", [awayMl, homeMl].filter(Boolean).join(" / ")]);
  return '<section class="card pregame-card"><h2>Odds <small>' + esc(provider) + '</small></h2>' +
    (items.length ? '<div class="odds-grid">' + items.map((x) => '<div><span>' + esc(x[0]) + '</span><strong>' +
      esc(x[1]) + '</strong></div>').join("") + '</div>' : '<div class="muted">The line has not been posted yet.</div>') +
    '<p class="muted small">Odds can move. For information only.</p></section>';
}

function leaderGroups(data, sportId) {
  const bySport = {
    nfl: [{ test: /pass/i, label: "QB" }, { test: /rush/i, label: "RB" }, { test: /receiv/i, label: "WR" }, { test: /sack|tackle|interception/i, label: "DEF" }],
    cfb: [{ test: /pass/i, label: "QB" }, { test: /rush/i, label: "RB" }, { test: /receiv/i, label: "WR" }],
    nba: [{ test: /point|scor/i, label: "PTS" }, { test: /rebound/i, label: "REB" }, { test: /assist/i, label: "AST" }],
    cbb: [{ test: /point|scor/i, label: "PTS" }, { test: /rebound/i, label: "REB" }, { test: /assist/i, label: "AST" }],
    wcbb: [{ test: /point|scor/i, label: "PTS" }, { test: /rebound/i, label: "REB" }, { test: /assist/i, label: "AST" }],
    mlb: [{ test: /hit/i, label: "H" }, { test: /home.?run/i, label: "HR" }, { test: /run.?batted|rbi/i, label: "RBI" }, { test: /earned.?run|era/i, label: "ERA" }],
    nhl: [{ test: /^points?$|point/i, label: "PTS" }, { test: /goal/i, label: "G" }, { test: /assist/i, label: "A" }],
    epl: [{ test: /goal|scor/i, label: "G" }, { test: /assist/i, label: "A" }],
    ucl: [{ test: /goal|scor/i, label: "G" }, { test: /assist/i, label: "A" }],
    laliga: [{ test: /goal|scor/i, label: "G" }, { test: /assist/i, label: "A" }]
  };
  const wanted = bySport[sportId] || [];
  return ((data.leaders || [])).map((teamBlock) => {
    const team = teamBlock.team || {};
    const groups = teamBlock.leaders || [];
    const picked = wanted.map((w) => {
      const group = groups.find((g) => w.test.test(g.name || g.displayName || ""));
      const lead = group && group.leaders && group.leaders[0];
      if (!lead) return null;
      const athlete = lead.athlete || {};
      return { label: w.label, id: athlete.id || "", name: athlete.shortName || athlete.displayName || "", value: lead.displayValue || "" };
    }).filter(Boolean);
    return { name: team.displayName || team.name || team.abbreviation || "Team", abbr: team.abbreviation || "", groups: picked };
  }).filter((x) => x.groups.length);
}

function renderPregameLeaders(data, sportId) {
  const teams = leaderGroups(data, sportId);
  if (!teams.length) {
    return '<section class="card pregame-card"><h2>Key-player comparison</h2>' +
      '<div class="muted">Season leaders will appear when ESPN posts the matchup preview.</div></section>';
  }
  return '<section class="card pregame-card"><h2>Key-player comparison</h2><div class="comparison-grid">' +
    teams.map((t) => '<div class="comparison-team"><h3>' + esc(t.name) + '</h3>' + t.groups.map((g) =>
      '<div class="leader-row"><span class="position-pill">' + esc(g.label) + '</span><div><strong>' +
      (g.id && sportId === "nfl" ? '<button type="button" class="nfl-player-link" data-nfl-player="' + esc(g.id) + '" data-player-team="' + esc(t.abbr) + '">' + esc(g.name) + '</button>' :
        (g.id && sportId === "nba" ? '<button type="button" class="nba-player-link" data-nba-player="' + esc(g.id) + '" data-player-team="' + esc(t.abbr) + '">' + esc(g.name) + '</button>' : esc(g.name))) +
      '</strong><small>' + esc(g.value) + '</small></div></div>').join("") + '</div>').join("") + '</div></section>';
}

function injuryReturnText(injury) {
  const details = injury.details || {};
  const value = details.returnDate || details.estimatedReturnDate || details.expectedReturnDate ||
    injury.returnDate || injury.estimatedReturnDate || injury.expectedReturnDate;
  if (!value) return "Estimated return: Not announced";
  const ms = Date.parse(value);
  if (isNaN(ms)) return "Estimated return: " + String(value);
  return "Estimated return: " + new Date(ms).toLocaleDateString([], {
    month: "short", day: "numeric", year: "numeric"
  });
}

function renderPregameInjuries(data, sportId) {
  const teams = data.injuries || [];
  if (!teams.length) {
    return '<section class="card pregame-card"><h2>Injury report</h2><div class="muted">No injury report is available yet.</div></section>';
  }
  return '<section class="card pregame-card"><h2>Injury report</h2><div class="injury-grid">' + teams.map((t) => {
    const team = t.team || {};
    const list = (t.injuries || []).slice(0, 8);
    return '<div><h3>' + esc(team.displayName || team.name || team.abbreviation || "Team") + '</h3>' +
      (list.length ? list.map((inj) => {
        const athlete = inj.athlete || {};
        const detail = inj.details || {};
        const note = detail.detail || detail.type || inj.status || "Listed";
        const playerName = athlete.shortName || athlete.displayName || "Player";
        const linkedPlayer = athlete.id && sportId === "nfl"
          ? '<button type="button" class="nfl-player-link" data-nfl-player="' + esc(athlete.id) + '" data-player-team="' + esc(team.abbreviation || "") + '">' + esc(playerName) + '</button>'
          : (athlete.id && sportId === "nba" ? '<button type="button" class="nba-player-link" data-nba-player="' + esc(athlete.id) + '" data-player-team="' + esc(team.abbreviation || "") + '">' + esc(playerName) + '</button>' : esc(playerName));
        return '<div class="injury-row"><strong>' + linkedPlayer +
          '</strong><span>' + esc(note) + '</span><span class="injury-return">' +
          esc(injuryReturnText(inj)) + '</span></div>';
      }).join("") : '<div class="muted small">No players listed.</div>') + '</div>';
  }).join("") + '</div></section>';
}

function renderPregame(data, game, sportId) {
  let html = '<div class="pregame-label">MATCHUP PREVIEW</div>';
  html += renderPregameInfo(data, game);
  html += renderPregameOdds(data);
  html += renderPregameLeaders(data, sportId);
  const teamStats = renderTeamStats(data);
  if (teamStats) html += teamStats.replace("Team stats", "Team comparison");
  html += renderPregameInjuries(data, sportId);
  return html;
}

function matchupStatPreferences(sportId) {
  const common = {
    nfl: [[/points.?per.?game|avgpoints|pointsfor/i, "PPG", false], [/total.?yards|yards.?per.?game/i, "Yards", false], [/turnover/i, "Turnovers", true], [/sacks/i, "Sacks", false]],
    cfb: [[/points.?per.?game|avgpoints|pointsfor/i, "PPG", false], [/total.?yards|yards.?per.?game/i, "Yards", false], [/turnover/i, "Turnovers", true], [/third.?down/i, "3rd down", false]],
    nba: [[/points.?per.?game|avgpoints/i, "PPG", false], [/field.?goal.?pct|fieldgoalpercentage/i, "FG%", false], [/three.?point.*pct|threepointpercentage/i, "3PT%", false], [/turnover/i, "Turnovers", true]],
    cbb: [[/points.?per.?game|avgpoints/i, "PPG", false], [/field.?goal.?pct|fieldgoalpercentage/i, "FG%", false], [/rebound/i, "Rebounds", false], [/turnover/i, "Turnovers", true]],
    wcbb: [[/points.?per.?game|avgpoints/i, "PPG", false], [/field.?goal.?pct|fieldgoalpercentage/i, "FG%", false], [/rebound/i, "Rebounds", false], [/turnover/i, "Turnovers", true]],
    mlb: [[/runs.?per.?game|runs/i, "Runs", false], [/batting.?average|avg/i, "AVG", false], [/on.?base/i, "OBP", false], [/earned.?run|era/i, "ERA", true]],
    nhl: [[/goals.?per.?game|goals/i, "Goals", false], [/shots.?per.?game|shots/i, "Shots", false], [/power.?play/i, "Power play", false], [/goals.?against/i, "Goals allowed", true]],
    epl: [[/goals/i, "Goals", false], [/shots.?on.?target|shots/i, "Shots", false], [/possession/i, "Possession", false], [/goals.?against/i, "Goals allowed", true]],
    ucl: [[/goals/i, "Goals", false], [/shots.?on.?target|shots/i, "Shots", false], [/possession/i, "Possession", false], [/goals.?against/i, "Goals allowed", true]],
    laliga: [[/goals/i, "Goals", false], [/shots.?on.?target|shots/i, "Shots", false], [/possession/i, "Possession", false], [/goals.?against/i, "Goals allowed", true]]
  };
  return common[sportId] || [];
}

function matchupMetrics(data, sportId) {
  const teams = (data.boxscore && data.boxscore.teams) || [];
  if (teams.length !== 2) return [];
  const stats = teams.map((team) => flatStats(team));
  const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const used = {};
  return matchupStatPreferences(sportId).map((pref) => {
    const pattern = pref[0];
    const found = stats.map((list) => list.find((stat) => pattern.test(normalize(stat.name) + " " + normalize(statLabel(stat)))));
    if (!found[0] || !found[1]) return null;
    const key = normalize(statLabel(found[0]));
    if (used[key]) return null;
    used[key] = true;
    const values = found.map((stat) => chartNumber(statValue(stat)));
    if (!values.every(Number.isFinite)) return null;
    let edge = values[0] === values[1] ? -1 : (pref[2] ? (values[0] < values[1] ? 0 : 1) : (values[0] > values[1] ? 0 : 1));
    return { label: pref[1], displays: found.map(statValue), edge: edge };
  }).filter(Boolean).slice(0, 4);
}

function matchupInfo(data, game) {
  const info = data.gameInfo || {};
  const venue = info.venue || {};
  const broadcasts = ((data.header && data.header.competitions && data.header.competitions[0] &&
    data.header.competitions[0].broadcasts) || []).flatMap((item) => item.names || []).filter(Boolean);
  const start = Date.parse(game.date);
  const items = [];
  if (!isNaN(start)) items.push(["Start", new Date(start).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })]);
  if (venue.fullName) items.push(["Venue", venue.fullName]);
  if (broadcasts.length) items.push(["Watch", broadcasts.join(", ")]);
  return items.slice(0, 3);
}

function matchupOdds(data) {
  const line = (data.pickcenter || [])[0] || {};
  const items = [];
  if (line.details) items.push(["Spread", line.details]);
  if (line.overUnder != null) items.push(["Total", "O/U " + line.overUnder]);
  const away = oddsValue(line.awayTeamOdds || {}, "moneyLine") || oddsValue(line.awayTeamOdds || {}, "moneyline");
  const home = oddsValue(line.homeTeamOdds || {}, "moneyLine") || oddsValue(line.homeTeamOdds || {}, "moneyline");
  if (away || home) items.push(["Moneyline", [away, home].filter(Boolean).join(" / ")]);
  return { provider: line.provider && line.provider.name || "", items: items.slice(0, 3) };
}

function renderMatchupIntelligence(data, game, sportId) {
  const teams = gameCenterTeams(data, game);
  const metrics = matchupMetrics(data, sportId);
  const leaders = leaderGroups(data, sportId);
  const injuries = data.injuries || [];
  const info = matchupInfo(data, game);
  const odds = matchupOdds(data);
  const teamNames = [teams.away.abbr || teams.away.name, teams.home.abbr || teams.home.name];
  const records = [teams.away.record || "—", teams.home.record || "—"];

  const edgeRows = metrics.length ? metrics.map((metric) => '<div class="matchup-edge-row"><strong class="' + (metric.edge === 0 ? "has-edge" : "") + '">' +
    esc(metric.displays[0]) + '</strong><span>' + esc(metric.label) + '</span><strong class="' + (metric.edge === 1 ? "has-edge" : "") + '">' +
    esc(metric.displays[1]) + '</strong></div>').join("") :
    '<div class="matchup-edge-row"><strong>' + esc(records[0]) + '</strong><span>Record</span><strong>' + esc(records[1]) + '</strong></div>';

  const leaderHtml = leaders.length ? '<div class="intel-section"><h3>Players to watch</h3><div class="intel-player-teams">' + leaders.slice(0, 2).map((team) =>
    '<div><b>' + esc(team.abbr || team.name) + '</b>' + team.groups.slice(0, 2).map((player) => '<span><i>' + esc(player.label) + '</i><strong>' +
      esc(player.name) + '</strong><small>' + esc(player.value) + '</small></span>').join("") + '</div>').join("") + '</div></div>' : "";

  const injuryHtml = injuries.length ? '<div class="intel-section intel-injuries"><h3>Availability</h3><div>' + injuries.slice(0, 2).map((group) => {
    const team = group.team || {};
    const list = group.injuries || [];
    const notable = list.slice(0, 2).map((injury) => (injury.athlete && (injury.athlete.shortName || injury.athlete.displayName)) || "Player").join(", ");
    return '<span><b>' + esc(team.abbreviation || team.shortDisplayName || team.displayName || "Team") + '</b><strong>' + list.length + ' listed</strong>' +
      (notable ? '<small>' + esc(notable) + (list.length > 2 ? " +" + (list.length - 2) : "") + '</small>' : '') + '</span>';
  }).join("") + '</div></div>' : "";

  return '<section class="matchup-intelligence"><div class="intel-head"><div><p class="eyebrow">PREGAME</p><h2>Matchup Intelligence</h2></div><span>Quick read</span></div>' +
    '<div class="intel-team-head"><strong>' + esc(teamNames[0]) + '</strong><span>vs</span><strong>' + esc(teamNames[1]) + '</strong></div>' +
    '<div class="matchup-edge-grid">' + edgeRows + '</div>' +
    (odds.items.length ? '<div class="intel-odds">' + odds.items.map((item) => '<span><small>' + esc(item[0]) + '</small><strong>' + esc(item[1]) + '</strong></span>').join("") + '</div>' : '') +
    leaderHtml + injuryHtml +
    (info.length ? '<details class="intel-details"><summary>Game details</summary><div>' + info.map((item) => '<span><small>' + esc(item[0]) + '</small><strong>' + esc(item[1]) + '</strong></span>').join("") + '</div></details>' : '') +
    '<p class="intel-note">Edges summarize available season data; they are not a prediction.</p></section>';
}

function chartNumber(value) {
  const match = String(value == null ? "" : value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}

function renderScoringChart(data) {
  const comp = data.header && data.header.competitions && data.header.competitions[0];
  const teams = ((comp && comp.competitors) || []).slice().sort(
    (a, b) => (a.homeAway === "away" ? 0 : 1) - (b.homeAway === "away" ? 0 : 1)
  );
  if (teams.length !== 2 || !teams.some((team) => (team.linescores || []).length)) return '<div class="chart-empty">Scoring data will appear after play begins.</div>';
  const periods = Math.max.apply(null, teams.map((team) => (team.linescores || []).length));
  const values = [];
  teams.forEach((team) => (team.linescores || []).forEach((line) => {
    const value = chartNumber(line.displayValue != null ? line.displayValue : line.value);
    if (Number.isFinite(value)) values.push(value);
  }));
  const max = Math.max(1, ...values);
  const colors = ["var(--accent)", "#ff7b83"];
  return '<div class="scoring-chart" style="--periods:' + periods + '">' + Array.from({ length: periods }, (_, index) => {
    const bars = teams.map((team, teamIndex) => {
      const line = (team.linescores || [])[index] || {};
      const value = chartNumber(line.displayValue != null ? line.displayValue : line.value);
      const shown = Number.isFinite(value) ? value : 0;
      const name = (team.team && (team.team.abbreviation || team.team.displayName)) || "Team";
      return '<span class="chart-bar" style="--bar-height:' + Math.max(4, shown / max * 100) + '%;--bar-color:' + colors[teamIndex] + '" title="' + esc(name + ': ' + shown) + '"><i></i><b>' + esc(shown) + '</b></span>';
    }).join("");
    return '<div class="chart-period"><div class="chart-bars">' + bars + '</div><small>' + (index + 1) + '</small></div>';
  }).join("") + '</div><div class="chart-legend">' + teams.map((team, index) => '<span><i style="--legend:' + colors[index] + '"></i>' +
    esc((team.team && (team.team.abbreviation || team.team.displayName)) || "Team") + '</span>').join("") + '</div>';
}

function renderComparisonChart(data) {
  const teams = (data.boxscore && data.boxscore.teams) || [];
  if (teams.length !== 2) return '<div class="chart-empty">Team comparison data is not available yet.</div>';
  const a = flatStats(teams[0]);
  const b = flatStats(teams[1]);
  const rows = [];
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const av = chartNumber(statValue(a[index]));
    const bv = chartNumber(statValue(b[index]));
    const label = statLabel(a[index]);
    if (!label || !Number.isFinite(av) || !Number.isFinite(bv) || (av === 0 && bv === 0)) continue;
    rows.push({ label: label, a: av, b: bv, ad: statValue(a[index]), bd: statValue(b[index]) });
    if (rows.length === 8) break;
  }
  if (!rows.length) return '<div class="chart-empty">Team comparison data is not available yet.</div>';
  const names = teams.map((team) => (team.team && (team.team.abbreviation || team.team.displayName)) || "Team");
  return '<div class="comparison-chart-head"><span>' + esc(names[0]) + '</span><span>' + esc(names[1]) + '</span></div><div class="comparison-chart">' + rows.map((row) => {
    const total = Math.abs(row.a) + Math.abs(row.b) || 1;
    return '<div class="comparison-chart-row"><div class="comparison-values"><b>' + esc(row.ad) + '</b><span>' + esc(row.label) + '</span><b>' + esc(row.bd) + '</b></div>' +
      '<div class="comparison-bars"><i style="width:' + (Math.abs(row.a) / total * 100) + '%"></i><i style="width:' + (Math.abs(row.b) / total * 100) + '%"></i></div></div>';
  }).join("") + '</div>';
}

function renderInteractiveCharts(data, game) {
  if (game.state === "pre") return "";
  return '<section class="card game-charts"><div class="game-chart-heading"><h2>Game charts</h2><div class="chart-switch" role="group" aria-label="Choose chart">' +
    '<button type="button" class="active" data-chart-view="scoring">Scoring</button><button type="button" data-chart-view="comparison">Comparison</button></div></div>' +
    '<div class="chart-panel active" data-chart-panel="scoring">' + renderScoringChart(data) + '</div>' +
    '<div class="chart-panel" data-chart-panel="comparison">' + renderComparisonChart(data) + '</div></section>';
}

function soccerLineupGroups(data) {
  const raw = Array.isArray(data.rosters) ? data.rosters : (Array.isArray(data.lineups) ? data.lineups : []);
  return raw.map((group) => {
    const team = group.team || {};
    const entries = group.roster || group.athletes || group.players || [];
    const players = entries.map((entry) => {
      const athlete = entry.athlete || entry.player || entry;
      const pos = (athlete.position && (athlete.position.abbreviation || athlete.position.name)) ||
        (entry.position && (entry.position.abbreviation || entry.position.name)) || "";
      return {
        name: athlete.shortName || athlete.displayName || athlete.fullName || "Player",
        jersey: athlete.jersey || entry.jersey || "",
        position: String(pos).toUpperCase(),
        starter: entry.starter === true || entry.isStarter === true || entry.substitute === false,
        slot: Number(entry.formationPlace || entry.formationPosition || 0)
      };
    });
    return { team: team, formation: group.formation || group.formationName || "", players: players };
  }).filter((group) => group.players.length);
}

function lineupCoordinates(players) {
  const starters = players.filter((player) => player.starter).slice(0, 11);
  const chosen = starters.length >= 7 ? starters : players.slice(0, 11);
  const bands = { GK: [], DEF: [], MID: [], FWD: [] };
  chosen.forEach((player) => {
    const pos = player.position;
    const band = /GK|GOAL/.test(pos) ? "GK" : /CB|LB|RB|WB|DEF/.test(pos) ? "DEF" : /FW|ST|CF|LW|RW|ATT/.test(pos) ? "FWD" : "MID";
    bands[band].push(player);
  });
  const y = { GK: 91, DEF: 70, MID: 44, FWD: 18 };
  return Object.keys(bands).flatMap((band) => bands[band].map((player, index, list) => Object.assign({}, player, {
    x: (index + 1) * 100 / (list.length + 1), y: y[band]
  })));
}

function renderSoccerLineups(data, sportId) {
  if (!["epl", "ucl", "laliga"].includes(sportId)) return "";
  const groups = soccerLineupGroups(data);
  if (!groups.length) return '<section class="card soccer-lineups"><h2>Formations & lineups</h2><div class="muted">Lineups normally appear shortly before kickoff.</div></section>';
  const tabs = groups.map((group, index) => '<button type="button" class="' + (index === 0 ? "active" : "") + '" data-lineup-team="' + index + '">' +
    esc(group.team.abbreviation || group.team.shortDisplayName || group.team.displayName || "Team " + (index + 1)) + '</button>').join("");
  const panels = groups.map((group, index) => {
    const starters = lineupCoordinates(group.players);
    const substitutes = group.players.filter((player) => !starters.some((starter) => starter.name === player.name));
    const pitch = starters.map((player) => '<div class="pitch-player" style="--player-x:' + player.x + '%;--player-y:' + player.y + '%" title="' + esc(player.position) + '">' +
      '<b>' + esc(player.jersey || player.position || "•") + '</b><span>' + esc(player.name) + '</span></div>').join("");
    return '<div class="lineup-panel' + (index === 0 ? " active" : "") + '" data-lineup-panel="' + index + '"><div class="formation-label">' +
      esc(group.formation ? "Formation " + group.formation : "Starting XI") + '</div><div class="soccer-pitch">' + pitch + '</div>' +
      (substitutes.length ? '<details class="lineup-subs"><summary>Substitutes</summary><div>' + substitutes.map((player) => '<span><b>' + esc(player.jersey || "") + '</b>' + esc(player.name) + '</span>').join("") + '</div></details>' : '') + '</div>';
  }).join("");
  return '<section class="card soccer-lineups"><div class="lineup-heading"><h2>Formations & lineups</h2><div class="lineup-team-switch">' + tabs + '</div></div>' + panels + '</section>';
}

function gameCenterTeams(data, game) {
  const comp = data.header && data.header.competitions && data.header.competitions[0];
  const competitors = (comp && comp.competitors) || [];
  const get = (homeAway) => {
    const raw = competitors.find((item) => item.homeAway === homeAway) || {};
    const team = raw.team || {};
    const fallback = game[homeAway] || {};
    const records = raw.records || [];
    return {
      name: team.displayName || team.shortDisplayName || fallback.name || fallback.abbr || "Team",
      abbr: team.abbreviation || fallback.abbr || "",
      logo: team.logo || (team.logos && team.logos[0] && team.logos[0].href) || fallback.logo || "",
      score: raw.score != null ? String(raw.score) : String(fallback.score || ""),
      record: (records[0] && records[0].summary) || fallback.record || ""
    };
  };
  return { away: get("away"), home: get("home") };
}

function renderGameCenterHeader(data, game, sport) {
  const teams = gameCenterTeams(data, game);
  const comp = data.header && data.header.competitions && data.header.competitions[0];
  const status = (comp && comp.status && comp.status.type) || {};
  const statusText = status.shortDetail || status.detail || game.detail || "Game";
  const live = game.state === "in" || status.state === "in";
  const start = Date.parse(game.date);
  const date = isNaN(start) ? "" : new Date(start).toLocaleString([], {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
  });
  const team = (item, side) => {
    const linked = ["nfl", "nba"].includes(sport.id) && item.abbr
      ? '<button type="button" class="game-center-team-link" data-team="' + esc(item.abbr) + '" data-team-sport="' + esc(sport.id) + '">' + esc(item.name) + '</button>'
      : '<strong>' + esc(item.name) + '</strong>';
    return '<div class="game-center-team ' + side + '">' +
      '<div class="game-center-logo">' + (item.logo ? '<img src="' + esc(item.logo) + '" alt="" loading="eager">' : '<span>' + esc(item.abbr) + '</span>') + '</div>' +
      '<div class="game-center-team-copy">' + linked + (item.record ? '<small>' + esc(item.record) + '</small>' : '') + '</div>' +
      favoriteButton(sport.id, item, "game-center-favorite") +
      (game.state === "pre" ? '' : '<b class="game-center-score">' + esc(item.score) + '</b>') + '</div>';
  };
  return '<section class="game-center-hero"><div class="game-center-kicker"><span>' + esc(sport.side || sport.label) + '</span>' +
    (live ? '<b><i></i> LIVE</b>' : '') + '</div><div class="game-center-matchup">' + team(teams.away, "away") +
    '<div class="game-center-status"><strong>' + esc(statusText) + '</strong><span>' + esc(date) + '</span></div>' +
    team(teams.home, "home") + '</div></section>';
}

function renderGameCenter(data, game, sport) {
  const isPregame = game.state === "pre";
  const defaultTab = isPregame ? "overview" : "boxscore";
  let overview = isPregame ? renderMatchupIntelligence(data, game, sport.id) : renderInteractiveCharts(data, game);
  if (sport.id === "nfl" && game.state === "in") overview = renderNFLLiveCenter(data, game) + overview;
  overview += renderSoccerLineups(data, sport.id);
  const boxscore = renderBoxscore(data, sport.id);
  const plays = renderPlayByPlay(data, sport.id);
  return renderGameCenterHeader(data, game, sport) +
    '<nav class="game-center-tabs" aria-label="Game center sections">' +
    '<button type="button" data-game-tab="overview" class="' + (defaultTab === "overview" ? "active" : "") + '">Overview</button>' +
    '<button type="button" data-game-tab="boxscore" class="' + (defaultTab === "boxscore" ? "active" : "") + '">Box Score</button>' +
    '<button type="button" data-game-tab="plays">Plays</button></nav>' +
    '<div class="game-center-panel' + (defaultTab === "overview" ? " active" : "") + '" data-game-panel="overview">' + overview + '</div>' +
    '<div class="game-center-panel' + (defaultTab === "boxscore" ? " active" : "") + '" data-game-panel="boxscore">' + boxscore + '</div>' +
    '<div class="game-center-panel" data-game-panel="plays">' + plays + '</div>';
}

function backButton() {
  return '<button type="button" class="back" id="back">&lsaquo; Back to scores</button>';
}

async function showDetail() {
  const d = detail; // keep a reference so we can tell if you moved on while loading
  const sport = SPORTS.find((s) => s.id === d.sportId);
  const key = d.sportId + ":" + d.id;
  updatedEl.textContent = "";

  // Only show the loading note the first time, so a background refresh doesn't flicker.
  if (view.getAttribute("data-detail") !== key) {
    view.innerHTML = backButton() + '<section class="card">' + gameCard(d.game, false) + "</section>" +
      '<div class="message">Loading box score&hellip;</div>';
    view.setAttribute("data-detail", key);
  }

  const results = await Promise.allSettled([getJson(sport.scores), getSummary(sport.espn, d.id)]);
  if (detail !== d) return;

  // Use the freshest score and status we have for the header.
  if (results[0].status === "fulfilled") {
    const games = (results[0].value.data && results[0].value.data.games) || [];
    const fresh = games.find((x) => x.id === d.id);
    if (fresh) d.game = fresh;
  }
  const standardHeader = '<section class="card">' + gameCard(d.game, false) + "</section>";

  if (results[1].status === "fulfilled") {
    const summary = results[1].value;
    view.innerHTML = backButton() + renderGameCenter(summary, d.game, sport);
  } else {
    view.innerHTML = backButton() + standardHeader +
      '<div class="message">Couldn\'t load the box score. It may not be available yet, or ESPN may be ' +
      "blocking requests from the browser. Try again in a minute.</div>";
  }
  view.setAttribute("data-detail", key);
}

// ---- NFL team page ---------------------------------------------------------

async function coreGet(path) {
  const res = await fetch("https://sports.core.api.espn.com" + path, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

function nflSeasonYear() {
  const now = new Date();
  return now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear();
}

function teamLogo(team) {
  if (team.logo) return team.logo;
  const logos = team.logos || [];
  const normal = logos.find((x) => (x.rel || []).includes("default"));
  return (normal || logos[0] || {}).href || "";
}

function recordStat(team, name) {
  const total = (((team.record || {}).items || []).find((x) => x.type === "total") || {}).stats || [];
  const stat = total.find((x) => x.name === name);
  return stat && stat.value != null ? stat.value : null;
}

function flattenTeamStats(node, path, out) {
  if (!node || typeof node !== "object") return out;
  if (node.name && (node.displayValue != null || node.value != null)) {
    out.push({ name: node.name, label: node.displayName || node.label || node.name,
      value: node.displayValue != null ? node.displayValue : String(node.value), rawValue: node.value, path: path });
  }
  Object.keys(node).forEach((key) => {
    const value = node[key];
    if (value && typeof value === "object") flattenTeamStats(value, path + " " + key + " " + (node.name || ""), out);
  });
  return out;
}

function findTeamStat(stats, names, pathTest) {
  const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const wanted = names.map(normalize);
  const matches = (x) => wanted.includes(normalize(x.name)) || wanted.includes(normalize(x.label));
  let hit = stats.find((x) => matches(x) && (!pathTest || pathTest.test(x.path)));
  if (!hit) hit = stats.find(matches);
  if (!hit) hit = stats.find((x) => wanted.some((name) => name.length > 7 &&
    (normalize(x.name).includes(name) || name.includes(normalize(x.name)) || normalize(x.label).includes(name))));
  return hit ? hit.value : "Not available";
}

function findTeamNumber(stats, names, pathTest) {
  const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const wanted = names.map(normalize);
  const matches = (x) => wanted.includes(normalize(x.name)) || wanted.includes(normalize(x.label));
  let hit = stats.find((x) => matches(x) && (!pathTest || pathTest.test(x.path)));
  if (!hit) hit = stats.find(matches);
  if (!hit) return null;
  const number = Number(hit.rawValue != null ? hit.rawValue : String(hit.value).replace(/[%,$]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function completedScheduleStats(schedule, teamId) {
  const total = { games: 0, pointsFor: 0, pointsAgainst: 0 };
  (schedule && schedule.events || []).forEach((event) => {
    const comp = (event.competitions || [])[0] || {};
    const state = ((comp.status || event.status || {}).type || {}).state;
    if (state !== "post") return;
    const sides = comp.competitors || [];
    const mine = sides.find((x) => String(x.id || (x.team && x.team.id)) === String(teamId));
    const opp = sides.find((x) => x !== mine);
    const a = scoreValue(mine);
    const b = scoreValue(opp);
    if (!mine || !opp || !Number.isFinite(a) || !Number.isFinite(b)) return;
    total.games += 1;
    total.pointsFor += a;
    total.pointsAgainst += b;
  });
  return total;
}

function perGameFromStats(stats, perGameNames, totalNames, games, pathTest) {
  const direct = findTeamStat(stats, perGameNames, pathTest);
  if (direct !== "Not available") return direct;
  const total = findTeamNumber(stats, totalNames, pathTest);
  return total != null && games ? (total / games).toFixed(1) : "Not available";
}

function derivedPercent(stats, pctNames, madeNames, attemptNames, pathTest) {
  const direct = findTeamStat(stats, pctNames, pathTest);
  if (direct !== "Not available") return direct;
  const made = findTeamNumber(stats, madeNames, pathTest);
  const attempts = findTeamNumber(stats, attemptNames, pathTest);
  return made != null && attempts ? (made / attempts * 100).toFixed(1) + "%" : "Not available";
}

function statTile(label, value) {
  return '<div class="team-stat"><span>' + esc(label) + '</span><strong>' + esc(value == null ? "Not available" : value) + '</strong></div>';
}

function renderNFLStats(team, data, schedule) {
  const stats = flattenTeamStats(data || {}, "", []);
  const played = completedScheduleStats(schedule, team.id);
  const avgFor = recordStat(team, "avgPointsFor");
  const avgAgainst = recordStat(team, "avgPointsAgainst");
  const fmt = (x) => x == null ? null : Number(x).toFixed(1);
  const offense = [
    ["Points/game", fmt(avgFor) || (played.games ? (played.pointsFor / played.games).toFixed(1) : null) || findTeamStat(stats, ["pointsPerGame", "totalPointsPerGame"])],
    ["Pass yards/game", perGameFromStats(stats, ["passingYardsPerGame", "netPassingYardsPerGame"], ["passingYards", "netPassingYards"], played.games, /offen|team|pass/i)],
    ["Rush yards/game", perGameFromStats(stats, ["rushingYardsPerGame"], ["rushingYards", "totalRushingYards"], played.games, /offen|team|rush/i)],
    ["Touchdowns", findTeamStat(stats, ["totalTouchdowns", "offensiveTouchdowns"], /offen/i)],
    ["Points/drive", (() => {
      const published = findTeamStat(stats, ["pointsPerDrive", "offensivePointsPerDrive"]);
      if (published !== "Not available") return published;
      const drives = findTeamNumber(stats, ["totalDrives", "offensiveDrives", "drives"], /offen|team/i);
      return drives && played.games ? (played.pointsFor / drives).toFixed(2) : "Not available";
    })()],
    ["Sacks allowed", findTeamStat(stats, ["sacksAllowed", "timesSacked", "sacksTaken"], /pass|offen/i)]
  ];
  const defense = [
    ["Points allowed/game", fmt(avgAgainst) || (played.games ? (played.pointsAgainst / played.games).toFixed(1) : null) || findTeamStat(stats, ["pointsAllowedPerGame", "opponentPointsPerGame"])],
    ["Pass yards allowed/game", perGameFromStats(stats, ["passingYardsAllowedPerGame", "opponentPassingYardsPerGame"], ["passingYardsAllowed", "opponentPassingYards"], played.games, /defen|opponent/i)],
    ["Rush yards allowed/game", perGameFromStats(stats, ["rushingYardsAllowedPerGame", "opponentRushingYardsPerGame"], ["rushingYardsAllowed", "opponentRushingYards"], played.games, /defen|opponent/i)],
    ["Touchdowns allowed", findTeamStat(stats, ["touchdownsAllowed", "totalTouchdownsAllowed"])],
    ["Sacks", findTeamStat(stats, ["sacks", "totalSacks"], /defen/i)],
    ["Takeaways", findTeamStat(stats, ["takeaways", "totalTakeaways"]) ]
  ];
  return '<section class="card team-section"><h2>Team stats</h2><div class="team-stats-columns">' +
    '<div><h3>Offense</h3><div class="team-stat-grid">' + offense.map((x) => statTile(x[0], x[1])).join("") + '</div></div>' +
    '<div><h3>Defense</h3><div class="team-stat-grid">' + defense.map((x) => statTile(x[0], x[1])).join("") + '</div></div></div>' +
    '<p class="muted small">Missing averages are calculated from completed games or season totals when the required inputs are available.</p></section>';
}

function renderNFLSchedule(data, teamId) {
  const events = data.events || [];
  if (!events.length) return '<section class="card team-section"><h2>Season schedule</h2><div class="muted">Schedule unavailable.</div></section>';
  return '<section class="card team-section"><details open><summary>Season schedule</summary><div class="schedule-list">' +
    events.map((event) => {
      const comp = (event.competitions || [])[0] || {};
      const sides = comp.competitors || [];
      const mine = sides.find((x) => String(x.id || (x.team && x.team.id)) === String(teamId));
      const opp = sides.find((x) => x !== mine) || {};
      const ot = opp.team || {};
      const state = ((comp.status || event.status || {}).type || {}).state || "pre";
      const date = Date.parse(event.date);
      const when = isNaN(date) ? "TBD" : new Date(date).toLocaleDateString([], { month: "short", day: "numeric" });
      let result = "";
      if (state === "post" && mine) {
        const a = Number(mine.score && (mine.score.displayValue || mine.score.value != null ? (mine.score.displayValue || mine.score.value) : mine.score));
        const b = Number(opp.score && (opp.score.displayValue || opp.score.value != null ? (opp.score.displayValue || opp.score.value) : opp.score));
        if (!isNaN(a) && !isNaN(b)) result = (mine.winner ? "W" : "L") + " " + a + "–" + b;
      } else {
        result = ((comp.status || event.status || {}).type || {}).shortDetail || "Scheduled";
      }
      if (state === "post" && event.id) {
        const scheduleTeam = (side) => {
          const rawTeam = side.team || {};
          const score = scoreValue(side);
          return { name: rawTeam.displayName || rawTeam.shortDisplayName || rawTeam.name || "Team",
            abbr: rawTeam.abbreviation || "", logo: rawTeam.logo || ((rawTeam.logos || [])[0] || {}).href || "",
            score: Number.isFinite(score) ? String(score) : "", record: ((side.records || [])[0] || {}).summary || "", winner: !!side.winner };
        };
        const awaySide = sides.find((x) => x.homeAway === "away") || {};
        const homeSide = sides.find((x) => x.homeAway === "home") || {};
        gamesById["nfl:" + event.id] = { id: String(event.id), date: event.date || "", state: "post",
          detail: ((comp.status || event.status || {}).type || {}).shortDetail || "Final",
          away: scheduleTeam(awaySide), home: scheduleTeam(homeSide) };
      }
      const rowAttrs = state === "post" && event.id
        ? ' class="schedule-row schedule-result-link" role="button" tabindex="0" data-schedule-game="' + esc(event.id) + '" aria-label="View game result"'
        : ' class="schedule-row"';
      return '<div' + rowAttrs + '><span><b>' + esc((event.week && event.week.text) || when) + '</b><small>' + esc(when) + '</small></span>' +
        '<span class="schedule-opponent">' + esc(mine && mine.homeAway === "away" ? "at " : "vs ") + esc(ot.displayName || ot.shortDisplayName || "Opponent") +
        '</span><strong>' + esc(result) + (state === "post" && event.id ? ' <span aria-hidden="true">&rsaquo;</span>' : '') + '</strong></div>';
    }).join("") + '</div></details></section>';
}

function scoreValue(side) {
  const score = side && side.score;
  if (score == null) return NaN;
  if (typeof score === "object") return Number(score.displayValue != null ? score.displayValue : score.value);
  return Number(score);
}

function renderNBAStats(team, data, schedule) {
  const stats = flattenTeamStats(data || {}, "", []);
  const played = completedScheduleStats(schedule, team.id);
  const avgFor = recordStat(team, "avgPointsFor");
  const avgAgainst = recordStat(team, "avgPointsAgainst");
  const fmt = (x) => x == null ? null : Number(x).toFixed(1);
  const pick = (names, pathTest) => findTeamStat(stats, names, pathTest);
  const offense = [
    ["Points/game", fmt(avgFor) || (played.games ? (played.pointsFor / played.games).toFixed(1) : null) || pick(["avgPoints", "pointsPerGame", "averagePoints"])],
    ["Field goal %", derivedPercent(stats, ["fieldGoalPct", "fieldGoalPercentage", "avgFieldGoalPct"], ["fieldGoalsMade", "totalFieldGoalsMade"], ["fieldGoalsAttempted", "totalFieldGoalsAttempted"], /offen|team|general/i)],
    ["3-point %", derivedPercent(stats, ["threePointFieldGoalPct", "threePointPct", "threePointFieldGoalPercentage"], ["threePointFieldGoalsMade", "threePointersMade"], ["threePointFieldGoalsAttempted", "threePointersAttempted"], /offen|team|general/i)],
    ["Turnovers/game", perGameFromStats(stats, ["turnoversPerGame", "avgTurnovers"], ["turnovers", "totalTurnovers"], played.games, /offen|team|general/i)],
    ["Effective FG%", pick(["effectiveFieldGoalPct", "effectiveFieldGoalPercentage", "eFGPct"])],
    ["Free throw %", pick(["freeThrowPct", "freeThrowPercentage", "avgFreeThrowPct"], /offen|team|general/i)],
    ["Assists/game", perGameFromStats(stats, ["assistsPerGame", "avgAssists"], ["assists", "totalAssists"], played.games, /offen|team|general/i)],
    ["Off. rebounds/game", perGameFromStats(stats, ["offensiveReboundsPerGame", "avgOffensiveRebounds"], ["offensiveRebounds", "totalOffensiveRebounds"], played.games, /offen|team|general/i)],
    ["Assist/turnover ratio", pick(["assistTurnoverRatio", "assistToTurnoverRatio"])],
    ["Pace", pick(["pace", "possessionsPerGame", "estimatedPossessionsPerGame"])]
  ];
  const defense = [
    ["Opponent points/game", fmt(avgAgainst) || (played.games ? (played.pointsAgainst / played.games).toFixed(1) : null) || pick(["opponentPointsPerGame", "pointsAllowedPerGame", "avgPointsAgainst"])],
    ["Opponent FG%", derivedPercent(stats, ["opponentFieldGoalPct", "defensiveFieldGoalPct", "fieldGoalPctAgainst"], ["opponentFieldGoalsMade", "fieldGoalsMadeAgainst"], ["opponentFieldGoalsAttempted", "fieldGoalsAttemptedAgainst"], /defen|opponent/i)],
    ["Opponent 3-point %", derivedPercent(stats, ["opponentThreePointFieldGoalPct", "defensiveThreePointPct", "threePointPctAgainst"], ["opponentThreePointFieldGoalsMade", "threePointFieldGoalsMadeAgainst"], ["opponentThreePointFieldGoalsAttempted", "threePointFieldGoalsAttemptedAgainst"], /defen|opponent/i)],
    ["Steals/game", perGameFromStats(stats, ["stealsPerGame", "avgSteals"], ["steals", "totalSteals"], played.games, /defen|team|general/i)],
    ["Blocks/game", perGameFromStats(stats, ["blocksPerGame", "avgBlocks"], ["blocks", "totalBlocks"], played.games, /defen|team|general/i)],
    ["Def. rebounds/game", perGameFromStats(stats, ["defensiveReboundsPerGame", "avgDefensiveRebounds"], ["defensiveRebounds", "totalDefensiveRebounds"], played.games, /defen|team|general/i)],
    ["Turnovers forced/game", pick(["opponentTurnoversPerGame", "turnoversForcedPerGame", "avgTurnoversForced"])],
    ["Opponent eFG%", pick(["opponentEffectiveFieldGoalPct", "defensiveEffectiveFieldGoalPct"])],
    ["Personal fouls/game", pick(["foulsPerGame", "avgFouls", "personalFoulsPerGame"])],
    ["Point differential", played.games ? ((played.pointsFor - played.pointsAgainst) / played.games).toFixed(1) : pick(["pointDifferential", "avgPointDifferential", "averagePointDifferential"])]
  ];
  return '<section class="card team-section"><h2>Team stats</h2><p class="muted small">Betting-focused season averages and efficiency indicators.</p><div class="team-stats-columns">' +
    '<div><h3>Offense</h3><div class="team-stat-grid">' + offense.map((x) => statTile(x[0], x[1])).join("") + '</div></div>' +
    '<div><h3>Defense</h3><div class="team-stat-grid">' + defense.map((x) => statTile(x[0], x[1])).join("") + '</div></div></div>' +
    '<p class="muted small">Missing averages and percentages are calculated from completed games or season totals when the required inputs are available.</p></section>';
}

function renderNBASchedule(data, teamId) {
  const events = (data.events || []).slice().sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (!events.length) return '<section class="card team-section"><h2>Season schedule</h2><div class="muted">Schedule unavailable.</div></section>';
  const months = [];
  const indexed = {};
  events.forEach((event) => {
    const date = Date.parse(event.date);
    const key = isNaN(date) ? "tbd" : new Date(date).getFullYear() + "-" + new Date(date).getMonth();
    if (!indexed[key]) {
      indexed[key] = { label: isNaN(date) ? "Date TBD" : new Date(date).toLocaleDateString([], { month: "long" }), events: [] };
      months.push(indexed[key]);
    }
    indexed[key].events.push(event);
  });
  const monthHtml = months.map((month, index) => '<details class="schedule-month"' + (index === 0 ? " open" : "") + '><summary>' +
    esc(month.label) + ' <span>' + month.events.length + ' game' + (month.events.length === 1 ? "" : "s") + '</span></summary><div class="schedule-list">' +
    month.events.map((event) => {
      const comp = (event.competitions || [])[0] || {};
      const sides = comp.competitors || [];
      const mine = sides.find((x) => String(x.id || (x.team && x.team.id)) === String(teamId));
      const opp = sides.find((x) => x !== mine) || {};
      const ot = opp.team || {};
      const state = ((comp.status || event.status || {}).type || {}).state || "pre";
      const date = Date.parse(event.date);
      const when = isNaN(date) ? "TBD" : new Date(date).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
      let result;
      if (state === "post" && mine) {
        const a = scoreValue(mine);
        const b = scoreValue(opp);
        result = !isNaN(a) && !isNaN(b) ? (mine.winner ? "W" : "L") + " " + a + "–" + b : "Final";
      } else {
        result = ((comp.status || event.status || {}).type || {}).shortDetail || "Scheduled";
      }
      return '<div class="schedule-row"><span><b>' + esc(when) + '</b></span><span class="schedule-opponent">' +
        esc(mine && mine.homeAway === "away" ? "at " : "vs ") + esc(ot.displayName || ot.shortDisplayName || "Opponent") +
        '</span><strong>' + esc(result) + '</strong></div>';
    }).join("") + '</div></details>').join("");
  return '<section class="card team-section"><h2>Season schedule</h2><div class="month-schedule">' + monthHtml + '</div></section>';
}

function renderNBADepth(depth, roster, teamAbbr) {
  const playersById = rosterAthletes(roster || {});
  const positions = {};
  let hasPublishedDepth = false;
  const positionOrder = ["PG", "SG", "SF", "PF", "C", "G", "F"];
  const addPlayer = (position, slot, order) => {
    const ref = slot.athlete || slot.player || slot;
    const id = athleteId(ref);
    const player = playersById[id] || ref || {};
    const name = player.displayName || player.fullName || player.shortName || slot.displayName;
    if (!name) return;
    const pos = String(position || (player.position && player.position.abbreviation) || "ROT").toUpperCase();
    if (!positions[pos]) positions[pos] = [];
    if (!positions[pos].some((x) => x.id === id && id)) {
      positions[pos].push({ id: id, name: name, jersey: player.jersey || slot.jersey || "", order: Number(order) || positions[pos].length + 1 });
    }
  };

  const containers = [depth || {}].concat((depth && depth.items) || []);
  containers.forEach((chart) => {
    const chartPositions = chart.positions || {};
    Object.keys(chartPositions).forEach((key) => {
      const position = chartPositions[key] || {};
      const label = (position.position && position.position.abbreviation) || position.abbreviation || key;
      const slots = position.athletes || position.items || [];
      if (slots.length) hasPublishedDepth = true;
      slots.forEach((slot, index) => addPlayer(label, slot, slot.rank || slot.order || index + 1));
    });
  });

  // ESPN occasionally publishes the roster before its formal depth chart.
  // In that case, still show a useful position-by-position rotation.
  if (!Object.keys(positions).length) {
    Object.keys(playersById).forEach((id) => {
      const player = playersById[id];
      addPlayer((player.position || {}).abbreviation, player, 99);
    });
  }

  const keys = Object.keys(positions).sort((a, b) => {
    const ai = positionOrder.indexOf(a);
    const bi = positionOrder.indexOf(b);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b);
  });
  if (!keys.length) return '<section class="card team-section"><h2>Depth chart</h2><div class="muted">Depth chart unavailable.</div></section>';

  const cards = keys.map((position) => {
    const players = positions[position].sort((a, b) => a.order - b.order);
    return '<div class="nba-depth-position"><h3>' + esc(position) + '</h3>' + players.map((player, index) =>
      '<div class="nba-depth-player"><span class="depth-rank">' + (hasPublishedDepth ? (index === 0 ? "Starter" : "Bench " + index) : "Rotation " + (index + 1)) + '</span>' +
      '<strong>' + (player.id ? '<button type="button" class="nba-player-link" data-nba-player="' + esc(player.id) +
        '" data-player-team="' + esc(teamAbbr || "") + '">' + esc(player.name) + '</button>' : esc(player.name)) + '</strong>' +
      (player.jersey ? '<small>#' + esc(player.jersey) + '</small>' : '') + '</div>'
    ).join("") + '</div>';
  }).join("");
  return '<section class="card team-section"><details open><summary>Depth chart</summary><p class="muted small">' +
    (hasPublishedDepth ? "Current starters and rotation by position." : "Current roster grouped by position; official starter order is not available.") + '</p>' +
    '<div class="nba-depth-grid">' + cards + '</div></details></section>';
}

function nbaPlayerStatSet(statsPayload) {
  const stats = flattenTeamStats(statsPayload || {}, "", []);
  const pick = (label, names) => [label, findTeamStat(stats, names)];
  return [
    pick("Games", ["gamesPlayed", "games"]), pick("Games started", ["gamesStarted", "starts"]),
    pick("Minutes/game", ["avgMinutes", "minutesPerGame", "averageMinutes"]),
    pick("Points/game", ["avgPoints", "pointsPerGame", "averagePoints"]),
    pick("Rebounds/game", ["avgRebounds", "reboundsPerGame", "averageRebounds"]),
    pick("Assists/game", ["avgAssists", "assistsPerGame", "averageAssists"]),
    pick("Field goal %", ["fieldGoalPct", "fieldGoalPercentage"]),
    pick("3-point %", ["threePointFieldGoalPct", "threePointPct", "threePointFieldGoalPercentage"]),
    pick("Free throw %", ["freeThrowPct", "freeThrowPercentage"]),
    pick("Steals/game", ["avgSteals", "stealsPerGame", "averageSteals"]),
    pick("Blocks/game", ["avgBlocks", "blocksPerGame", "averageBlocks"]),
    pick("Turnovers/game", ["avgTurnovers", "turnoversPerGame", "averageTurnovers"]),
    pick("Off. rebounds/game", ["avgOffensiveRebounds", "offensiveReboundsPerGame"]),
    pick("Def. rebounds/game", ["avgDefensiveRebounds", "defensiveReboundsPerGame"]),
    pick("Assist/turnover", ["assistTurnoverRatio", "assistToTurnoverRatio"]),
    pick("Double-doubles", ["doubleDouble", "doubleDoubles"])
  ].filter((item) => item[1] !== "Not available");
}

function renderNBAPlayerProfile(player, overview, statsPayload, team) {
  const source = (overview && (overview.athlete || overview.player)) || overview || {};
  const merged = Object.assign({}, player || {}, source || {});
  const name = merged.displayName || merged.fullName || merged.shortName || "NBA player";
  const position = nflPlayerPosition(merged) || nflPlayerPosition(player);
  const photo = nflPlayerImage(merged) || nflPlayerImage(player) ||
    (merged.id ? "https://a.espncdn.com/i/headshots/nba/players/full/" + encodeURIComponent(merged.id) + ".png" : "");
  const number = merged.jersey || merged.number || "";
  const height = merged.displayHeight || merged.heightDisplay || "";
  const weight = merged.displayWeight || (merged.weight ? merged.weight + " lbs" : "");
  const experience = merged.experience && (merged.experience.displayValue || (merged.experience.years != null ? merged.experience.years + " years" : ""));
  const college = merged.college && (merged.college.name || merged.college.displayName || merged.college);
  const birth = merged.dateOfBirth ? new Date(merged.dateOfBirth).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) : "";
  const details = [height, weight, experience, college, birth ? "Born " + birth : ""].filter(Boolean);
  const stats = nbaPlayerStatSet(statsPayload);
  const logo = teamLogo(team);
  const color = String(team.color || "263444").replace(/[^0-9a-f]/gi, "").slice(0, 6) || "263444";
  return backButton() + '<section class="nfl-player-hero nba-player-hero" style="--player-color:#' + esc(color) + '">' +
    '<div class="nfl-player-photo">' + (photo ? '<img src="' + esc(photo) + '" alt="' + esc(name) + '" onerror="this.style.display=\'none\'">' : '') +
    (number ? '<span>' + esc(number) + '</span>' : '') + '</div><div class="nfl-player-bio"><div class="eyebrow">NBA PLAYER</div><h2>' + esc(name) +
    '</h2><p>' + esc([team.displayName || team.name, position, number ? "#" + number : ""].filter(Boolean).join(" · ")) +
    '</p><small>' + esc(details.join(" · ")) + '</small></div>' +
    (logo ? '<img class="nfl-player-team-logo" src="' + esc(logo) + '" alt="">' : '') + '</section>' +
    '<section class="card team-section"><h2>Season stats</h2>' + (stats.length
      ? '<div class="nfl-player-stats nba-player-stats">' + stats.map((item) => statTile(item[0], item[1])).join("") + '</div>'
      : '<div class="muted">Season statistics are not available for this player yet.</div>') +
    '<p class="muted small">Current NBA regular-season averages and totals.</p></section>';
}

async function showNBAPlayer() {
  const d = detail;
  updatedEl.textContent = "";
  view.innerHTML = backButton() + '<div class="message">Loading player profile&hellip;</div>';
  try {
    const cache = await getJson("data/nba_teams.json");
    const teams = cache && cache.data && cache.data.teams || {};
    let entry = teams[String(d.teamAbbr || "").toUpperCase()];
    if (!entry) {
      entry = Object.keys(teams).map((key) => teams[key]).find((candidate) =>
        !!rosterAthletes(candidate.roster || {})[String(d.playerId)]);
    }
    if (!entry || !entry.team) throw new Error("Team unavailable");
    const player = rosterAthletes(entry.roster || {})[String(d.playerId)] || { id: d.playerId };
    const base = "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/" + encodeURIComponent(d.playerId);
    const results = await Promise.allSettled([
      fetch(base + "/overview", { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch(base + "/stats", { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    ]);
    const overview = results[0].status === "fulfilled" ? results[0].value : {};
    const stats = results[1].status === "fulfilled" ? results[1].value : overview;
    if (detail !== d) return;
    view.innerHTML = renderNBAPlayerProfile(player, overview, stats, entry.team);
  } catch (err) {
    if (detail !== d) return;
    view.innerHTML = backButton() + '<div class="message">Couldn\'t load this NBA player right now. Run the data workflow once, then refresh.</div>';
  }
}

function openNBAPlayer(playerId, teamAbbr) {
  detail = { sportId: "nba", kind: "nba-player", playerId: playerId, teamAbbr: teamAbbr, returnTo: current };
  history.pushState({ detail: true }, "", location.href);
  window.scrollTo(0, 0);
  show();
}

function paintNBATeam(d, abbr, team, schedule, stats, depth, roster) {
  if (detail !== d) return;
  const logo = teamLogo(team);
  const record = team.recordSummary || (team.record && team.record.items && team.record.items[0] && team.record.items[0].summary) || "";
  view.innerHTML = backButton() + '<section class="team-hero" style="--team-color:#' + esc(team.color || "263444") + '">' +
    (logo ? '<img src="' + esc(logo) + '" alt="' + esc(team.displayName || abbr) + ' logo">' : '') +
    '<div><div class="team-hero-heading"><div><div class="eyebrow">NBA TEAM</div><h2>' + esc(team.displayName || abbr) + '</h2></div>' +
    favoriteButton("nba", { abbr: abbr, name: team.displayName || abbr, logo: logo }, "hero-favorite") + '</div><p>' +
    esc([record, team.standingSummary].filter(Boolean).join(" · ")) + '</p></div></section>' +
    renderNBAStats(team, stats, schedule || {}) + renderNBADepth(depth || {}, roster || {}, abbr) + renderNBASchedule(schedule || {}, team.id);
}

async function showNBATeam() {
  const d = detail;
  const abbr = d.teamAbbr;
  updatedEl.textContent = "";
  view.innerHTML = backButton() + '<div class="message">Loading team page&hellip;</div>';
  try {
    const cache = await getJson("data/nba_teams.json");
    const entry = cache && cache.data && cache.data.teams && cache.data.teams[String(abbr).toUpperCase()];
    if (!entry || !entry.team || !entry.team.id) throw new Error("Team cache unavailable");
    paintNBATeam(d, abbr, entry.team, entry.schedule, entry.stats, entry.depth, entry.roster);
  } catch (err) {
    if (detail !== d) return;
    view.innerHTML = backButton() + '<div class="message"><b>NBA team profiles have not been downloaded yet.</b><br>' +
      'Run the Update sports data workflow once after installing this version, then refresh the page.</div>';
  }
}

function openNBATeam(abbr) {
  const returnTo = current;
  detail = { sportId: "nba", kind: "nba-team", teamAbbr: abbr, returnTo: returnTo };
  if (["home", "live", "favorites", "odds"].includes(current)) current = "nba";
  history.pushState({ detail: true }, "", location.href);
  window.scrollTo(0, 0);
  show();
}

function athleteId(ref) {
  const match = String((ref && (ref.$ref || ref.href)) || "").match(/athletes\/(\d+)/);
  return match ? match[1] : String((ref && ref.id) || "");
}

function rosterAthletes(team) {
  const found = {};
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.id && node.displayName && node.position) found[String(node.id)] = node;
    Object.keys(node).forEach((k) => { if (node[k] && typeof node[k] === "object") walk(node[k]); });
  })(team);
  return found;
}

function renderNFLDepth(depth, team, teamAbbr) {
  const roster = rosterAthletes(team);
  const charts = depth.items || [];
  if (!charts.length) return '<section class="card team-section"><h2>Depth chart</h2><div class="muted">Depth chart unavailable.</div></section>';
  const blocks = charts.map((chart) => {
    const positions = chart.positions || {};
    const rows = Object.keys(positions).map((key) => {
      const pos = positions[key] || {};
      const players = (pos.athletes || []).slice(0, 3).map((slot) => {
        const id = athleteId(slot.athlete || slot);
        const player = roster[id] || slot.athlete || {};
        const name = player.displayName || player.fullName || player.shortName || "Player unavailable";
        return id ? '<button type="button" class="nfl-player-link" data-nfl-player="' + esc(id) + '" data-player-team="' +
          esc(teamAbbr || "") + '">' + esc(name) + '</button>' : '<span>' + esc(name) + '</span>';
      });
      return '<div class="depth-row"><strong>' + esc((pos.position && pos.position.abbreviation) || key.toUpperCase()) + '</strong><span class="depth-players">' +
        (players.join('<i aria-hidden="true">·</i>') || "Not listed") + '</span></div>';
    }).join("");
    return '<div class="depth-unit"><h3>' + esc(chart.displayName || chart.name || "Unit") + '</h3>' + rows + '</div>';
  }).join("");
  return '<section class="card team-section"><details open><summary>Depth chart</summary><div class="depth-grid">' + blocks + '</div></details></section>';
}

function nflPlayerImage(player) {
  const image = player && (player.headshot || player.image);
  if (typeof image === "string") return image;
  return (image && (image.href || image.url)) || "";
}

function nflPlayerPosition(player) {
  const position = player && player.position;
  return typeof position === "string" ? position : ((position && (position.abbreviation || position.name)) || "");
}

function nflPlayerStatSet(profile, position) {
  const stats = flattenTeamStats(profile || {}, "", []);
  const pick = (label, names) => [label, findTeamStat(stats, names)];
  const pos = String(position || "").toUpperCase();
  let wanted;
  if (pos === "QB") {
    wanted = [pick("Games", ["gamesPlayed", "games"]), pick("Completions", ["completions"]),
      pick("Passing yards", ["passingYards", "netPassingYards"]), pick("Pass TD", ["passingTouchdowns"]),
      pick("Interceptions", ["interceptions"]), pick("Completion %", ["completionPct", "completionPercentage"]),
      pick("Passer rating", ["quarterbackRating", "QBRating", "passerRating"]), pick("Rush yards", ["rushingYards"]),
      pick("Rush TD", ["rushingTouchdowns"])];
  } else if (["RB", "FB"].includes(pos)) {
    wanted = [pick("Games", ["gamesPlayed", "games"]), pick("Carries", ["rushingAttempts", "carries"]),
      pick("Rush yards", ["rushingYards"]), pick("Yards/carry", ["yardsPerRushAttempt", "yardsPerCarry"]),
      pick("Rush TD", ["rushingTouchdowns"]), pick("Receptions", ["receptions"]),
      pick("Receiving yards", ["receivingYards"]), pick("Receiving TD", ["receivingTouchdowns"]), pick("Fumbles", ["fumbles"])];
  } else if (["WR", "TE"].includes(pos)) {
    wanted = [pick("Games", ["gamesPlayed", "games"]), pick("Targets", ["receivingTargets", "targets"]),
      pick("Receptions", ["receptions"]), pick("Receiving yards", ["receivingYards"]),
      pick("Yards/reception", ["yardsPerReception"]), pick("Receiving TD", ["receivingTouchdowns"]),
      pick("Longest catch", ["longReception", "longReceiving"]), pick("Catch %", ["receptionPct", "catchPercentage"])];
  } else if (["K", "PK"].includes(pos)) {
    wanted = [pick("Games", ["gamesPlayed", "games"]), pick("FG made", ["fieldGoalsMade"]),
      pick("FG attempts", ["fieldGoalAttempts", "fieldGoalsAttempted"]), pick("FG %", ["fieldGoalPct", "fieldGoalPercentage"]),
      pick("Long FG", ["longFieldGoalMade", "longFieldGoal"]), pick("XP made", ["extraPointsMade"]),
      pick("XP attempts", ["extraPointAttempts", "extraPointsAttempted"])];
  } else if (["P"].includes(pos)) {
    wanted = [pick("Punts", ["punts"]), pick("Punt yards", ["puntYards"]), pick("Average", ["grossAvgPuntYards", "yardsPerPunt"]),
      pick("Long", ["longPunt"]), pick("Inside 20", ["puntsInside20"]), pick("Touchbacks", ["puntTouchbacks"])];
  } else {
    wanted = [pick("Games", ["gamesPlayed", "games"]), pick("Total tackles", ["totalTackles", "tackles"]),
      pick("Solo tackles", ["soloTackles"]), pick("Sacks", ["sacks"]), pick("Tackles for loss", ["tacklesForLoss"]),
      pick("Interceptions", ["defensiveInterceptions", "interceptions"]), pick("Passes defended", ["passesDefended", "passesDefensed"]),
      pick("Forced fumbles", ["forcedFumbles"]), pick("Fumble recoveries", ["fumbleRecoveries"])];
  }
  return wanted.filter((item) => item[1] !== "Not available");
}

function renderNFLPlayerProfile(player, profile, team) {
  const source = (profile && (profile.athlete || profile.player)) || profile || {};
  const merged = Object.assign({}, player || {}, source || {});
  const name = merged.displayName || merged.fullName || merged.shortName || "NFL player";
  const position = nflPlayerPosition(merged) || nflPlayerPosition(player);
  const photo = nflPlayerImage(merged) || nflPlayerImage(player) ||
    (merged.id ? "https://a.espncdn.com/i/headshots/nfl/players/full/" + encodeURIComponent(merged.id) + ".png" : "");
  const teamName = team.displayName || team.name || "";
  const number = merged.jersey || merged.number || "";
  const height = merged.displayHeight || merged.heightDisplay || "";
  const weight = merged.displayWeight || (merged.weight ? merged.weight + " lbs" : "");
  const experience = merged.experience && (merged.experience.displayValue || (merged.experience.years != null ? merged.experience.years + " years" : ""));
  const college = merged.college && (merged.college.name || merged.college.displayName || merged.college);
  const bioDetails = [height, weight, experience, college].filter(Boolean);
  const stats = nflPlayerStatSet(profile, position);
  const logo = teamLogo(team);
  const color = String(team.color || "263444").replace(/[^0-9a-f]/gi, "").slice(0, 6) || "263444";
  return backButton() + '<section class="nfl-player-hero" style="--player-color:#' + esc(color) + '">' +
    '<div class="nfl-player-photo">' + (photo ? '<img src="' + esc(photo) + '" alt="' + esc(name) + '" onerror="this.style.display=\'none\'">' : '') +
    (number ? '<span>' + esc(number) + '</span>' : '') + '</div><div class="nfl-player-bio"><div class="eyebrow">NFL PLAYER</div><h2>' + esc(name) +
    '</h2><p>' + esc([teamName, position, number ? "#" + number : ""].filter(Boolean).join(" · ")) + '</p><small>' + esc(bioDetails.join(" · ")) + '</small></div>' +
    (logo ? '<img class="nfl-player-team-logo" src="' + esc(logo) + '" alt="">' : '') + '</section>' +
    '<section class="card team-section"><h2>Season stats</h2>' + (stats.length
      ? '<div class="nfl-player-stats">' + stats.map((item) => statTile(item[0], item[1])).join("") + '</div>'
      : '<div class="muted">Season statistics are not available for this player yet.</div>') +
    '<p class="muted small">Statistics shown are for the current NFL regular season.</p></section>';
}

async function showNFLPlayer() {
  const d = detail;
  updatedEl.textContent = "";
  view.innerHTML = backButton() + '<div class="message">Loading player profile&hellip;</div>';
  try {
    const cache = await getJson("data/nfl_teams.json");
    const teams = cache && cache.data && cache.data.teams || {};
    let entry = teams[String(d.teamAbbr || "").toUpperCase()];
    if (!entry) {
      entry = Object.keys(teams).map((key) => teams[key]).find((candidate) =>
        !!rosterAthletes(candidate.roster || {})[String(d.playerId)]);
    }
    if (!entry || !entry.team) throw new Error("Team unavailable");
    const players = rosterAthletes(entry.roster || {});
    const player = players[String(d.playerId)] || { id: d.playerId };
    let profile = {};
    try {
      const response = await fetch("https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/" +
        encodeURIComponent(d.playerId), { cache: "no-store" });
      if (response.ok) profile = await response.json();
    } catch (err) { /* cached roster still provides the profile shell */ }
    if (detail !== d) return;
    view.innerHTML = renderNFLPlayerProfile(player, profile, entry.team);
  } catch (err) {
    if (detail !== d) return;
    view.innerHTML = backButton() + '<div class="message">Couldn\'t load this NFL player right now. Run the data workflow once, then refresh.</div>';
  }
}

function openNFLPlayer(playerId, teamAbbr) {
  detail = { sportId: "nfl", kind: "nfl-player", playerId: playerId, teamAbbr: teamAbbr, returnTo: current };
  history.pushState({ detail: true }, "", location.href);
  window.scrollTo(0, 0);
  show();
}

function paintNFLTeam(d, abbr, team, schedule, stats, depth, roster) {
    if (detail !== d) return;
    const id = team.id;
    const logo = teamLogo(team);
    const record = team.record && team.record.items && team.record.items[0]
      ? team.record.items[0].summary : (team.recordSummary || "");
    const header = backButton() + '<section class="team-hero" style="--team-color:#' + esc(team.color || "263444") + '">' +
      (logo ? '<img src="' + esc(logo) + '" alt="' + esc(team.displayName || abbr) + ' logo">' : '') +
      '<div><div class="team-hero-heading"><div><div class="eyebrow">NFL TEAM</div><h2>' + esc(team.displayName || abbr) + '</h2></div>' +
      favoriteButton("nfl", { abbr: abbr, name: team.displayName || abbr, logo: logo }, "hero-favorite") + '</div><p>' +
      esc([record, team.standingSummary].filter(Boolean).join(" · ")) + '</p></div></section>';
    const section = (render, fallback) => {
      try { return render(); } catch (err) { return fallback; }
    };
    view.innerHTML = header +
      section(() => renderNFLStats(team, stats, schedule || {}),
        '<section class="card team-section"><h2>Team stats</h2><div class="muted">Stats are temporarily unavailable.</div></section>') +
      section(() => renderNFLDepth(depth || {}, roster || {}, abbr),
        '<section class="card team-section"><h2>Depth chart</h2><div class="muted">Depth chart is temporarily unavailable.</div></section>') +
      section(() => renderNFLSchedule(schedule || {}, id),
        '<section class="card team-section"><h2>Season schedule</h2><div class="muted">Schedule is temporarily unavailable.</div></section>');
}

async function showNFLTeam() {
  const d = detail;
  const abbr = d.teamAbbr;
  updatedEl.textContent = "";
  view.innerHTML = backButton() + '<div class="message">Loading team page&hellip;</div>';
  try {
    // GitHub Actions stores this file locally so GitHub Pages never depends on
    // cross-origin ESPN requests from the visitor's browser.
    const cache = await getJson("data/nfl_teams.json");
    const entry = cache && cache.data && cache.data.teams && cache.data.teams[String(abbr).toUpperCase()];
    if (!entry || !entry.team || !entry.team.id) throw new Error("Team cache unavailable");
    paintNFLTeam(d, abbr, entry.team, entry.schedule, entry.stats, entry.depth, entry.roster);
  } catch (err) {
    if (detail !== d) return;
    view.innerHTML = backButton() + '<div class="message"><b>Team profiles have not been downloaded yet.</b><br>' +
      'Run the Update sports data workflow once after installing this version, then refresh the page.</div>';
  }
}

function openNFLTeam(abbr) {
  const returnTo = current;
  detail = { sportId: "nfl", kind: "team", teamAbbr: abbr, returnTo: returnTo };
  if (["home", "live", "favorites", "odds"].includes(current)) current = "nfl";
  history.pushState({ detail: true }, "", location.href);
  window.scrollTo(0, 0);
  show();
}

function openGame(id, sportId) {
  const selectedSport = sportId || current;
  const sport = SPORTS.find((s) => s.id === selectedSport);
  const game = gamesById[selectedSport + ":" + id] || gamesById[id];
  if (!sport || !game) return;
  const returnTo = current;
  detail = { sportId: sport.id, id: id, game: game, returnTo: returnTo };
  if (["home", "live", "favorites", "odds"].includes(current)) current = sport.id;
  history.pushState({ detail: true }, "", location.href);
  window.scrollTo(0, 0);
  show();
}

function openNFLScheduleGame(id) {
  const game = gamesById["nfl:" + id] || gamesById[id];
  if (!game) return;
  const parentTeamAbbr = detail && detail.teamAbbr;
  detail = { sportId: "nfl", id: id, game: game, returnTo: "nfl", parentTeamAbbr: parentTeamAbbr };
  history.pushState({ detail: true }, "", location.href);
  window.scrollTo(0, 0);
  show();
}

function leaveDetail() {
  const returnTo = detail && detail.returnTo;
  if (detail && detail.kind === "f1-session" && detail.round) {
    detail = { sportId: "f1", kind: "race", round: detail.round, returnTo: "f1" };
    current = "f1";
    view.removeAttribute("data-detail");
    show();
    return;
  }
  if (detail && detail.kind === "nfl-player" && detail.teamAbbr) {
    detail = { sportId: "nfl", kind: "team", teamAbbr: detail.teamAbbr, returnTo: "nfl" };
    current = "nfl";
    view.removeAttribute("data-detail");
    syncPageMenu();
    show();
    return;
  }
  if (detail && detail.kind === "nba-player" && detail.teamAbbr) {
    detail = { sportId: "nba", kind: "nba-team", teamAbbr: detail.teamAbbr, returnTo: "nba" };
    current = "nba";
    view.removeAttribute("data-detail");
    syncPageMenu();
    show();
    return;
  }
  if (detail && detail.parentTeamAbbr) {
    detail = { sportId: "nfl", kind: "team", teamAbbr: detail.parentTeamAbbr, returnTo: "nfl" };
    current = "nfl";
    view.removeAttribute("data-detail");
    syncPageMenu();
    show();
    return;
  }
  detail = null;
  if (returnTo) current = returnTo;
  view.removeAttribute("data-detail");
  syncPageMenu();
  show();
}

function goBack() {
  // Going back through history keeps the phone's back gesture and the Back button in sync.
  if (history.state && history.state.detail) history.back();
  else leaveDetail();
}

window.addEventListener("popstate", () => { if (detail) leaveDetail(); });

view.addEventListener("click", (event) => {
  const propFilter = event.target.closest("button[data-prop-filter]");
  if (propFilter) { oddsState.filter = propFilter.getAttribute("data-prop-filter") || "all"; paintOdds(); return; }
  const propPlayer = event.target.closest("button[data-prop-player]");
  if (propPlayer) { oddsState.query = propPlayer.getAttribute("data-prop-player") || ""; paintOdds(); return; }
  if (event.target.closest("[data-refresh-odds]")) { fetchNbaProps(true); return; }
  if (event.target.closest("[data-odds-settings]")) { saveOddsKey(""); renderOddsSetup("Enter a different key below."); return; }
  const favorite = event.target.closest("button[data-favorite-sport]");
  if (favorite) { event.preventDefault(); event.stopPropagation(); toggleFavorite(favorite); return; }
  if (event.target.closest("[data-open-favorites]")) { selectSport("favorites"); return; }
  const gameTab = event.target.closest("button[data-game-tab]");
  if (gameTab) {
    const target = gameTab.getAttribute("data-game-tab");
    view.querySelectorAll("[data-game-tab]").forEach((button) => button.classList.toggle("active", button === gameTab));
    view.querySelectorAll("[data-game-panel]").forEach((panel) => panel.classList.toggle("active", panel.getAttribute("data-game-panel") === target));
    return;
  }
  const chartView = event.target.closest("button[data-chart-view]");
  if (chartView) {
    const target = chartView.getAttribute("data-chart-view");
    const card = chartView.closest(".game-charts");
    card.querySelectorAll("[data-chart-view]").forEach((button) => button.classList.toggle("active", button === chartView));
    card.querySelectorAll("[data-chart-panel]").forEach((panel) => panel.classList.toggle("active", panel.getAttribute("data-chart-panel") === target));
    return;
  }
  const lineupTeam = event.target.closest("button[data-lineup-team]");
  if (lineupTeam) {
    const target = lineupTeam.getAttribute("data-lineup-team");
    const card = lineupTeam.closest(".soccer-lineups");
    card.querySelectorAll("[data-lineup-team]").forEach((button) => button.classList.toggle("active", button === lineupTeam));
    card.querySelectorAll("[data-lineup-panel]").forEach((panel) => panel.classList.toggle("active", panel.getAttribute("data-lineup-panel") === target));
    return;
  }
  const league = event.target.closest("[data-league]");
  if (league) { selectSport(league.getAttribute("data-league")); return; }
  if (event.target.closest("[data-go-home]")) { selectSport("home"); return; }
  if (event.target.closest("#back")) { goBack(); return; }
  const sw = event.target.closest("button[data-switch]");
  if (sw) { selectSport(sw.getAttribute("data-switch")); return; }
  const driverEl = event.target.closest("button[data-driver]");
  if (driverEl) { event.stopPropagation(); openF1Driver(driverEl.getAttribute("data-driver")); return; }
  const f1Session = event.target.closest("button[data-f1-session]");
  if (f1Session) {
    openF1Session(f1Session.getAttribute("data-f1-round"), f1Session.getAttribute("data-f1-session"));
    return;
  }
  const golferEl = event.target.closest("button[data-golfer]");
  if (golferEl) { event.stopPropagation(); openGolfPlayer(golferEl.getAttribute("data-golfer")); return; }
  const nflPlayerEl = event.target.closest("button[data-nfl-player]");
  if (nflPlayerEl) {
    event.stopPropagation();
    openNFLPlayer(nflPlayerEl.getAttribute("data-nfl-player"), nflPlayerEl.getAttribute("data-player-team"));
    return;
  }
  const nbaPlayerEl = event.target.closest("button[data-nba-player]");
  if (nbaPlayerEl) {
    event.stopPropagation();
    openNBAPlayer(nbaPlayerEl.getAttribute("data-nba-player"), nbaPlayerEl.getAttribute("data-player-team"));
    return;
  }
  const scheduleGame = event.target.closest("[data-schedule-game]");
  if (scheduleGame) { openNFLScheduleGame(scheduleGame.getAttribute("data-schedule-game")); return; }
  const raceEl = event.target.closest("[data-round]");
  if (raceEl) { openRace(Number(raceEl.getAttribute("data-round"))); return; }
  const teamEl = event.target.closest("button[data-team]");
  if (teamEl) {
    event.stopPropagation();
    const opener = teamEl.getAttribute("data-team-sport") === "nba" ? openNBATeam : openNFLTeam;
    opener(teamEl.getAttribute("data-team"));
    return;
  }
  const el = event.target.closest(".game[data-id]");
  if (el) openGame(el.getAttribute("data-id"), el.getAttribute("data-sport"));
});

// Picking a different driver in the lap-by-lap table.
view.addEventListener("change", (event) => {
  if (event.target && event.target.id === "propSort") { oddsState.sort = event.target.value; paintOdds(); return; }
  if (event.target && event.target.id === "lapDriver" && raceData) {
    document.getElementById("lapTable").innerHTML = renderLapTable(raceData, event.target.value);
  }
});

view.addEventListener("input", (event) => {
  if (event.target && event.target.id === "propSearch") {
    oddsState.query = event.target.value;
    const cursor = event.target.selectionStart;
    paintOdds();
    const input = document.getElementById("propSearch");
    if (input) { input.focus(); input.setSelectionRange(cursor, cursor); }
  }
});

view.addEventListener("submit", (event) => {
  if (!event.target || event.target.id !== "oddsKeyForm") return;
  event.preventDefault();
  const input = event.target.querySelector("[name=apiKey]");
  const key = input && input.value.trim();
  if (!key) return;
  saveOddsKey(key);
  try { localStorage.removeItem(ODDS_CACHE_KEY); localStorage.removeItem(ODDS_HISTORY_KEY); } catch (e) { /* ignore */ }
  fetchNbaProps(true);
});

view.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  if (event.target.closest && event.target.closest("button[data-team]")) return;
  const scheduleGame = event.target.closest && event.target.closest("[data-schedule-game]");
  if (scheduleGame) { event.preventDefault(); openNFLScheduleGame(scheduleGame.getAttribute("data-schedule-game")); return; }
  const el = event.target.closest && event.target.closest(".game[data-id]");
  if (el) { event.preventDefault(); openGame(el.getAttribute("data-id"), el.getAttribute("data-sport")); }
});

// ---- tabs and loading -------------------------------------------------------

function selectSport(id) {
  current = id;
  detail = null;
  view.removeAttribute("data-detail");
  saveTab(current);
  history.replaceState(null, "", "#" + current);
  syncPageMenu();
  show();
}

pageMenu.addEventListener("change", () => selectSport(pageMenu.value));
brandHome.addEventListener("click", () => selectSport("home"));

const NO_DATA =
  '<div class="message">No data yet. In your GitHub repo, open the Actions tab, ' +
  'choose "Update sports data", and click "Run workflow". Refresh this page after it finishes.</div>';

async function show() {
  if (current === "home") { await renderHome(); return; }
  if (current === "live") { await renderLive(); return; }
  if (current === "favorites") { await renderFavorites(); return; }
  if (current === "odds") { await renderOdds(); return; }
  const sport = SPORTS.find((s) => s.id === current);

  if (detail && detail.sportId === current) {
    if (detail.kind === "race") await showRace();
    else if (detail.kind === "f1-session") await showF1Session();
    else if (detail.kind === "driver") await showF1Driver();
    else if (detail.kind === "golfer") await showGolfPlayer();
    else if (detail.kind === "nfl-player") await showNFLPlayer();
    else if (detail.kind === "nba-player") await showNBAPlayer();
    else if (detail.kind === "team") await showNFLTeam();
    else if (detail.kind === "nba-team") await showNBATeam();
    else await showDetail();
    return;
  }

  try {
    if (sport.kind === "f1" || sport.kind === "golf") {
      const payload = await getJson(sport.file);
      if (current !== sport.id) return; // user switched tabs while loading
      view.innerHTML = sport.kind === "golf" ? renderGolf(payload) : renderF1(payload);
      updatedEl.textContent = payload.updated ? "Data changed " + timeAgo(payload.updated) : "";
      return;
    }

    const requests = [getJson(sport.scores), getJson(sport.extra)];
    if (sport.id === "nfl") requests.push(getJson("data/nfl_teams.json"));
    const results = await Promise.allSettled(requests);
    if (current !== sport.id) return;
    const scores = results[0].status === "fulfilled" ? results[0].value : null;
    const extra = results[1].status === "fulfilled" ? results[1].value : null;
    const nflTeams = results[2] && results[2].status === "fulfilled" ? results[2].value : null;
    if (!scores && !extra) throw new Error("no data");
    loaded[sport.id] = { scores: scores, extra: extra };
    const shown = scores ? { updated: scores.updated, data: { games: mergedGames(sport.id, scores) } } : null;
    view.innerHTML = renderLeague(sport, shown, extra, nflTeams);
    updatedEl.textContent = scores && scores.updated ? "Scores changed " + timeAgo(scores.updated) : "";
    refreshLive(); // if a game is on, grab fresher scores right away
  } catch (err) {
    if (current !== sport.id) return;
    updatedEl.textContent = "";
    view.innerHTML = NO_DATA;
  }
}

// ---- live scores straight from ESPN ------------------------------------------
// While a game is on (or about to start), the page asks ESPN for fresh scores
// every 30 seconds. It only swaps the games list, so nothing else on the page jumps.

const loaded = {};   // sport id -> { scores, extra } as last read from the data files
const overlay = {};  // sport id -> { at, games: { id: game } } fresher copies fetched from ESPN
let liveBusy = false;
let liveScreenBusy = false;
let detailRefreshBusy = false;

function parseEspnEvent(e) {
  const comp = (e.competitions && e.competitions[0]) || {};
  const side = (which) => {
    const x = (comp.competitors || []).find((c) => c.homeAway === which);
    if (!x) return { name: "", abbr: "", logo: "", score: "", record: "", rank: 0, winner: false };
    const t = x.team || {};
    let rank = parseInt(x.curatedRank && x.curatedRank.current, 10);
    if (isNaN(rank) || rank < 1 || rank > 25) rank = 0;
    return {
      name: t.displayName || t.name || "",
      abbr: t.abbreviation || "",
      logo: t.logo || (t.logos && t.logos[0] && t.logos[0].href) || "",
      score: x.score == null ? "" : String(x.score),
      record: x.records && x.records[0] ? (x.records[0].summary || "") : "",
      rank: rank,
      winner: x.winner === true
    };
  };
  const st = (e.status && e.status.type) || {};
  return {
    id: String(e.id || ""),
    date: e.date || "",
    state: st.state || "",
    detail: st.shortDetail || st.detail || "",
    away: side("away"),
    home: side("home")
  };
}

function parseEspnScoreboard(d) {
  let events = d && d.events;
  if (!events && d && d.leagues && d.leagues[0]) events = d.leagues[0].events;
  return (events || []).map(parseEspnEvent).filter((g) => g.id);
}

function ymd(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
}

function liveRequests(sport) {
  const base = "/apis/site/v2/sports/" + sport.espn + "/scoreboard";
  const cfg = LIVE[sport.id] || { query: "" };
  if (cfg.days) return cfg.days.map((off) => base + "?dates=" + ymd(off) + (cfg.extra || ""));
  return [base + (cfg.query || "")];
}

function liveScreenRequest(sport) {
  const base = "/apis/site/v2/sports/" + sport.espn + "/scoreboard";
  const cfg = LIVE[sport.id] || { query: "" };
  return base + (cfg.days ? "?dates=" + ymd(0) + (cfg.extra || "") : (cfg.query || ""));
}

async function refreshLiveScreen() {
  if (current !== "live" || liveScreenBusy || document.hidden) return;
  liveScreenBusy = true;
  const leagues = SPORTS.filter((s) => s.kind === "league");
  try {
    const results = await Promise.allSettled(leagues.map((s) => espnGet(liveScreenRequest(s))));
    if (current !== "live") return;
    const live = [];
    results.forEach((r, i) => {
      if (r.status !== "fulfilled") return;
      parseEspnScoreboard(r.value).filter((g) => g.state === "in")
        .forEach((g) => live.push({ sport: leagues[i], game: g }));
    });
    if (live.length) {
      renderLiveCards(live);
      updatedEl.textContent = "Live · " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
  } finally {
    liveScreenBusy = false;
  }
}

// Data-file games, with any fresher copies from ESPN laid over them.
function mergedGames(sportId, scores) {
  const base = (scores && scores.data && scores.data.games) || [];
  const ov = overlay[sportId];
  if (!ov) return base;
  const fileMs = Date.parse(scores.updated);
  if (!isNaN(fileMs) && ov.at <= fileMs) return base; // the data file is newer, use it
  const seen = {};
  const out = base.map((g) => { seen[g.id] = true; return ov.games[g.id] || g; });
  if (ov.at > Date.now() - 10 * 60 * 1000) {
    Object.keys(ov.games).forEach((id) => { if (!seen[id]) out.push(ov.games[id]); });
  }
  return out;
}

// Worth polling when a game is in progress or starts within 15 minutes.
function anyActive(games) {
  const now = Date.now();
  return games.some((g) => {
    if (g.state === "in") return true;
    const start = Date.parse(g.date);
    return g.state === "pre" && !isNaN(start) && start - now < 15 * 60 * 1000 && start - now > -3600 * 1000;
  });
}

async function refreshLive() {
  if (detail && !detail.kind && SPORTS.some((sport) => sport.id === detail.sportId && sport.kind === "league")) {
    if (!detailRefreshBusy && !document.hidden && detail.game && detail.game.state === "in") {
      detailRefreshBusy = true;
      try { await showDetail(); } finally { detailRefreshBusy = false; }
    }
    return;
  }
  if (current === "live") { refreshLiveScreen(); return; }
  const sport = SPORTS.find((s) => s.id === current);
  if (!sport || sport.kind !== "league" || detail || liveBusy || document.hidden) return;
  const L = loaded[sport.id];
  if (!L || !L.scores || !anyActive(mergedGames(sport.id, L.scores))) return;

  liveBusy = true;
  try {
    const results = await Promise.allSettled(liveRequests(sport).map((p) => espnGet(p)));
    const good = results.filter((r) => r.status === "fulfilled");
    if (!good.length) return; // ESPN didn't answer; keep what's on screen

    const fresh = {};
    good.forEach((r) => parseEspnScoreboard(r.value).forEach((g) => { fresh[g.id] = g; }));
    overlay[sport.id] = { at: Date.now(), games: Object.assign({}, (overlay[sport.id] || {}).games, fresh) };

    if (current !== sport.id || detail) return; // you moved on while it loaded
    const box = document.getElementById("games");
    if (!box) return;
    box.innerHTML = renderGames(mergedGames(sport.id, L.scores), sport);
    updatedEl.textContent = "Live · " +
      new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  } catch (err) {
    /* ignore; the next try is 30 seconds away */
  } finally {
    liveBusy = false;
  }
}

setInterval(refreshLive, 30 * 1000);

// Refresh every 5 minutes while the app is open, and when you come back to it.
setInterval(() => { if (!document.hidden) show(); }, 5 * 60 * 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) show(); });

syncPageMenu();
show();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => { /* app still works without it */ });
  });
}
