"use strict";

// Each sport is a tab. A sport with a `render` function shows real data;
// the others show a "coming soon" note until we add them.
const SPORTS = [
  { id: "f1", label: "F1", file: "data/f1.json", render: renderF1 },
  { id: "nfl", label: "NFL" },
  { id: "nba", label: "NBA" },
  { id: "mlb", label: "MLB" },
  { id: "cfb", label: "CFB" }
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

function startMs(race) {
  const time = race.time || "00:00:00Z";
  return Date.parse(race.date + "T" + time);
}

function fmtWhen(race) {
  const ms = startMs(race);
  if (isNaN(ms)) return race.date || "";
  const opts = race.time
    ? { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { weekday: "short", month: "short", day: "numeric" };
  return new Date(ms).toLocaleString([], opts);
}

function fmtShortDate(race) {
  const ms = startMs(race);
  if (isNaN(ms)) return race.date || "";
  return new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });
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

// ---- F1 ---------------------------------------------------------------------

function renderF1(payload) {
  const d = payload.data || {};
  const drivers = d.drivers || [];
  const constructors = d.constructors || [];
  const schedule = d.schedule || [];
  const last = d.lastRace || { results: [] };

  const now = Date.now();
  const next = schedule.find((r) => startMs(r) > now);

  let html = "";

  html += '<section class="card next-race"><h2>Next race</h2>';
  if (next) {
    html +=
      '<div class="name">' + esc(next.name) + "</div>" +
      '<div class="when">' + esc(fmtWhen(next)) + "</div>" +
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
        '<tr class="' + (startMs(r) < now ? "past" : "") + '"><td class="pos">' + esc(r.round) +
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

async function show() {
  const sport = SPORTS.find((s) => s.id === current);
  updatedEl.textContent = "";

  if (!sport.render) {
    view.innerHTML = '<div class="message">' + esc(sport.label) + " is coming soon.</div>";
    return;
  }

  try {
    const res = await fetch(sport.file + "?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const payload = await res.json();
    if (current !== sport.id) return; // user switched tabs while loading
    view.innerHTML = sport.render(payload);
    updatedEl.textContent = payload.updated ? "Data changed " + timeAgo(payload.updated) : "";
  } catch (err) {
    if (current !== sport.id) return;
    view.innerHTML =
      '<div class="message">No data yet. In your GitHub repo, open the Actions tab, ' +
      'choose "Update sports data", and click "Run workflow". Refresh this page after it finishes.</div>';
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
