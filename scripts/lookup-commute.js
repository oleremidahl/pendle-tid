#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline/promises");
const process = require("node:process");
const childProcess = require("node:child_process");

const CLIENT_NAME = "finn-pendle-tid-extension";
const OSLO_TIME_ZONE = "Europe/Oslo";
const DEFAULT_ARRIVAL_TIME = "08:00";
const GEOCODER_FALLBACK_SIZE = 6;
const NIGHT_BUS_WINDOW_START_TIME = "00:00";
const NIGHT_BUS_WINDOW_START_MINUTES = 0;
const NIGHT_BUS_WINDOW_END_MINUTES = 5 * 60;
const NIGHT_BUS_SEARCH_WINDOW = 300;
const NIGHT_BUS_PAGE_SIZE = 20;
const CITY_CENTRE_ORIGIN = {
  label: "Jernbanetorget",
  lat: 59.911898,
  lon: 10.75038
};
const NIGHT_BUS_DAY_SPECS = [
  { key: "sunMon", label: "Søn-man", windowDay: 1 },
  { key: "monTue", label: "Man-tir", windowDay: 2 },
  { key: "tueWed", label: "Tir-ons", windowDay: 3 },
  { key: "wedThu", label: "Ons-tor", windowDay: 4 },
  { key: "thuFri", label: "Tor-fre", windowDay: 5 },
  { key: "friSat", label: "Fre-lør", windowDay: 6 },
  { key: "satSun", label: "Lør-søn", windowDay: 0 }
];

const osloDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: OSLO_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

const osloOffsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: OSLO_TIME_ZONE,
  timeZoneName: "longOffset"
});

function normalizeText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function parseTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  if (!match) return [8, 0];
  return [Number(match[1]), Number(match[2])];
}

