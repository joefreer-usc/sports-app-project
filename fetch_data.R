# fetch_data.R
# Pulls sports data from free public APIs and saves it as JSON files in the data/ folder.
# GitHub Actions runs this on a schedule; the website reads the JSON files.

library(httr2)
library(jsonlite)

dir.create("data", showWarnings = FALSE)

`%||%` <- function(a, b) if (is.null(a)) b else a

# ---- helpers ---------------------------------------------------------------

get_json <- function(url) {
  request(url) |>
    req_user_agent("sports-hub personal project") |>
    req_retry(max_tries = 3) |>
    req_perform() |>
    resp_body_json()
}

# Save data/<name>.json, but only if the data actually changed.
# This keeps your repo history from filling up with identical updates.
save_if_changed <- function(name, payload) {
  path <- file.path("data", paste0(name, ".json"))
  new_data <- fromJSON(toJSON(payload, auto_unbox = TRUE, null = "null"),
                       simplifyVector = FALSE)

  if (file.exists(path)) {
    old_data <- tryCatch(fromJSON(path, simplifyVector = FALSE)$data,
                         error = function(e) NULL)
    if (identical(old_data, new_data)) {
      message(name, ": no change")
      return(invisible(FALSE))
    }
  }

  out <- list(
    updated = format(Sys.time(), tz = "UTC", "%Y-%m-%dT%H:%M:%SZ"),
    data = new_data
  )
  write_json(out, path, auto_unbox = TRUE, pretty = TRUE, null = "null")
  message(name, ": saved")
  invisible(TRUE)
}

# Run one section. If it fails, print the error and keep the old file.
run_section <- function(name, fn) {
  tryCatch(
    save_if_changed(name, fn()),
    error = function(e) message(name, ": FAILED - ", conditionMessage(e))
  )
}

# ---- F1 (Jolpica API, no key needed) ---------------------------------------

fetch_f1 <- function() {
  base <- "https://api.jolpi.ca/ergast/f1/current"

  team_of <- function(x) {
    if (length(x) > 0) x[[1]]$name %||% "" else ""
  }

  # Driver standings
  d <- get_json(paste0(base, "/driverstandings/"))
  d_lists <- d$MRData$StandingsTable$StandingsLists
  drivers <- if (length(d_lists) > 0) {
    lapply(d_lists[[1]]$DriverStandings, function(r) list(
      position = as.integer(r$position %||% r$positionText),
      name     = paste(r$Driver$givenName, r$Driver$familyName),
      code     = r$Driver$code %||% "",
      team     = team_of(r$Constructors),
      points   = as.numeric(r$points),
      wins     = as.integer(r$wins)
    ))
  } else list()

  # Constructor standings
  c <- get_json(paste0(base, "/constructorstandings/"))
  c_lists <- c$MRData$StandingsTable$StandingsLists
  constructors <- if (length(c_lists) > 0) {
    lapply(c_lists[[1]]$ConstructorStandings, function(r) list(
      position = as.integer(r$position %||% r$positionText),
      name     = r$Constructor$name,
      points   = as.numeric(r$points),
      wins     = as.integer(r$wins)
    ))
  } else list()

  # Season schedule
  s <- get_json(paste0(base, "/"))
  schedule <- lapply(s$MRData$RaceTable$Races, function(r) list(
    round    = as.integer(r$round),
    name     = r$raceName,
    circuit  = r$Circuit$circuitName,
    location = paste(r$Circuit$Location$locality, r$Circuit$Location$country, sep = ", "),
    date     = r$date,
    time     = r$time %||% ""
  ))

  # Most recent race result
  l <- get_json(paste0(base, "/last/results/"))
  races <- l$MRData$RaceTable$Races
  last_race <- if (length(races) > 0) {
    race <- races[[1]]
    list(
      name = race$raceName,
      date = race$date,
      results = lapply(race$Results, function(r) list(
        position = as.integer(r$position),
        name     = paste(r$Driver$givenName, r$Driver$familyName),
        team     = r$Constructor$name %||% "",
        points   = as.numeric(r$points),
        result   = r$Time$time %||% r$status %||% ""
      ))
    )
  } else list(name = "", date = "", results = list())

  list(
    drivers = drivers,
    constructors = constructors,
    schedule = schedule,
    lastRace = last_race
  )
}

run_section("f1", fetch_f1)

# ---- ESPN (NFL, NBA, MLB, college football; unofficial API, no key) --------

espn_site <- "https://site.api.espn.com/apis/site/v2/sports/"
espn_v2   <- "https://site.api.espn.com/apis/v2/sports/"

