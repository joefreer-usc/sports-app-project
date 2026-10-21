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

# NFL, NBA, MLB and college football (ESPN) will be added in the next round.