function getMinutesFromClock(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function toClockString(hours, minutes) {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function toGraphqlString(value) {
  return JSON.stringify(String(value));
}

function getDateTimeParts(date) {
  const parts = osloDateTimeFormatter.formatToParts(date);
  const getPart = (type) => parts.find((part) => part.type === type)?.value || "00";
  return {
    year: Number(getPart("year")),
    month: Number(getPart("month")),
    day: Number(getPart("day")),
    hour: Number(getPart("hour")),
    minute: Number(getPart("minute")),
    second: Number(getPart("second"))
  };
}

function getOsloOffsetForDate(year, month, day) {
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const parts = osloOffsetFormatter.formatToParts(probe);
  const rawOffset = parts.find((part) => part.type === "timeZoneName")?.value || "+01:00";
  const match = rawOffset.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/i);
  if (!match) return "+01:00";

  const hours = match[1];
  const minutes = match[2] || "00";
  const sign = hours.startsWith("-") ? "-" : "+";
  const paddedHours = String(Math.abs(Number(hours))).padStart(2, "0");
  return `${sign}${paddedHours}:${minutes}`;
}

function getNextWeekdayArrivalIso(arrivalTime) {
  const [targetHour, targetMinute] = parseTime(arrivalTime || DEFAULT_ARRIVAL_TIME);
  const nowParts = getDateTimeParts(new Date());
  const baseDate = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day));

  const isWeekday = (day) => day >= 1 && day <= 5;
  const hasPassedToday =
    nowParts.hour > targetHour ||
    (nowParts.hour === targetHour && nowParts.minute >= targetMinute);

  let dayOffset = 0;
  while (true) {
    const candidate = new Date(baseDate);
    candidate.setUTCDate(baseDate.getUTCDate() + dayOffset);
    const candidateDay = candidate.getUTCDay();
    const candidateIsToday = dayOffset === 0;
    if (isWeekday(candidateDay) && (!candidateIsToday || !hasPassedToday)) {
      const year = candidate.getUTCFullYear();
      const month = candidate.getUTCMonth() + 1;
      const day = candidate.getUTCDate();
      const offset = getOsloOffsetForDate(year, month, day);
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${toClockString(targetHour, targetMinute)}:00${offset}`;
    }
    dayOffset += 1;
  }
}

function getNightBusWindowStartIso(windowDay) {
  const nowParts = getDateTimeParts(new Date());
  const baseDate = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day));
  const currentDay = baseDate.getUTCDay();
  const currentMinutes = nowParts.hour * 60 + nowParts.minute;

  let dayOffset = (windowDay - currentDay + 7) % 7;
  if (dayOffset === 0 && currentMinutes >= NIGHT_BUS_WINDOW_END_MINUTES) {
    dayOffset = 7;
  }

  const candidate = new Date(baseDate);
  candidate.setUTCDate(baseDate.getUTCDate() + dayOffset);

  const year = candidate.getUTCFullYear();
  const month = candidate.getUTCMonth() + 1;
  const day = candidate.getUTCDate();
  const offset = getOsloOffsetForDate(year, month, day);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${NIGHT_BUS_WINDOW_START_TIME}:00${offset}`;
}

function getLocalTimeString(isoString) {
  if (!isoString || !isoString.includes("T")) return "";
  return isoString.split("T")[1].slice(0, 5);
}

function formatDistance(meters) {
  if (typeof meters !== "number" || Number.isNaN(meters)) return "Ukjent";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function formatMinutes(seconds) {
  const minutes = Math.max(0, Math.round((seconds || 0) / 60));
  return `${minutes} min`;
}

function hasValidCoordinates(coordinates) {
  return Number.isFinite(Number(coordinates?.lat)) && Number.isFinite(Number(coordinates?.lon));
}

function sumWalkingDistance(legs) {
  return (legs || []).reduce((sum, leg) => {
    if ((leg?.mode || "").toUpperCase() !== "FOOT") return sum;
    return sum + (Number(leg.distance) || 0);
  }, 0);
}

function sumDistance(legs) {
  return (legs || []).reduce((sum, leg) => sum + (Number(leg?.distance) || 0), 0);
}

function getLegLabel(leg) {
  const mode = (leg?.mode || "").toUpperCase();
  const modeLabels = {
    BUS: "Buss",
    RAIL: "Tog",
    TRAM: "Trikk",
    SUBWAY: "T-bane",
    METRO: "T-bane",
    FERRY: "Ferje",
    FOOT: "Gå"
  };

  if (mode === "FOOT") return "Gå";

  const publicCode = leg?.line?.publicCode;
  if (publicCode) return `${modeLabels[mode] || "Kollektiv"} ${publicCode}`;
  return modeLabels[mode] || "Kollektiv";
}

function getLegDetails(legs) {
  const details = [];
  (legs || []).forEach((leg, index) => {
    if (index > 0) {
      const previousLeg = legs[index - 1];
      const gapMinutes = Math.round(
        (new Date(leg.expectedStartTime) - new Date(previousLeg.expectedEndTime)) / 60000
      );
      if (gapMinutes > 0) {
        details.push({
          kind: "wait",
          title: "Bytte",
          meta: `${gapMinutes} min ventetid`
        });
      }
    }

    const distance = Number(leg?.distance) || 0;
    const metaParts = [
      formatMinutes(leg?.duration),
      distance > 0 ? formatDistance(distance) : "",
      getLocalTimeString(leg?.expectedStartTime)
    ].filter(Boolean);

    details.push({
      kind: "leg",
      title: getLegLabel(leg),
      meta: metaParts.join(" • ")
    });
  });
  return details;
}

function normalizeRoute(pattern, variant) {
  if (!pattern || !Array.isArray(pattern.legs) || !pattern.legs.length) return null;

  const legs = pattern.legs;
  const totalDistance = variant === "walking" ? sumDistance(legs) : sumWalkingDistance(legs);
  return {
    variant,
    totalDuration: formatMinutes(pattern.duration),
    totalDistanceText: formatDistance(totalDistance),
    leaveTime: getLocalTimeString(legs[0].expectedStartTime),
    arriveTime: getLocalTimeString(legs[legs.length - 1].expectedEndTime),
    details: getLegDetails(legs)
  };
}

function buildGeocoderUrl(queryText, options = {}) {
  const params = new URLSearchParams({
    text: queryText,
    size: String(options.size || 1),
    lang: "no"
  });

  const layers = normalizeText(options.layers);
  if (layers) {
    params.set("layers", layers);
  }

  return `https://api.entur.io/geocoder/v1/search?${params.toString()}`;
}

async function fetchJson(url, options) {
  const args = ["-fsS", url];
  const method = normalizeText(options?.method).toUpperCase();
  const headers = options?.headers || {};

  if (method && method !== "GET") {
    args.push("-X", method);
  }

  Object.entries(headers).forEach(([key, value]) => {
    args.push("-H", `${key}: ${value}`);
  });

  if (options?.body !== undefined) {
    args.push("--data-binary", String(options.body));
  }

  try {
    const output = childProcess.execFileSync("curl", args, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024
    });
    return JSON.parse(output);
  } catch (error) {
    const details = normalizeText(error?.stderr || error?.message);
    throw new Error(details || "curl-feil");
  }
}

function mapFeatureToPlace(feature, fallbackLabel) {
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const place = {
    lon: Number(coordinates[0]),
    lat: Number(coordinates[1]),
    label:
      feature?.properties?.label ||
      feature?.properties?.name ||
      fallbackLabel
  };

  return hasValidCoordinates(place) ? place : null;
}

function extractPlaceFromSearch(data, fallbackLabel) {
  const features = Array.isArray(data?.features) ? data.features : [];
  for (const feature of features) {
    const place = mapFeatureToPlace(feature, fallbackLabel);
    if (place) return place;
  }
  return null;
}

async function geocodePlace(queryText) {
  const normalizedQuery = normalizeText(queryText);
  const requestOptions = [
    { layers: "address", size: 1 },
    { size: GEOCODER_FALLBACK_SIZE }
  ];

  for (const options of requestOptions) {
    const data = await fetchJson(buildGeocoderUrl(normalizedQuery, options), {
      headers: { "ET-Client-Name": CLIENT_NAME }
    });

    const place = extractPlaceFromSearch(data, normalizedQuery);
    if (place) return place;
  }

  return null;
}

function buildTripQuery({ from, to, arrivalIso, walkingOnly }) {
  const modesBlock = walkingOnly
    ? "modes: { directMode: foot transportModes: [] }"
    : "";

  return `{
    trip(
      from: { coordinates: { latitude: ${from.lat}, longitude: ${from.lon} } }
      to: { coordinates: { latitude: ${to.lat}, longitude: ${to.lon} } }
      dateTime: "${arrivalIso}"
      arriveBy: true
      numTripPatterns: 1
      walkReluctance: 10
      ${modesBlock}
    ) {
      tripPatterns {
        duration
        legs {
          mode
          expectedStartTime
          expectedEndTime
          duration
          distance
          line { publicCode }
        }
      }
    }
  }`;
}

async function fetchTripPattern({ from, to, arrivalIso, walkingOnly }) {
  const query = buildTripQuery({ from, to, arrivalIso, walkingOnly });
  const data = await fetchJson("https://api.entur.io/journey-planner/v3/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ET-Client-Name": CLIENT_NAME
    },
    body: JSON.stringify({ query })
  });

  if (Array.isArray(data?.errors) && data.errors.length) {
    throw new Error(data.errors[0]?.message || "GraphQL-feil");
  }

  return data?.data?.trip?.tripPatterns?.[0] || null;
}