# One game -> a small, flat record the website can display.
parse_event <- function(e) {
  comp <- e$competitions[[1]]

  side <- function(which) {
    cs <- Filter(function(x) identical(x$homeAway, which), comp$competitors)
    if (length(cs) == 0) {
      return(list(name = "", abbr = "", score = "", record = "", rank = 0L, winner = FALSE))
    }
    x <- cs[[1]]
    rec <- if (length(x$records) > 0) x$records[[1]]$summary %||% "" else ""
    rank <- suppressWarnings(as.integer(x$curatedRank$current %||% 0))
    if (is.na(rank) || rank < 1 || rank > 25) rank <- 0L
    list(
      name   = x$team$displayName %||% x$team$name %||% "",
      abbr   = x$team$abbreviation %||% "",
      score  = as.character(x$score %||% ""),
      record = rec,
      rank   = rank,
      winner = isTRUE(x$winner)
    )
  }

  list(
    id     = as.character(e$id %||% ""),
    date   = e$date %||% "",
    state  = e$status$type$state %||% "",
    detail = e$status$type$shortDetail %||% e$status$type$detail %||% "",
    away   = side("away"),
    home   = side("home")
  )
}

fetch_scores <- function(sport_path, query = "") {
  get_games <- function(q) {
    d <- get_json(paste0(espn_site, sport_path, "/scoreboard", q))
    events <- d$events
    if (is.null(events) && length(d$leagues) > 0) events <- d$leagues[[1]]$events
    games <- lapply(events %||% list(), function(e) {
      tryCatch(parse_event(e), error = function(err) NULL)
    })
    Filter(Negate(is.null), games)
  }

  games <- get_games(query)
  # If a filtered request comes back empty, fall back to the plain scoreboard.
  if (length(games) == 0 && nzchar(query) && !grepl("dates=", query, fixed = TRUE)) {
    games <- get_games("")
  }
  list(games = games)
}

# Standings: ESPN nests teams under conferences / divisions, so walk the tree.
stat_of <- function(stats, nm) {
  for (s in stats) if (identical(s$name, nm)) return(s)
  NULL
}

parse_entry <- function(en) {
  st <- en$stats %||% list()
  w <- stat_of(st, "wins")
  l <- stat_of(st, "losses")
  t <- stat_of(st, "ties")
  overall <- stat_of(st, "overall")
  pct <- stat_of(st, "winPercent")
  gb <- stat_of(st, "gamesBehind")
  strk <- stat_of(st, "streak")

  record <- if (!is.null(overall)) {
    overall$displayValue %||% overall$summary %||% ""
  } else if (!is.null(w) && !is.null(l)) {
    r <- paste(w$displayValue, l$displayValue, sep = "-")
    if (!is.null(t) && !identical(t$displayValue, "0")) r <- paste(r, t$displayValue, sep = "-")
    r
  } else ""

  list(
    name   = en$team$displayName %||% en$team$name %||% "",
    abbr   = en$team$abbreviation %||% "",
    record = record,
    pct    = pct$displayValue %||% "",
    gb     = gb$displayValue %||% "",
    streak = strk$displayValue %||% "",
    sort   = as.numeric(pct$value %||% 0)
  )
}

collect_groups <- function(node) {
  groups <- list()
  entries <- node$standings$entries
  if (length(entries) > 0) {
    teams <- lapply(entries, parse_entry)
    teams <- teams[order(-vapply(teams, function(x) x$sort, numeric(1)))]
    teams <- lapply(teams, function(x) { x$sort <- NULL; x })
    groups[[length(groups) + 1]] <- list(name = node$name %||% "", teams = teams)
  }
  for (ch in node$children %||% list()) groups <- c(groups, collect_groups(ch))
  groups
}

fetch_standings <- function(sport_path) {
  d <- get_json(paste0(espn_v2, sport_path, "/standings"))
  season <- tryCatch(d$children[[1]]$standings$seasonDisplayName, error = function(e) NULL)
  list(season = season %||% "", groups = collect_groups(d))
}

# College football: the AP Top 25 poll.
fetch_cfb_rankings <- function() {
  d <- get_json(paste0(espn_site, "football/college-football/rankings"))
  polls <- d$rankings
  if (length(polls) == 0) return(list(name = "", teams = list()))
  p <- polls[[1]]
  list(
    name = p$name %||% "Top 25",
    teams = lapply(p$ranks, function(r) list(
      rank     = as.integer(r$current %||% 0),
      previous = as.integer(r$previous %||% 0),
      name     = r$team$location %||% r$team$nickname %||% "",
      abbr     = r$team$abbreviation %||% "",
      record   = r$recordSummary %||% ""
    ))
  )
}

# NBA and MLB play almost every day, so ask for yesterday through two days ahead.
# NFL and college football default to the current week.
today <- Sys.Date()
day_range <- paste0("?dates=", format(today - 1, "%Y%m%d"), "-", format(today + 2, "%Y%m%d"))

run_section("nfl",           function() fetch_scores("football/nfl"))
run_section("nfl_standings", function() fetch_standings("football/nfl"))

run_section("nba",           function() fetch_scores("basketball/nba", day_range))
run_section("nba_standings", function() fetch_standings("basketball/nba"))

run_section("mlb",           function() fetch_scores("baseball/mlb", day_range))
run_section("mlb_standings", function() fetch_standings("baseball/mlb"))

run_section("cfb",           function() fetch_scores("football/college-football", "?groups=80&limit=200"))
run_section("cfb_rankings",  fetch_cfb_rankings)
