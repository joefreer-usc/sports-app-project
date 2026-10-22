"use strict";

// Each sport is a tab.
//  - "league" tabs show scores (scores file) plus standings or rankings (extra file).
//  - the F1 tab has its own layout.
const SPORTS = [
  { id: "nfl", label: "NFL", kind: "league", espn: "football/nfl", scores: "data/nfl.json", extra: "data/nfl_standings.json", extraType: "standings" },
  { id: "nba", label: "NBA", kind: "league", espn: "basketball/nba", scores: "data/nba.json", extra: "data/nba_standings.json", extraType: "standings" },
  { id: "mlb", label: "MLB", kind: "league", espn: "baseball/mlb", scores: "data/mlb.json", extra: "data/mlb_standings.json", extraType: "standings" },
  { id: "cfb", label: "CFB", kind: "league", espn: "football/college-football", scores: "data/cfb.json", extra: "data/cfb_rankings.json", extraType: "rankings" },
  // Men's and women's college basketball share one tab with a switch at the top.
  { id: "cbb", label: "CBB", kind: "league", espn: "basketball/mens-college-basketball", scores: "data/cbb.json", extra: "data/cbb_rankings.json", extraType: "rankings", group: "cbb", side: "Men's" },
  { id: "wcbb", label: "CBB", kind: "league", espn: "basketball/womens-college-basketball", scores: "data/wcbb.json", extra: "data/wcbb_rankings.json", extraType: "rankings", group: "cbb", side: "Women's", hidden: true },
  // Premier League and Champions League share one tab with a switch at the top.
  { id: "epl", label: "FC", kind: "league", espn: "soccer/eng.1", scores: "data/epl.json", extra: "data/epl_table.json", extraType: "table", group: "fc", side: "Premier League" },
  { id: "ucl", label: "FC", kind: "league", espn: "soccer/uefa.champions", scores: "data/ucl.json", extra: "data/ucl_table.json", extraType: "table", group: "fc", side: "Champions League", hidden: true },
  { id: "golf", label: "Golf", kind: "golf", file: "data/golf.json" },
  { id: "f1", label: "F1", kind: "f1", file: "data/f1.json" }
];

const LEAGUE_TILES = [
  { id: "nfl", name: "NFL", desc: "Pro football", logo: "https://toppng.com/uploads/preview/nfl-logo-vector-1157397131993ne6xvvwg.png", color: "rgba(1, 51, 105, .28)" },
  { id: "nba", name: "NBA", desc: "Pro basketball", logo: "https://toppng.com/public/uploads/preview/nba-logo-png-download-11660557615o2yqljweyf.png", color: "rgba(200, 16, 46, .22)" },
  { id: "mlb", name: "MLB", desc: "Pro baseball", logo: "https://flyclipart.com/thumb2/major-league-baseball-logo-png-transparent-vector-55018.png", color: "rgba(0, 45, 98, .3)" },
  { id: "cfb", name: "College Football", desc: "Scores & rankings", logo: "assets/logos/cfp.png", color: "rgba(248, 88, 0, .2)" },
  { id: "cbb", name: "College Basketball", desc: "Men's & women's", logo: "assets/logos/ncaa.png", color: "rgba(76, 194, 255, .18)" },
  { id: "golf", name: "Golf", desc: "PGA leaderboard", logo: "https://www.liblogo.com/img-logo/pg7180p713-pga-tour-logo-pga-tour-scores-news-schedule-highlights-statistics-and-analysis.png", color: "rgba(42, 166, 74, .22)" },
  { id: "epl", name: "Football Club", desc: "Premier League & UCL", logo: "https://toppng.com/public/uploads/preview/premier-league-logo-vector-11573944614zjyyupnt6z.png", color: "rgba(0, 255, 133, .16)" },
  { id: "f1", name: "Formula 1", desc: "Races, drivers & laps", logo: "https://city-png.b-cdn.net/thumbnail/thumbnail_public/uploads/preview/hd-f1-the-official-formula-1-transparent-png-701751712229525ajvwddtfme.png?v=2025093023", color: "rgba(225, 6, 0, .22)" },
  { id: "nhl", name: "NHL", desc: "Pro hockey", logo: "https://image.pngaaa.com/605/7041605-middle.png", color: "rgba(160, 174, 192, .16)", disabled: true }
];

// How each league asks ESPN for live scores straight from the phone.
//  - query: one request with this query string
//  - days:  one request per day (offsets from today), plus an optional extra query
const LIVE = {
  nfl:  { query: "" },
  cfb:  { query: "?groups=80&limit=200" },
  nba:  { days: [-1, 0] },
  mlb:  { days: [-1, 0] },
  cbb:  { days: [-1, 0], extra: "&groups=50&limit=400" },
  wcbb: { days: [-1, 0], extra: "&groups=50&limit=400" },
  epl:  { days: [-1, 0] },
  ucl:  { days: [-1, 0] }
};