function buildNightBusQuery(daySpecs, destination, cursorByDayKey = {}) {
  const tripQueries = daySpecs
    .map(
      (daySpec) => `
      ${daySpec.key}: trip(
        from: { coordinates: { latitude: ${CITY_CENTRE_ORIGIN.lat}, longitude: ${CITY_CENTRE_ORIGIN.lon} } }
        to: { coordinates: { latitude: ${destination.lat}, longitude: ${destination.lon} } }
        dateTime: ${toGraphqlString(getNightBusWindowStartIso(daySpec.windowDay))}
        arriveBy: false
        searchWindow: ${NIGHT_BUS_SEARCH_WINDOW}
        numTripPatterns: ${NIGHT_BUS_PAGE_SIZE}
        walkReluctance: 10
        modes: {
          accessMode: foot
          egressMode: foot
          directMode: foot
          transportModes: [{ transportMode: bus }]
        }
        ${cursorByDayKey[daySpec.key] ? `pageCursor: ${toGraphqlString(cursorByDayKey[daySpec.key])}` : ""}
      ) {
        nextPageCursor
        tripPatterns {
          legs {
            mode
            expectedStartTime
            line { publicCode }
            fromEstimatedCall {
              quay { name }
            }
          }
        }
      }`
    )
    .join("\n");

  return `{
    ${tripQueries}
  }`;
}

