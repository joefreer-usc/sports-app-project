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

  flag_code <- function(nationality) {
    codes <- c(
      British="gb", Dutch="nl", Monegasque="mc", Australian="au", Spanish="es",
      Mexican="mx", Canadian="ca", German="de", French="fr", Italian="it",
      Japanese="jp", Thai="th", Chinese="cn", `New Zealander`="nz", American="us",
      Brazilian="br", Finnish="fi", Danish="dk", Belgian="be", Argentine="ar",
      Polish="pl", Russian="ru", Austrian="at", Swiss="ch", Swedish="se"
    )
    code <- unname(codes[nationality])
    if (length(code) == 0 || is.na(code)) "" else code
  }

  team_of <- function(x) {
    if (length(x) > 0) x[[1]]$name %||% "" else ""
  }

  # Driver standings
  d <- get_json(paste0(base, "/driverstandings/"))
  d_lists <- d$MRData$StandingsTable$StandingsLists
  drivers <- if (length(d_lists) > 0) {
    lapply(d_lists[[1]]$DriverStandings, function(r) list(
      position = as.integer(r$position %||% r$positionText),
      driverId = r$Driver$driverId %||% "",
      name     = paste(r$Driver$givenName, r$Driver$familyName),
      code     = r$Driver$code %||% "",
      number   = r$Driver$permanentNumber %||% "",
      nationality = r$Driver$nationality %||% "",
      flagCode = flag_code(r$Driver$nationality %||% ""),
      dateOfBirth = r$Driver$dateOfBirth %||% "",
      profileUrl = r$Driver$url %||% "",
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

  # Season schedule (includes practice, qualifying and sprint session times)
  s <- get_json(paste0(base, "/"))
  season <- s$MRData$RaceTable$season %||% ""

  session_names <- list(
    FirstPractice    = "Practice 1",
    SecondPractice   = "Practice 2",
    ThirdPractice    = "Practice 3",
    SprintQualifying = "Sprint Qualifying",
    Sprint           = "Sprint",
    Qualifying       = "Qualifying"
  )
  sessions_of <- function(r) {
    out <- list()
    for (key in names(session_names)) {
      x <- r[[key]]
      if (!is.null(x)) {
        out[[length(out) + 1]] <- list(
          name = session_names[[key]],
          date = x$date %||% "",
          time = x$time %||% ""
        )
      }
    }
    out
  }

  # Track layout pictures come from OpenF1's list of race weekends.
  # If that request fails, the pictures are simply left out.
  meetings <- tryCatch(
    get_json(paste0("https://api.openf1.org/v1/meetings?year=", season)),
    error = function(e) { message("  openf1 meetings: ", conditionMessage(e)); list() }
  )
  image_for <- function(race_date) {
    day <- as.Date(race_date)
    for (m in meetings) {
      from <- as.Date(substr(m$date_start %||% "", 1, 10))
      to   <- as.Date(substr(m$date_end %||% "", 1, 10))
      if (!is.na(day) && !is.na(from) && !is.na(to) && day >= from && day <= to) {
        return(m$circuit_image %||% "")
      }
    }
    ""
  }

  schedule <- lapply(s$MRData$RaceTable$Races, function(r) list(
    round      = as.integer(r$round),
    name       = r$raceName,
    circuit    = r$Circuit$circuitName,
    circuitUrl = r$Circuit$url %||% "",
    location   = paste(r$Circuit$Location$locality, r$Circuit$Location$country, sep = ", "),
    date       = r$date,
    time       = r$time %||% "",
    sessions   = sessions_of(r),
    image      = image_for(r$date)
  ))

  # Current official-style driver headshots and team colors from OpenF1.
  open_drivers <- tryCatch(
    get_json("https://api.openf1.org/v1/drivers?session_key=latest"),
    error = function(e) { message("  openf1 drivers: ", conditionMessage(e)); list() }
  )
  if (length(open_drivers) > 0 && length(drivers) > 0) {
    for (i in seq_along(drivers)) {
      code <- toupper(drivers[[i]]$code %||% "")
      number <- as.character(drivers[[i]]$number %||% "")
      matches <- Filter(function(x) {
        identical(toupper(x$name_acronym %||% ""), code) ||
          (nzchar(number) && identical(as.character(x$driver_number %||% ""), number))
      }, open_drivers)
      if (length(matches) > 0) {
        photo <- matches[[1]]
        drivers[[i]]$headshot <- gsub("/1col/", "/6col/", photo$headshot_url %||% "", fixed = TRUE)
        drivers[[i]]$teamColor <- photo$team_colour %||% ""
      } else {
        drivers[[i]]$headshot <- ""
        drivers[[i]]$teamColor <- ""
      }
    }
  }

  # Jolpica caps this feed at 100 driver-results (roughly five races), so walk
  # every page and merge races that happen to span a page boundary.
  all_races_by_round <- list()
  offset <- 0L
  total <- 1L
  while (offset < total && offset < 5000L) {
    page <- tryCatch(
      get_json(paste0(base, "/results/?limit=100&offset=", offset)),
      error = function(e) { message("  f1 season results: ", conditionMessage(e)); NULL }
    )
    if (is.null(page)) break
    total <- as.integer(page$MRData$total %||% 0)
    for (race in page$MRData$RaceTable$Races %||% list()) {
      key <- as.character(race$round %||% length(all_races_by_round) + 1L)
      if (is.null(all_races_by_round[[key]])) {
        all_races_by_round[[key]] <- race
      } else {
        all_races_by_round[[key]]$Results <- c(all_races_by_round[[key]]$Results %||% list(),
                                               race$Results %||% list())
      }
    }
    offset <- offset + 100L
    if (offset < total) Sys.sleep(0.2)
  }
  all_races <- unname(all_races_by_round)
  driver_results <- list()
  for (race in all_races) {
    for (r in race$Results %||% list()) {
      id <- r$Driver$driverId %||% ""
      if (!nzchar(id)) next
      entry <- list(
        round = as.integer(race$round %||% 0),
        race = race$raceName %||% "",
        date = race$date %||% "",
        position = as.integer(r$position %||% 0),
        grid = as.integer(r$grid %||% 0),
        team = r$Constructor$name %||% "",
        result = r$Time$time %||% r$status %||% "",
        points = as.numeric(r$points %||% 0)
      )
      driver_results[[id]] <- c(driver_results[[id]] %||% list(), list(entry))
    }
  }

  # Most recent race result
  l <- get_json(paste0(base, "/last/results/"))
  races <- l$MRData$RaceTable$Races
  last_race <- if (length(races) > 0) {
    race <- races[[1]]
    list(
      round = as.integer(race$round %||% 0),
      name = race$raceName,
      date = race$date,
      results = lapply(race$Results, function(r) list(
        position = as.integer(r$position),
        driverId = r$Driver$driverId %||% "",
        name     = paste(r$Driver$givenName, r$Driver$familyName),
        nationality = r$Driver$nationality %||% "",
        flagCode = flag_code(r$Driver$nationality %||% ""),
        team     = r$Constructor$name %||% "",
        points   = as.numeric(r$points),
        result   = r$Time$time %||% r$status %||% ""
      ))
    )
  } else list(round = 0L, name = "", date = "", results = list())

  list(
    season = season,
    drivers = drivers,
    constructors = constructors,
    schedule = schedule,
    lastRace = last_race,
    driverResults = driver_results
  )
}

run_section("f1", fetch_f1)

# ---- F1 per-race results and lap times --------------------------------------
# Finished races never change, so each one is saved once to its own file
# (data/f1_race_<season>_<round>.json). To stay polite to the free API, at most
# 3 new races are fetched per run, newest first, so older races fill in over time.

fetch_race_detail <- function(season, round, race_name, race_date) {
  base <- paste0("https://api.jolpi.ca/ergast/f1/", season, "/", round)

  res <- get_json(paste0(base, "/results/?limit=100"))
  rr <- res$MRData$RaceTable$Races
  if (length(rr) == 0) return(NULL)

  results <- lapply(rr[[1]]$Results, function(r) list(
    position = as.integer(r$position %||% 0),
    driverId = r$Driver$driverId %||% "",
    code     = r$Driver$code %||% "",
    name     = paste(r$Driver$givenName, r$Driver$familyName),
    nationality = r$Driver$nationality %||% "",
    team     = r$Constructor$name %||% "",
    grid     = as.integer(r$grid %||% 0),
    laps     = as.integer(r$laps %||% 0),
    result   = r$Time$time %||% r$status %||% "",
    points   = as.numeric(r$points %||% 0)
  ))

  # Lap timings come 100 at a time.
  pages <- list()
  offset <- 0
  total <- 1
  while (offset < total && length(pages) < 30) {
    Sys.sleep(0.3)
    d <- get_json(paste0(base, "/laps/?limit=100&offset=", offset))
    total <- as.integer(d$MRData$total %||% 0)
    pages[[length(pages) + 1]] <- d
    offset <- offset + 100
  }

  lap_no <- integer(0)
  drv <- character(0)
  tm <- character(0)
  ps <- integer(0)
  for (d in pages) {
    races <- d$MRData$RaceTable$Races
    if (length(races) == 0) next
    for (lp in races[[1]]$Laps) {
      n <- as.integer(lp$number)
      for (t in lp$Timings) {
        lap_no <- c(lap_no, n)
        drv <- c(drv, t$driverId %||% "")
        tm <- c(tm, t$time %||% "")
        ps <- c(ps, as.integer(t$position %||% 0))
      }
    }
  }

  # One entry per driver, in finishing order, with a time for each lap they completed.
  laps <- list()
  for (r in results) {
    idx <- which(drv == r$driverId)
    if (length(idx) == 0) next
    last_lap <- max(lap_no[idx])
    times <- rep("", last_lap)
    pos <- rep(0L, last_lap)
    times[lap_no[idx]] <- tm[idx]
    pos[lap_no[idx]] <- ps[idx]
    laps[[length(laps) + 1]] <- list(
      driverId  = r$driverId,
      code      = r$code,
      name      = r$name,
      times     = as.list(times),
      positions = as.list(pos)
    )
  }

  list(
    season = season,
    round = as.integer(round),
    name = race_name,
    date = race_date,
    results = results,
    laps = laps
  )
}

fetch_race_files <- function(max_new = 3) {
  f1 <- fromJSON("data/f1.json", simplifyVector = FALSE)$data
  season <- f1$season
  if (is.null(season) || !nzchar(season)) return(invisible())

  tried <- 0
  for (race in rev(f1$schedule)) {
    if (tried >= max_new) break

    clock <- if (nzchar(race$time %||% "")) sub("Z$", "", race$time) else "00:00:00"
    start <- as.POSIXct(paste(race$date, clock), tz = "UTC", format = "%Y-%m-%d %H:%M:%S")
    if (is.na(start) || Sys.time() < start + 3 * 3600) next   # not finished yet

    name <- sprintf("f1_race_%s_%02d", season, race$round)
    if (file.exists(file.path("data", paste0(name, ".json")))) next

    tried <- tried + 1
    tryCatch({
      payload <- fetch_race_detail(season, race$round, race$name, race$date)
      if (is.null(payload)) {
        message(name, ": no results yet")
      } else if (length(payload$laps) == 0 && Sys.time() < start + 48 * 3600) {
        # Lap data can arrive a little after the race, so try again next time.
        message(name, ": lap times not available yet")
      } else {
        save_if_changed(name, payload)
      }
    }, error = function(e) message(name, ": FAILED - ", conditionMessage(e)))
  }
}

tryCatch(fetch_race_files(), error = function(e) message("f1 race files: FAILED - ", conditionMessage(e)))

# ---- ESPN (NFL, NBA, MLB, college football; unofficial API, no key) --------

espn_site <- "https://site.api.espn.com/apis/site/v2/sports/"
espn_v2   <- "https://site.api.espn.com/apis/v2/sports/"

# One game -> a small, flat record the website can display.
parse_event <- function(e) {
  comp <- e$competitions[[1]]

  side <- function(which) {
    cs <- Filter(function(x) identical(x$homeAway, which), comp$competitors)
    if (length(cs) == 0) {
      return(list(name = "", abbr = "", logo = "", score = "", record = "", rank = 0L, winner = FALSE))
    }
    x <- cs[[1]]
    rec <- if (length(x$records) > 0) x$records[[1]]$summary %||% "" else ""
    rank <- suppressWarnings(as.integer(x$curatedRank$current %||% 0))
    if (is.na(rank) || rank < 1 || rank > 25) rank <- 0L
    logos <- x$team$logos %||% list()
    logo <- x$team$logo %||% ""
    if (!nzchar(logo) && length(logos) > 0) logo <- logos[[1]]$href %||% ""
    list(
      name   = x$team$displayName %||% x$team$name %||% "",
      abbr   = x$team$abbreviation %||% "",
      logo   = logo,
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

fetch_scores <- function(sport_path, query = "", offsets = NULL, extra = "") {
  get_games <- function(q) {
    d <- get_json(paste0(espn_site, sport_path, "/scoreboard", q))
    events <- d$events
    if (is.null(events) && length(d$leagues) > 0) events <- d$leagues[[1]]$events
    games <- lapply(events %||% list(), function(e) {
      tryCatch(parse_event(e), error = function(err) NULL)
    })
    Filter(Negate(is.null), games)
  }

  # Daily sports (NBA, MLB): ask for one day at a time, e.g. offsets c(-1, 0, 1, 2)
  # means yesterday through two days ahead. ESPN rejects a range in a single request.
  if (!is.null(offsets)) {
    all_games <- list()
    ok <- 0
    for (off in offsets) {
      q <- paste0("?dates=", format(Sys.Date() + off, "%Y%m%d"), extra)
      g <- tryCatch({
        r <- get_games(q)
        ok <- ok + 1
        r
      }, error = function(e) {
        message("  ", sport_path, " ", q, ": ", conditionMessage(e))
        list()
      })
      all_games <- c(all_games, g)
    }
    if (ok == 0) stop("every day request failed")
    # Offseason or no games in this window: ask for ESPN's default day, which is
    # the next day with games, so the tab shows what's coming up.
    if (length(all_games) == 0) {
      all_games <- tryCatch(
        get_games(if (nzchar(extra)) paste0("?", sub("^&", "", extra)) else ""),
        error = function(e) list()
      )
    }
    ids <- vapply(all_games, function(x) x$id, character(1))
    return(list(games = all_games[!duplicated(ids)]))
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

collect_groups <- function(node, skip_parents = FALSE) {
  groups <- list()
  entries <- node$standings$entries
  # With division-level standings, a conference can also carry its own team list;
  # skip it so each team only appears once, under its division.
  if (skip_parents && length(node$children %||% list()) > 0) entries <- NULL
  if (length(entries) > 0) {
    teams <- lapply(entries, parse_entry)
    teams <- teams[order(-vapply(teams, function(x) x$sort, numeric(1)))]
    teams <- lapply(teams, function(x) { x$sort <- NULL; x })
    groups[[length(groups) + 1]] <- list(name = node$name %||% "", teams = teams)
  }
  for (ch in node$children %||% list()) groups <- c(groups, collect_groups(ch, skip_parents))
  groups
}

# level = 3 asks ESPN for divisions (AFC East, NFC North, ...) instead of whole conferences.
fetch_standings <- function(sport_path, level = NULL) {
  q <- if (is.null(level)) "" else paste0("?level=", level)
  d <- get_json(paste0(espn_v2, sport_path, "/standings", q))
  season <- tryCatch(d$children[[1]]$standings$seasonDisplayName, error = function(e) NULL) %||%
    tryCatch(d$children[[1]]$children[[1]]$standings$seasonDisplayName, error = function(e) NULL) %||%
    tryCatch(as.character(d$children[[1]]$children[[1]]$standings$season), error = function(e) NULL)
  list(season = season %||% "", groups = collect_groups(d, skip_parents = !is.null(level)))
}

# College football and basketball: the AP Top 25 poll.
fetch_rankings <- function(sport_path) {
  d <- get_json(paste0(espn_site, sport_path, "/rankings"))
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
day_offsets <- c(-1, 0, 1, 2)

run_section("nfl",           function() fetch_scores("football/nfl"))
run_section("nfl_standings", function() fetch_standings("football/nfl", level = 3))

run_section("nba",           function() fetch_scores("basketball/nba", offsets = day_offsets))
run_section("nba_standings", function() fetch_standings("basketball/nba"))

run_section("mlb",           function() fetch_scores("baseball/mlb", offsets = day_offsets))
run_section("mlb_standings", function() fetch_standings("baseball/mlb", level = 3))

run_section("cfb",           function() fetch_scores("football/college-football", "?groups=80&limit=200"))
run_section("cfb_rankings",  function() fetch_rankings("football/college-football"))

# College basketball (men's and women's): Division I games only, one day at a time.
# Before the season starts this falls back to the first day with games.
cbb_extra <- "&groups=50&limit=400"

run_section("cbb",           function() fetch_scores("basketball/mens-college-basketball", offsets = day_offsets, extra = cbb_extra))
run_section("cbb_rankings",  function() fetch_rankings("basketball/mens-college-basketball"))

run_section("wcbb",          function() fetch_scores("basketball/womens-college-basketball", offsets = day_offsets, extra = cbb_extra))
run_section("wcbb_rankings", function() fetch_rankings("basketball/womens-college-basketball"))

# ---- Soccer: Premier League and Champions League (ESPN, no key) -------------
# Matches are spread out (weekends plus a few midweek nights), so look at the
# last 3 days and the next 4, one day at a time.

soccer_stat <- function(stats, nm) {
  s <- stat_of(stats, nm)
  if (is.null(s)) return("")
  as.character(s$displayValue %||% s$value %||% "")
}

parse_soccer_entry <- function(en) {
  st <- en$stats %||% list()
  rank <- suppressWarnings(as.integer(soccer_stat(st, "rank")))
  if (length(rank) == 0 || is.na(rank)) rank <- 0L
  list(
    rank   = rank,
    name   = en$team$displayName %||% en$team$name %||% "",
    abbr   = en$team$abbreviation %||% "",
    logo   = {
      direct <- en$team$logo %||% ""
      logos <- en$team$logos %||% list()
      if (nzchar(direct)) direct else if (length(logos) > 0) logos[[1]]$href %||% "" else ""
    },
    played = soccer_stat(st, "gamesPlayed"),
    won    = soccer_stat(st, "wins"),
    drawn  = soccer_stat(st, "ties"),
    lost   = soccer_stat(st, "losses"),
    gd     = soccer_stat(st, "pointDifferential"),
    pts    = soccer_stat(st, "points"),
    note   = en$note$description %||% ""
  )
}

collect_soccer_groups <- function(node) {
  groups <- list()
  entries <- node$standings$entries
  if (length(entries) > 0) {
    teams <- lapply(entries, parse_soccer_entry)
    ord <- order(vapply(teams, function(x) if (x$rank > 0) x$rank else 999L, integer(1)))
    groups[[length(groups) + 1]] <- list(name = node$name %||% "", teams = teams[ord])
  }
  for (ch in node$children %||% list()) groups <- c(groups, collect_soccer_groups(ch))
  groups
}

fetch_soccer_table <- function(sport_path) {
  d <- get_json(paste0(espn_v2, sport_path, "/standings"))
  season <- tryCatch(d$children[[1]]$standings$seasonDisplayName, error = function(e) NULL) %||%
    tryCatch(d$children[[1]]$name, error = function(e) NULL)
  list(season = season %||% "", groups = collect_soccer_groups(d))
}

soccer_offsets <- -3:4

run_section("epl",       function() fetch_scores("soccer/eng.1", offsets = soccer_offsets))
run_section("epl_table", function() fetch_soccer_table("soccer/eng.1"))

run_section("ucl",       function() fetch_scores("soccer/uefa.champions", offsets = soccer_offsets))
run_section("ucl_table", function() fetch_soccer_table("soccer/uefa.champions"))

run_section("laliga",       function() fetch_scores("soccer/esp.1", offsets = soccer_offsets))
run_section("laliga_table", function() fetch_soccer_table("soccer/esp.1"))

# ---- PGA Tour golf (ESPN, no key) --------------------------------------------
# Shows the current (or next) tournament's leaderboard plus the season schedule.

fetch_golf <- function() {
  sb <- get_json(paste0(espn_site, "golf/pga/scoreboard"))

  cal <- sb$leagues[[1]]$calendar %||% list()
  schedule <- lapply(cal, function(c) list(
    id    = as.character(c$id %||% ""),
    name  = c$label %||% "",
    start = c$startDate %||% "",
    end   = c$endDate %||% ""
  ))

  if (length(sb$events) == 0) return(list(event = NULL, players = list(), schedule = schedule))

  ev <- sb$events[[1]]
  comp <- ev$competitions[[1]]
  event <- list(
    id     = as.character(ev$id %||% ""),
    name   = ev$name %||% ev$shortName %||% "",
    start  = ev$date %||% "",
    end    = ev$endDate %||% "",
    state  = ev$status$type$state %||% "",
    detail = comp$status$type$detail %||% ev$status$type$description %||% "",
    round  = as.integer(comp$status$period %||% 0),
    season = as.integer(ev$season$year %||% sb$season$year %||% as.integer(format(Sys.Date(), "%Y")))
  )

  # The scoreboard has no players until a tournament is close to starting, and the
  # leaderboard address below has them, so try that first and keep the other as a backup.
  lb <- tryCatch(
    get_json(paste0("https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga&event=", event$id)),
    error = function(e) { message("  golf leaderboard: ", conditionMessage(e)); NULL }
  )
  comps <- lb$events[[1]]$competitions[[1]]$competitors %||% comp$competitors %||% list()

  to_par <- function(x) {
    for (s in x$statistics %||% list()) {
      if (identical(s$name, "scoreToPar")) return(as.character(s$displayValue %||% ""))
    }
    sc <- x$score
    if (is.list(sc)) as.character(sc$displayValue %||% "") else as.character(sc %||% "")
  }

  headshot_url <- function(athlete) {
    image <- athlete$headshot %||% ""
    if (is.list(image)) as.character(image$href %||% "") else as.character(image)
  }

  players <- lapply(comps, function(x) list(
    id      = as.character(x$athlete$id %||% x$id %||% ""),
    pos     = x$status$position$displayName %||% "",
    name    = x$athlete$displayName %||% x$athlete$shortName %||% "",
    country = x$athlete$flag$alt %||% "",
    headshot = headshot_url(x$athlete),
    status  = x$status$type$shortDetail %||% x$status$type$description %||% x$status$displayValue %||% "",
    toPar   = to_par(x),
    thru    = x$status$displayValue %||% "",
    rounds  = lapply(x$linescores %||% list(), function(l) as.character(l$displayValue %||% "")),
    order   = as.integer(x$sortOrder %||% 9999)
  ))
  if (length(players) > 1) {
    players <- players[order(vapply(players, function(p) p$order, integer(1)))]
  }
  players <- lapply(players, function(p) { p$order <- NULL; p })

  # Estimate the round-two cut from the 65th-place two-round score (ties stay
  # together). Some events use different/no-cut rules, so this is explicitly
  # labelled projected until ESPN marks players as CUT.
  cut_line <- ""
  cut_official <- any(vapply(players, function(p) grepl("cut", p$status, ignore.case = TRUE), logical(1)))
  if (event$round >= 2L) {
    score_number <- function(value) {
      value <- trimws(as.character(value %||% ""))
      if (!nzchar(value)) return(NA_real_)
      if (toupper(value) %in% c("E", "EVEN")) return(0)
      suppressWarnings(as.numeric(gsub("\\+", "", value)))
    }
    two_round <- vapply(players, function(p) length(p$rounds) >= 2L, logical(1))
    scores <- vapply(players[two_round], function(p) score_number(p$toPar), numeric(1))
    scores <- sort(scores[is.finite(scores)])
    if (length(scores) >= 65L) {
      value <- scores[[65L]]
      cut_line <- if (value == 0) "E" else if (value > 0) paste0("+", value) else as.character(value)
    }
  }
  event$cutLine <- cut_line
  event$cutOfficial <- cut_official

  list(event = event, players = players, schedule = schedule)
}

run_section("golf", fetch_golf)

# ---- NFL team pages --------------------------------------------------------
# Browsers can be blocked from reading some ESPN team endpoints directly.
# Build one local cache for all 32 teams instead. It refreshes twice per day,
# rather than on every five-minute score update, to keep requests reasonable.

nfl_team_cache_is_fresh <- function(hours = 12) {
  path <- file.path("data", "nfl_teams.json")
  if (!file.exists(path)) return(FALSE)
  stamp <- tryCatch(fromJSON(path, simplifyVector = FALSE)$updated, error = function(e) NULL)
  if (is.null(stamp)) return(FALSE)
  then <- as.POSIXct(stamp, format = "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
  !is.na(then) && as.numeric(difftime(Sys.time(), then, units = "hours")) < hours
}

fetch_nfl_team_cache <- function() {
  if (nfl_team_cache_is_fresh()) {
    message("nfl_teams: cache is still fresh")
    return(invisible(FALSE))
  }

  safe_json <- function(url) {
    tryCatch(get_json(url), error = function(e) {
      message("  nfl team request failed: ", conditionMessage(e))
      NULL
    })
  }

  index <- get_json(paste0(espn_site, "football/nfl/teams?limit=50"))
  wrappers <- index$sports[[1]]$leagues[[1]]$teams %||% list()
  season <- as.integer(format(Sys.Date(), "%Y"))
  if (as.integer(format(Sys.Date(), "%m")) < 3) season <- season - 1L
  teams_out <- list()

  for (wrapper in wrappers) {
    team <- wrapper$team %||% wrapper
    id <- as.character(team$id %||% "")
    abbr <- toupper(team$abbreviation %||% "")
    if (!nzchar(id) || !nzchar(abbr)) next
    message("  nfl team page: ", abbr)

    schedule <- safe_json(paste0(espn_site, "football/nfl/teams/", id,
                                 "/schedule?season=", season))
    stats <- safe_json(paste0("https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/",
                              season, "/types/2/teams/", id, "/statistics"))
    depth <- safe_json(paste0("https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/",
                              season, "/teams/", id, "/depthcharts"))
    roster <- safe_json(paste0(espn_site, "football/nfl/teams/", id, "/roster"))

    if (!is.null(schedule$team)) {
      team$recordSummary <- schedule$team$recordSummary %||% ""
      team$standingSummary <- schedule$team$standingSummary %||% team$standingSummary %||% ""
      team$logo <- schedule$team$logo %||% team$logo %||% ""
    }
    teams_out[[abbr]] <- list(team = team, schedule = schedule, stats = stats,
                              depth = depth, roster = roster)
  }

  if (length(teams_out) == 0) stop("ESPN returned no NFL teams")
  out <- list(
    updated = format(Sys.time(), tz = "UTC", "%Y-%m-%dT%H:%M:%SZ"),
    data = list(season = season, teams = teams_out)
  )
  write_json(out, file.path("data", "nfl_teams.json"), auto_unbox = TRUE,
             pretty = FALSE, null = "null")
  message("nfl_teams: saved ", length(teams_out), " teams")
  invisible(TRUE)
}

tryCatch(fetch_nfl_team_cache(), error = function(e) message("nfl_teams: FAILED - ", conditionMessage(e)))

# ---- NBA team pages --------------------------------------------------------
# Like NFL profiles, NBA profiles use a local cache so GitHub Pages visitors
# are not dependent on cross-origin ESPN requests from their browsers.

nba_team_cache_is_fresh <- function(hours = 12) {
  path <- file.path("data", "nba_teams.json")
  if (!file.exists(path)) return(FALSE)
  cached <- tryCatch(fromJSON(path, simplifyVector = FALSE), error = function(e) NULL)
  stamp <- cached$updated %||% NULL
  if (is.null(stamp)) return(FALSE)
  entries <- cached$data$teams %||% list()
  # Force one refresh when upgrading an older cache that has no depth data.
  if (!length(entries) || !any(vapply(entries, function(x) !is.null(x$depth) || !is.null(x$roster), logical(1)))) return(FALSE)
  then <- as.POSIXct(stamp, format = "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
  !is.na(then) && as.numeric(difftime(Sys.time(), then, units = "hours")) < hours
}

fetch_nba_team_cache <- function() {
  if (nba_team_cache_is_fresh()) {
    message("nba_teams: cache is still fresh")
    return(invisible(FALSE))
  }

  safe_json <- function(url) {
    tryCatch(get_json(url), error = function(e) {
      message("  nba team request failed: ", conditionMessage(e))
      NULL
    })
  }

  index <- get_json(paste0(espn_site, "basketball/nba/teams?limit=50"))
  wrappers <- index$sports[[1]]$leagues[[1]]$teams %||% list()
  year <- as.integer(format(Sys.Date(), "%Y"))
  month <- as.integer(format(Sys.Date(), "%m"))
  # ESPN names an NBA season by the calendar year in which the Finals occur.
  season <- if (month >= 7L) year + 1L else year
  teams_out <- list()

  for (wrapper in wrappers) {
    team <- wrapper$team %||% wrapper
    id <- as.character(team$id %||% "")
    abbr <- toupper(team$abbreviation %||% "")
    if (!nzchar(id) || !nzchar(abbr)) next
    message("  nba team page: ", abbr)

    schedule <- safe_json(paste0(espn_site, "basketball/nba/teams/", id,
                                 "/schedule?season=", season))
    stats <- safe_json(paste0("https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/",
                              season, "/types/2/teams/", id, "/statistics"))
    depth <- safe_json(paste0("https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/",
                              season, "/teams/", id, "/depthcharts"))
    roster <- safe_json(paste0(espn_site, "basketball/nba/teams/", id, "/roster"))

    if (!is.null(schedule$team)) {
      team$recordSummary <- schedule$team$recordSummary %||% ""
      team$standingSummary <- schedule$team$standingSummary %||% team$standingSummary %||% ""
      team$logo <- schedule$team$logo %||% team$logo %||% ""
    }
    teams_out[[abbr]] <- list(team = team, schedule = schedule, stats = stats,
                              depth = depth, roster = roster)
  }

  if (length(teams_out) == 0) stop("ESPN returned no NBA teams")
  out <- list(
    updated = format(Sys.time(), tz = "UTC", "%Y-%m-%dT%H:%M:%SZ"),
    data = list(season = season, teams = teams_out)
  )
  write_json(out, file.path("data", "nba_teams.json"), auto_unbox = TRUE,
             pretty = FALSE, null = "null")
  message("nba_teams: saved ", length(teams_out), " teams")
  invisible(TRUE)
}

tryCatch(fetch_nba_team_cache(), error = function(e) message("nba_teams: FAILED - ", conditionMessage(e)))
