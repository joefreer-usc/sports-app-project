"use strict";

// Each sport is a tab.
//  - "league" tabs show scores (scores file) plus standings or rankings (extra file).
//  - the F1 tab has its own layout.
const SPORTS = [
  { id: "nfl", label: "NFL", kind: "league", scores: "data/nfl.json", extra: "data/nfl_standings.json", extraType: "standings" },
  { id: "nba", label: "NBA", kind: "league", scores: "data/nba.json", extra: "data/nba_standings.json", extraType: "standings" },
  { id: "mlb", label: "MLB", kind: "league", scores: "data/mlb.json", extra: "data/mlb_standings.json", extraType: "standings" },
  { id: "cfb", label: "CFB", kind: "league", scores: "data/cfb.json", extra: "data/cfb_rankings.json", extraType: "rankings" },
  { id: "f1", label: "F1", kind: "f1", file: "data/f1.json" }
];

const view = document.getElementById("view");
const tabs = document.getElementById("tabs");
const updatedEl = document.getElementById("updated");

let current = loadTab();

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
  return SPORTS.some((s) => s.id === wanted) ? wanted : SPORTS[0].id;
}

function saveTab(id) {
  try { localStorage.setItem("sports-hub-tab", id); } catch (e) { /* ignore */ }
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
      '<div class="name">' + esc(next.name) + "</div>" +
      '<div class="when">' + esc(fmtRaceWhen(next)) + "</div>" +
      '<div class="where">' + esc(next.circuit) + " &middot; " + esc(next.location) +
      " &middot; Round " + esc(next.round) + "</div>";
  } else {
    html += '<div class="muted">No upcoming races on the schedule.</div>';
  }
  html += "</section>";

  html += '<section class="card"><h2>Driver standings</h2>';
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
  html += "</section>";

  html += '<section class="card"><h2>Constructor standings</h2>';
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
  html += "</section>";

  html += '<section class="card"><h2>Last race' +
    (last.name ? "<small>" + esc(last.name) + "</small>" : "") + "</h2>";
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

  html += '<section class="card"><details><summary>Season schedule</summary>';
  if (schedule.length) {
    html += table(
      [{ label: "Rd" }, { label: "Race" }, { label: "Date", num: true }],
      schedule.map((r) =>
        '<tr class="' + (raceStartMs(r) < now ? "past" : "") + '"><td class="pos">' + esc(r.round) +
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

function gameCard(g) {
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

  return '<div class="game">' +
    '<div class="teams">' + teamRow(away, g.state, awayWin) + teamRow(home, g.state, homeWin) + "</div>" +
    '<div class="status ' + esc(g.state) + '">' + status + "</div></div>";
}

function renderGames(games) {
  if (!games.length) {
    return '<section class="card"><h2>Scores</h2>' +
      '<div class="muted">No games to show right now.</div></section>';
  }

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
    grp.games.map(gameCard).join("") + "</section>"
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

function renderLeague(sport, scores, extra) {
  let html = "";
  if (scores) {
    html += renderGames((scores.data && scores.data.games) || []);
  } else {
    html += '<section class="card"><h2>Scores</h2><div class="muted">No scores yet.</div></section>';
  }
  if (extra) {
    html += sport.extraType === "rankings"
      ? renderRankings(extra.data)
      : renderStandings(extra.data);
  }
  return html;
}

// ---- tabs and loading -------------------------------------------------------

function renderTabs() {
  tabs.innerHTML = SPORTS.map((s) =>
    '<button type="button" data-id="' + esc(s.id) + '" class="' +
    (s.id === current ? "active" : "") + '">' + esc(s.label) + "</button>"
  ).join("");
}

tabs.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-id]");
  if (!btn) return;
  current = btn.getAttribute("data-id");
  saveTab(current);
  history.replaceState(null, "", "#" + current);
  renderTabs();
  show();
});

const NO_DATA =
  '<div class="message">No data yet. In your GitHub repo, open the Actions tab, ' +
  'choose "Update sports data", and click "Run workflow". Refresh this page after it finishes.</div>';

async function show() {
  const sport = SPORTS.find((s) => s.id === current);

  try {
    if (sport.kind === "f1") {
      const payload = await getJson(sport.file);
      if (current !== sport.id) return; // user switched tabs while loading
      view.innerHTML = renderF1(payload);
      updatedEl.textContent = payload.updated ? "Data changed " + timeAgo(payload.updated) : "";
      return;
    }

    const results = await Promise.allSettled([getJson(sport.scores), getJson(sport.extra)]);
    if (current !== sport.id) return;
    const scores = results[0].status === "fulfilled" ? results[0].value : null;
    const extra = results[1].status === "fulfilled" ? results[1].value : null;
    if (!scores && !extra) throw new Error("no data");
    view.innerHTML = renderLeague(sport, scores, extra);
    updatedEl.textContent = scores && scores.updated ? "Scores changed " + timeAgo(scores.updated) : "";
  } catch (err) {
    if (current !== sport.id) return;
    updatedEl.textContent = "";
    view.innerHTML = NO_DATA;
  }
}

// Refresh every 5 minutes while the app is open, and when you come back to it.
setInterval(() => { if (!document.hidden) show(); }, 5 * 60 * 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) show(); });

renderTabs();
show();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => { /* app still works without it */ });
  });
}