const view = document.getElementById("view");
const pageMenu = document.getElementById("pageMenu");
const updatedEl = document.getElementById("updated");

let current = loadTab();

// Games from the most recent scores render, so a tapped game can be looked up by id.
let gamesById = {};
// When set, the page shows one game's box score instead of the tab's usual content.
let detail = null; // { sportId, id, game }

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
  return SPORTS.some((s) => s.id === wanted) || ["home", "live", "favorites"].includes(wanted) ? wanted : "home";
}

function saveTab(id) {
  try { localStorage.setItem("sports-hub-tab", id); } catch (e) { /* ignore */ }
}

function syncPageMenu() {
  pageMenu.value = ["home", "live", "favorites"].includes(current) ? current : "";
}

function renderHome() {
  updatedEl.textContent = "";
  view.innerHTML = '<section class="home-intro"><h2>Pick your league</h2>' +
    '<p>Scores, standings and the games you care about—all in one place.</p></section>' +
    '<section class="league-grid" aria-label="Sports leagues">' + LEAGUE_TILES.map((l) =>
      '<button type="button" class="league-tile' + (l.disabled ? ' disabled' : '') + '"' +
      (l.disabled ? ' disabled' : ' data-league="' + esc(l.id) + '"') + ' style="--tile-glow:' + esc(l.color) + '">' +
      (l.disabled ? '<span class="coming">Coming soon</span>' : '') +
      '<span class="league-mark"><img class="league-logo" src="' + esc(l.logo) + '" alt="' + esc(l.name) + ' logo" loading="lazy"></span>' +
      '<span class="league-copy"><span class="league-name">' + esc(l.name) + '</span>' +
      '<span class="league-desc">' + esc(l.desc) + '</span></span>' +
      (l.disabled ? '' : '<span class="league-arrow" aria-hidden="true">&rsaquo;</span>') + '</button>'
    ).join("") + '</section>';
}

async function renderLive() {
  updatedEl.textContent = "";
  view.innerHTML = '<div class="message">Finding live games&hellip;</div>';
  const leagues = SPORTS.filter((s) => s.kind === "league" && !s.hidden);
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
    return;
  }
  view.innerHTML = '<div class="section-title"><h2><span class="live-dot"></span>Live now</h2></div>' +
    live.map((x) => '<section class="card"><h2>' + esc(x.sport.label) + '</h2>' + gameCard(x.game, false) + '</section>').join("");
}