function normalizeNightBusPattern(pattern) {
  const legs = Array.isArray(pattern?.legs) ? pattern.legs : [];
  const transitLeg = legs.find((leg) => (leg?.mode || "").toUpperCase() !== "FOOT");
  if ((transitLeg?.mode || "").toUpperCase() !== "BUS") return null;

  const time = getLocalTimeString(transitLeg.expectedStartTime);
  const minutes = getMinutesFromClock(time);
  if (minutes === null) return null;
  if (minutes < NIGHT_BUS_WINDOW_START_MINUTES || minutes > NIGHT_BUS_WINDOW_END_MINUTES) return null;

  return {
    time,
    lineCode: normalizeText(transitLeg?.line?.publicCode),
    fromQuay: normalizeText(transitLeg?.fromEstimatedCall?.quay?.name) || "Ukjent holdeplass"
  };
}

function extractNightBusDepartures(patterns) {
  const uniqueKeys = new Set();
  const departures = [];

  (patterns || []).forEach((pattern) => {
    const departure = normalizeNightBusPattern(pattern);
    if (!departure) return;

    const key = `${departure.time}|${departure.lineCode}|${departure.fromQuay}`;
    if (uniqueKeys.has(key)) return;

    uniqueKeys.add(key);
    departures.push(departure);
  });

  departures.sort((left, right) => getMinutesFromClock(left.time) - getMinutesFromClock(right.time));
  return departures;
}

function normalizeNightBusResults(dayDataByKey, daySpecs) {
  return daySpecs.map((daySpec) => ({
    key: daySpec.key,
    label: daySpec.label,
    departures: extractNightBusDepartures(dayDataByKey[daySpec.key] || [])
  }));
}

async function fetchNightBusDays({ daySpecs, homeCoordinates }) {
  const dayDataByKey = Object.fromEntries(daySpecs.map((daySpec) => [daySpec.key, []]));
  let pendingDaySpecs = [...daySpecs];
  let cursorByDayKey = {};

  while (pendingDaySpecs.length) {
    const query = buildNightBusQuery(pendingDaySpecs, homeCoordinates, cursorByDayKey);
    const data = await fetchJson("https://api.entur.io/journey-planner/v3/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ET-Client-Name": CLIENT_NAME
      },
      body: JSON.stringify({ query })
    });

    if (Array.isArray(data?.errors) && data.errors.length) {
      throw new Error(data.errors[0]?.message || "GraphQL-feil");
    }

    const nextPendingDaySpecs = [];
    const nextCursorByDayKey = {};

    pendingDaySpecs.forEach((daySpec) => {
      const trip = data?.data?.[daySpec.key];
      const tripPatterns = Array.isArray(trip?.tripPatterns) ? trip.tripPatterns : [];
      const pageDepartures = extractNightBusDepartures(tripPatterns);
      if (tripPatterns.length) {
        dayDataByKey[daySpec.key].push(...tripPatterns);
      }

      const nextPageCursor = normalizeText(trip?.nextPageCursor);
      if (nextPageCursor && pageDepartures.length) {
        nextPendingDaySpecs.push(daySpec);
        nextCursorByDayKey[daySpec.key] = nextPageCursor;
      }
    });

    pendingDaySpecs = nextPendingDaySpecs;
    cursorByDayKey = nextCursorByDayKey;
  }

  return normalizeNightBusResults(dayDataByKey, daySpecs);
}

function getNightBusLastDepartureTime(day) {
  return day.departures[day.departures.length - 1]?.time || "";
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const env = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  });

  return env;
}

async function resolveOriginAddress(argv) {
  const cliAddress = normalizeText(argv.join(" "));
  if (cliAddress) return cliAddress;

  if (!process.stdin.isTTY) {
    const stdinText = normalizeText(fs.readFileSync(0, "utf8"));
    if (stdinText) return stdinText;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    return normalizeText(await rl.question("Adresse: "));
  } finally {
    rl.close();
  }
}

function printTransitRoute(route) {
  if (!route) {
    console.log("Kollektiv");
    console.log("  Ingen rute");
    return;
  }

  console.log("Kollektiv");
  console.log(`  ${route.totalDuration}`);
  console.log(`  Avgang ${route.leaveTime} • Fremme ${route.arriveTime} • Gå ${route.totalDistanceText}`);
  console.log("  Etapper:");
  route.details.forEach((item) => {
    console.log(`  - ${item.title} — ${item.meta}`);
  });
}

function printWalkingRoute(route) {
  if (!route) {
    console.log("Gå hele veien");
    console.log("  Ingen rute");
    return;
  }

  console.log("Gå hele veien");
  console.log(`  ${route.totalDuration} • ${route.totalDistanceText}`);
}

function printNightBus(days) {
  const hasAnyNightBus = days.some((day) => day.departures.length > 0);
  console.log(`Nattbuss fra ${CITY_CENTRE_ORIGIN.label} (00:00-05:00): ${hasAnyNightBus ? "Ja" : "Nei"}`);
  days.forEach((day) => {
    if (!day.departures.length) {
      console.log(`  - ${day.label}: Nei`);
      return;
    }

    console.log(`  - ${day.label}: Ja • siste ${getNightBusLastDepartureTime(day)}`);
  });
}

async function main() {
  const envPath = path.resolve(__dirname, "..", ".env");
  const env = {
    ...parseEnvFile(envPath),
    ...process.env
  };

  const destinationQuery = normalizeText(env.DESTINATION);
  if (!destinationQuery) {
    throw new Error("Mangler DESTINATION i .env eller miljøet.");
  }

  const arrivalTime = normalizeText(env.ARRIVAL_TIME) || DEFAULT_ARRIVAL_TIME;
  const originQuery = await resolveOriginAddress(process.argv.slice(2));
  if (!originQuery) {
    throw new Error("Du må oppgi en adresse.");
  }

  const [origin, destination] = await Promise.all([
    geocodePlace(originQuery),
    geocodePlace(destinationQuery)
  ]);

  if (!origin) {
    throw new Error(`Fant ikke adressen "${originQuery}" hos Entur.`);
  }
  if (!destination) {
    throw new Error(`Fant ikke DESTINATION "${destinationQuery}" hos Entur.`);
  }

  const arrivalIso = getNextWeekdayArrivalIso(arrivalTime);
  const [transitResult, walkingResult, nightBusDays] = await Promise.all([
    fetchTripPattern({
      from: origin,
      to: destination,
      arrivalIso,
      walkingOnly: false
    }),
    fetchTripPattern({
      from: origin,
      to: destination,
      arrivalIso,
      walkingOnly: true
    }),
    fetchNightBusDays({
      daySpecs: NIGHT_BUS_DAY_SPECS,
      homeCoordinates: origin
    })
  ]);

  const transit = normalizeRoute(transitResult, "transit");
  const walking = normalizeRoute(walkingResult, "walking");

  console.log(`Fra: ${origin.label}`);
  console.log(`Til: ${destination.label}`);
  console.log(`Ankomstgrunnlag: neste hverdag før ${arrivalTime}`);
  console.log("");
  printTransitRoute(transit);
  console.log("");
  printWalkingRoute(walking);
  console.log("");
  printNightBus(nightBusDays);
}

main().catch((error) => {
  console.error(`Feil: ${error.message}`);
  process.exitCode = 1;
});