function renderFavorites() {
  updatedEl.textContent = "";
  view.innerHTML = '<section class="empty-state"><h2>My Favorites is coming next</h2>' +
    '<p>Soon you’ll be able to follow teams and bring their games to one personal feed.</p>' +
    '<button type="button" data-go-home>Browse leagues</button></section>';
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
        '<tr><td class="pos">' + esc(r.position) + "</td><td>" + esc(r.name) +
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
        '<tr><td class="pos">' + esc(r.position) + "</td><td>" + esc(r.name) +
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
      '<tr><td class="pos">' + esc(r.position) + "</td><td>" + esc(r.name) +
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

  let html = backButton() +
    '<section class="card next-race"><div class="name">' + esc(race.name) + "</div>" +
    '<div class="when">' + esc(fmtRaceWhen(race)) + "</div>" +
    '<div class="where">' + esc(race.circuit) + " &middot; " + esc(race.location) +
    " &middot; Round " + esc(race.round) + "</div></section>";
  html += renderSessions(race) + renderTrack(race);

  const finished = raceStartMs(race) + 3 * 3600 * 1000 < Date.now();
  if (finished) {
    const file = "data/f1_race_" + (data.season || "") + "_" + String(race.round).padStart(2, "0") + ".json";
    try {
      const rd = (await getJson(file)).data || {};
      if (detail !== d) return;
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

function teamRow(t, state, isWinner) {
  const rank = t.rank > 0 ? '<span class="rank">' + esc(t.rank) + "</span> " : "";
  const rec = t.record ? " <small>" + esc(t.record) + "</small>" : "";
  const score = state === "pre" ? "" : esc(t.score);
  return '<div class="team' + (isWinner ? " win" : "") + '">' +
    '<span class="tname">' + rank + esc(t.name || t.abbr) + rec + "</span>" +
    '<span class="score">' + score + "</span></div>";
}

function gameCard(g, tappable) {
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
    ? ' class="game tap" role="button" tabindex="0" data-id="' + esc(g.id) + '"'
    : ' class="game"';

  return "<div" + attrs + ">" +
    '<div class="teams">' + teamRow(away, g.state, awayWin) + teamRow(home, g.state, homeWin) + "</div>" +
    '<div class="status ' + esc(g.state) + '">' + status + (tappable ? ' <span class="chev">&rsaquo;</span>' : "") + "</div></div>";
}

function renderGames(games) {
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

  return groups.map((grp) =>
    '<section class="card"><h2>' + esc(grp.label) + "</h2>" +
    grp.games.map((g) => gameCard(g, g.state !== "pre" && !!g.id)).join("") + "</section>"
  ).join("");
}

function renderStandings(data) {
  const groups = (data && data.groups) || [];
  if (!groups.length) return "";
  const season = data.season ? " &middot; " + esc(data.season) : "";

  const body = groups.map((grp) => {
    const teams = grp.teams || [];
    const hasPct = teams.some((t) => t.pct);
    const hasGb = teams.some((t) => t.gb && t.gb !== "-" && t.gb !== "0");
    const hasStreak = teams.some((t) => t.streak);

    const headers = [{ label: "Team" }, { label: "Record", num: true }];
    if (hasPct) headers.push({ label: "Pct", num: true });
    if (hasGb) headers.push({ label: "GB", num: true });
    if (hasStreak) headers.push({ label: "Strk", num: true });

    const rows = teams.map((t) => {
      let cells = "<td>" + esc(t.name || t.abbr) + "</td>" + '<td class="num">' + esc(t.record) + "</td>";
      if (hasPct) cells += '<td class="num">' + esc(t.pct) + "</td>";
      if (hasGb) cells += '<td class="num">' + esc(t.gb) + "</td>";
      if (hasStreak) cells += '<td class="num">' + esc(t.streak) + "</td>";
      return "<tr>" + cells + "</tr>";
    });

    return (grp.name ? "<h3>" + esc(grp.name) + "</h3>" : "") + table(headers, rows);
  }).join("");

  return '<section class="card"><details><summary>Standings' + season + "</summary>" + body + "</details></section>";
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

  return '<section class="card"><details open><summary>' + esc(data.name || "Top 25") + "</summary>" +
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
      const maxRounds = Math.min(4, Math.max.apply(null, players.map((p) => (p.rounds || []).length).concat([0])));
      const heads = [{ label: "Pos" }, { label: "Player" }, { label: "Score", num: true }, { label: "Thru", num: true }];
      for (let i = 1; i <= maxRounds; i++) heads.push({ label: "R" + i, num: true });

      const rows = players.map((p) => {
        let cells = '<td class="pos">' + esc(p.pos) + "</td><td>" + esc(p.name) +
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
    const rows = teams.map((t) =>
      '<tr><td class="pos">' + esc(t.rank || "") + "</td><td>" + esc(t.name || t.abbr) +
      (t.note ? '<span class="sub">' + esc(t.note) + "</span>" : "") + "</td>" +
      '<td class="num">' + esc(t.played) + '</td><td class="num">' + esc(t.won) +
      '</td><td class="num">' + esc(t.drawn) + '</td><td class="num">' + esc(t.lost) +
      '</td><td class="num">' + esc(t.gd) + '</td><td class="num"><b>' + esc(t.pts) + "</b></td></tr>"
    );
    return (groups.length > 1 && grp.name ? "<h3>" + esc(grp.name) + "</h3>" : "") +
      '<div class="scroll">' + table(heads, rows) + "</div>";
  }).join("");

  return '<section class="card"><details open><summary>League table' + season + "</summary>" + body + "</details></section>";
}

function renderLeague(sport, scores, extra) {
  let html = sideSwitch(sport);
  if (scores) {
    // The games sit in their own box so live updates can swap them without
    // collapsing the standings dropdown below.
    html += '<div id="games">' + renderGames((scores.data && scores.data.games) || []) + "</div>";
  } else {
    html += '<section class="card"><h2>Scores</h2><div class="muted">No scores yet.</div></section>';
  }
  if (extra) {
    if (sport.extraType === "rankings") html += renderRankings(extra.data);
    else if (sport.extraType === "table") html += renderSoccerTable(extra.data);
    else html += renderStandings(extra.data);
  }
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
function playerTable(group) {
  const labels = group.labels || [];
  const rows = [];
  (group.athletes || []).forEach((a) => {
    const stats = a.stats || [];
    if (!stats.length) return; // did not play
    const ath = a.athlete || {};
    const name = ath.shortName || ath.displayName || "";
    const pos = ath.position && ath.position.abbreviation
      ? '<span class="sub">' + esc(ath.position.abbreviation) + "</span>" : "";
    rows.push(
      "<tr><td>" + esc(name) + pos + "</td>" +
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

function renderBoxscore(data) {
  let html = renderLinescore(data);

  ((data.boxscore && data.boxscore.players) || []).forEach((tp) => {
    const teamName = tp.team ? (tp.team.displayName || tp.team.name || "") : "";
    (tp.statistics || []).forEach((group) => {
      const t = playerTable(group);
      if (!t) return;
      const title = cap(group.text || group.displayName || group.name || group.type || "Players");
      html += '<section class="card"><h2>' + esc(teamName) + "<small>" + esc(title) + "</small></h2>" + t + "</section>";
    });
  });

  html += renderTeamStats(data);

  if (!html) html = '<div class="message">No box score is available for this game yet.</div>';
  return html;
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
  const header = backButton() + '<section class="card">' + gameCard(d.game, false) + "</section>";

  if (results[1].status === "fulfilled") {
    view.innerHTML = header + renderBoxscore(results[1].value);
  } else {
    view.innerHTML = header +
      '<div class="message">Couldn\'t load the box score. It may not be available yet, or ESPN may be ' +
      "blocking requests from the browser. Try again in a minute.</div>";
  }
  view.setAttribute("data-detail", key);
}

function openGame(id) {
  const sport = SPORTS.find((s) => s.id === current);
  const game = gamesById[id];
  if (!sport || !game) return;
  detail = { sportId: sport.id, id: id, game: game };
  history.pushState({ detail: true }, "", location.href);
  window.scrollTo(0, 0);
  show();
}

function leaveDetail() {
  detail = null;
  view.removeAttribute("data-detail");
  show();
}

function goBack() {
  // Going back through history keeps the phone's back gesture and the Back button in sync.
  if (history.state && history.state.detail) history.back();
  else leaveDetail();
}

window.addEventListener("popstate", () => { if (detail) leaveDetail(); });

view.addEventListener("click", (event) => {
  const league = event.target.closest("[data-league]");
  if (league) { selectSport(league.getAttribute("data-league")); return; }
  if (event.target.closest("[data-go-home]")) { selectSport("home"); return; }
  if (event.target.closest("#back")) { goBack(); return; }
  const sw = event.target.closest("button[data-switch]");
  if (sw) { selectSport(sw.getAttribute("data-switch")); return; }
  const raceEl = event.target.closest("[data-round]");
  if (raceEl) { openRace(Number(raceEl.getAttribute("data-round"))); return; }
  const el = event.target.closest(".game[data-id]");
  if (el) openGame(el.getAttribute("data-id"));
});

// Picking a different driver in the lap-by-lap table.
view.addEventListener("change", (event) => {
  if (event.target && event.target.id === "lapDriver" && raceData) {
    document.getElementById("lapTable").innerHTML = renderLapTable(raceData, event.target.value);
  }
});

view.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const el = event.target.closest && event.target.closest(".game[data-id]");
  if (el) { event.preventDefault(); openGame(el.getAttribute("data-id")); }
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

const NO_DATA =
  '<div class="message">No data yet. In your GitHub repo, open the Actions tab, ' +
  'choose "Update sports data", and click "Run workflow". Refresh this page after it finishes.</div>';

async function show() {
  if (current === "home") { renderHome(); return; }
  if (current === "live") { await renderLive(); return; }
  if (current === "favorites") { renderFavorites(); return; }
  const sport = SPORTS.find((s) => s.id === current);

  if (detail && detail.sportId === current) {
    if (detail.kind === "race") await showRace();
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

    const results = await Promise.allSettled([getJson(sport.scores), getJson(sport.extra)]);
    if (current !== sport.id) return;
    const scores = results[0].status === "fulfilled" ? results[0].value : null;
    const extra = results[1].status === "fulfilled" ? results[1].value : null;
    if (!scores && !extra) throw new Error("no data");
    loaded[sport.id] = { scores: scores, extra: extra };
    const shown = scores ? { updated: scores.updated, data: { games: mergedGames(sport.id, scores) } } : null;
    view.innerHTML = renderLeague(sport, shown, extra);
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

function parseEspnEvent(e) {
  const comp = (e.competitions && e.competitions[0]) || {};
  const side = (which) => {
    const x = (comp.competitors || []).find((c) => c.homeAway === which);
    if (!x) return { name: "", abbr: "", score: "", record: "", rank: 0, winner: false };
    const t = x.team || {};
    let rank = parseInt(x.curatedRank && x.curatedRank.current, 10);
    if (isNaN(rank) || rank < 1 || rank > 25) rank = 0;
    return {
      name: t.displayName || t.name || "",
      abbr: t.abbreviation || "",
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
    box.innerHTML = renderGames(mergedGames(sport.id, L.scores));
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
