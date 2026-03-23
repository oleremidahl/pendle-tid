const ADDRESS_SELECTORS = [
  '[data-testid="object-address"]',
  '[data-testid="object-location"]',
  '[data-testid="location"]',
  '[data-testid*="address"]',
  '[data-testid*="location"]',
  'a[href*="/kart?finnkode="]',
  'a[href*="kart?finnkode="]'
];
const CARD_ID = "finn-pendle-card";
const CLIENT_NAME = "finn-pendle-tid-extension";
const OSLO_TIME_ZONE = "Europe/Oslo";
const DEFAULT_ARRIVAL_TIME = "08:00";
const GEOCODER_FALLBACK_SIZE = 6;
const ADDRESS_SCAN_DELAY_MS = 80;
const AUTO_COLLAPSE_DELAY_MS = 10000;
const SETTINGS_KEYS = ["destinationLabel", "destinationCoordinates", "arrivalTime"];
const ADDRESS_TEXT_REJECT_PATTERNS = [
  /^(vis|se|apne|åpne)\s+(?:i\s+)?kart$/i,
  /^(kart|beliggenhet|adresse)$/i
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

let currentRequestId = 0;
let activeController = null;
let isCardDismissed = false;
let lookupObserver = null;
let lookupScanTimer = null;
let currentAddressElement = null;
let currentAddressText = "";
let lastLookupAddressText = "";
let lastRenderedModel = null;
let collapseTimer = null;
let cardViewMode = "expanded";
let hasAutoCollapsed = false;
let autoCollapseDeadline = 0;
let isPinnedExpanded = false;

function createElement(tagName, className, textContent) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

function clearLookupScanTimer() {
  if (lookupScanTimer) {
    clearTimeout(lookupScanTimer);
    lookupScanTimer = null;
  }
}

function abortActiveRequest() {
  if (activeController) {
    activeController.abort();
    activeController = null;
  }
}

function normalizeText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function clearCollapseTimer() {
  if (collapseTimer) {
    clearTimeout(collapseTimer);
    collapseTimer = null;
  }
}

function parseTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  if (!match) return [8, 0];
  return [Number(match[1]), Number(match[2])];
}

function toClockString(hours, minutes) {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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

function isLikelyAddressText(value) {
  const text = normalizeText(value);
  if (!text || text.length < 2 || text.length > 140) return false;
  if (!/\p{L}/u.test(text)) return false;
  return !ADDRESS_TEXT_REJECT_PATTERNS.some((pattern) => pattern.test(text));
}

function getAddressTextFromElement(element) {
  const candidates = [
    element?.innerText,
    element?.textContent,
    element?.getAttribute?.("aria-label"),
    element?.getAttribute?.("title")
  ];

  for (const candidate of candidates) {
    const text = normalizeText(candidate);
    if (isLikelyAddressText(text)) return text;
  }

  return "";
}

function findAddressMatch() {
  for (const selector of ADDRESS_SELECTORS) {
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      const text = getAddressTextFromElement(element);
      if (text) {
        return { element, text };
      }
    }
  }

  return null;
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

function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(keys, (items) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(items);
    });
  });
}

async function getSettings() {
  const values = await storageGet(SETTINGS_KEYS);
  return {
    destinationLabel: normalizeText(values.destinationLabel),
    destinationCoordinates: values.destinationCoordinates || null,
    arrivalTime: values.arrivalTime || DEFAULT_ARRIVAL_TIME
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
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
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

async function geocodePlace(queryText, signal) {
  const normalizedQuery = normalizeText(queryText);
  const requestOptions = [
    { layers: "address", size: 1 },
    { size: GEOCODER_FALLBACK_SIZE }
  ];

  for (const options of requestOptions) {
    const data = await fetchJson(buildGeocoderUrl(normalizedQuery, options), {
      headers: { "ET-Client-Name": CLIENT_NAME },
      signal
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

async function fetchTripPattern({ from, to, arrivalIso, walkingOnly, signal }) {
  const query = buildTripQuery({ from, to, arrivalIso, walkingOnly });
  const data = await fetchJson("https://api.entur.io/journey-planner/v3/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ET-Client-Name": CLIENT_NAME
    },
    body: JSON.stringify({ query }),
    signal
  });

  if (Array.isArray(data?.errors) && data.errors.length) {
    throw new Error(data.errors[0]?.message || "GraphQL-feil");
  }

  return data?.data?.trip?.tripPatterns?.[0] || null;
}

function createTag(text) {
  const tag = createElement("span", "fpt-tag", text);
  return tag;
}

function createInfoLine(text) {
  return createElement("p", "fpt-message-copy", text);
}

function createControlButton(label, options = {}) {
  const button = createElement(
    "button",
    options.className || "fpt-link-button",
    label
  );
  button.type = "button";
  if (options.ariaLabel) {
    button.setAttribute("aria-label", options.ariaLabel);
  }
  if (typeof options.onClick === "function") {
    button.addEventListener("click", options.onClick);
  }
  return button;
}

function createActionButton(label) {
  return createControlButton(label, {
    onClick: () => {
      chrome.runtime.sendMessage({ action: "OPEN_OPTIONS" });
    }
  });
}

function createSettingsIconButton() {
  return createControlButton("⚙", {
    className: "fpt-link-button fpt-icon-button fpt-settings-button",
    ariaLabel: "Åpne innstillinger",
    onClick: () => {
      chrome.runtime.sendMessage({ action: "OPEN_OPTIONS" });
    }
  });
}

function createCloseButton() {
  return createControlButton("×", {
    className: "fpt-link-button fpt-icon-button",
    ariaLabel: "Lukk pendlevindu",
    onClick: () => {
      dismissCard();
    }
  });
}

function createMinimizeButton() {
  return createControlButton("Minimer", {
    onClick: () => {
      collapseCard();
    }
  });
}

function createExpandButton() {
  return createControlButton("Utvid", {
    onClick: () => {
      expandCard();
    }
  });
}

function resetCardViewState() {
  clearCollapseTimer();
  lastRenderedModel = null;
  cardViewMode = "expanded";
  hasAutoCollapsed = false;
  autoCollapseDeadline = 0;
  isPinnedExpanded = false;
}

function collapseCard(options = {}) {
  if (!lastRenderedModel) return;

  clearCollapseTimer();
  autoCollapseDeadline = 0;
  if (options.auto) {
    hasAutoCollapsed = true;
  }
  cardViewMode = "collapsed";
  renderCard(lastRenderedModel);
}

function expandCard() {
  if (!lastRenderedModel) return;

  clearCollapseTimer();
  autoCollapseDeadline = 0;
  isPinnedExpanded = true;
  cardViewMode = "expanded";
  renderCard(lastRenderedModel);
}

function syncAutoCollapse(model, isCollapsed) {
  if (model.status !== "ready" || isCollapsed || hasAutoCollapsed || isPinnedExpanded) {
    clearCollapseTimer();
    return;
  }

  if (!autoCollapseDeadline) {
    autoCollapseDeadline = Date.now() + AUTO_COLLAPSE_DELAY_MS;
  }

  if (collapseTimer) return;

  const remainingDelay = Math.max(0, autoCollapseDeadline - Date.now());
  collapseTimer = window.setTimeout(() => {
    collapseTimer = null;

    if (isCardDismissed || isPinnedExpanded || hasAutoCollapsed || cardViewMode === "collapsed") {
      return;
    }

    if (lastRenderedModel?.status !== "ready") {
      return;
    }

    hasAutoCollapsed = true;
    autoCollapseDeadline = 0;
    cardViewMode = "collapsed";
    renderCard(lastRenderedModel);
  }, remainingDelay);
}

function createPanel(route, config) {
  const panel = createElement("section", "fpt-panel");
  const titleRow = createElement("div", "fpt-panel-head");
  titleRow.append(createElement("span", "fpt-panel-title", config.title));
  titleRow.append(createTag(config.eyebrow));
  panel.append(titleRow);

  if (!route) {
    panel.classList.add("is-muted");
    panel.append(createElement("p", "fpt-panel-duration", "Ingen rute"));
    panel.append(createInfoLine(config.emptyText));
    return panel;
  }

  panel.append(createElement("p", "fpt-panel-duration", route.totalDuration));

  const meta = createElement("div", "fpt-meta");
  meta.append(createTag(`Avstand ${route.totalDistanceText}`));
  if (route.leaveTime) meta.append(createTag(`Avgang ${route.leaveTime}`));
  if (route.arriveTime) meta.append(createTag(`Fremme ${route.arriveTime}`));
  panel.append(meta);

  if (route.details.length && config.showDetails) {
    const details = createElement("details", "fpt-details");
    const summary = createElement("summary", "fpt-summary", "Vis etapper");
    details.append(summary);

    route.details.forEach((item) => {
      const row = createElement("div", `fpt-detail-row ${item.kind === "wait" ? "is-muted" : ""}`.trim());
      row.append(createElement("span", "fpt-detail-title", item.title));
      row.append(createElement("span", "fpt-detail-meta", item.meta));
      details.append(row);
    });

    panel.append(details);
  }

  return panel;
}

function createCollapsedRouteSummary(title, route) {
  const item = createElement("div", "fpt-collapsed-item");
  item.append(createElement("span", "fpt-collapsed-label", title));
  item.append(
    createElement(
      "span",
      `fpt-collapsed-value${route ? "" : " is-muted"}`,
      route?.totalDuration || "Ingen rute"
    )
  );
  return item;
}

function getCard() {
  let card = document.getElementById(CARD_ID);
  if (!card) {
    card = createElement("section", "fpt-card");
    card.id = CARD_ID;
  }
  return card;
}

function removeCard() {
  document.getElementById(CARD_ID)?.remove();
}

function dismissCard() {
  isCardDismissed = true;
  abortActiveRequest();
  lookupObserver?.disconnect();
  lookupObserver = null;
  clearLookupScanTimer();
  clearCollapseTimer();
  removeCard();
}

function mountCard(addressElement) {
  const card = getCard();
  const root = document.body || document.documentElement;
  root.append(card);
  return card;
}

function renderCard(model) {
  if (isCardDismissed) return;
  lastRenderedModel = model;
  const card = mountCard(model.addressElement);
  const isCollapsed = model.status === "ready" && cardViewMode === "collapsed";
  card.classList.toggle("is-collapsed", isCollapsed);
  card.replaceChildren();

  if (isCollapsed) {
    const compactHeader = createElement("div", "fpt-collapsed-head");
    compactHeader.append(createElement("p", "fpt-collapsed-title", "Pendleoversikt"));

    const compactActions = createElement("div", "fpt-header-actions");
    compactActions.append(createExpandButton());
    compactActions.append(createCloseButton());
    compactHeader.append(compactActions);
    card.append(compactHeader);

    const summary = createElement("button", "fpt-collapsed-summary");
    summary.type = "button";
    summary.setAttribute("aria-label", "Utvid pendleoversikten");
    summary.addEventListener("click", () => {
      expandCard();
    });

    const summaryGrid = createElement("div", "fpt-collapsed-grid");
    summaryGrid.append(createCollapsedRouteSummary("Kollektiv", model.transit));
    summaryGrid.append(createCollapsedRouteSummary("Gå", model.walking));
    summary.append(summaryGrid);
    card.append(summary);

    syncAutoCollapse(model, true);
    return;
  }

  const header = createElement("div", "fpt-header");
  const headerCopy = createElement("div", "fpt-header-copy");
  headerCopy.append(createElement("p", "fpt-kicker", "Pendleoversikt"));
  headerCopy.append(createElement("h2", "fpt-title", model.title || "Sammenlign reisealternativer"));
  if (model.subtitle) {
    headerCopy.append(createElement("p", "fpt-subtitle", model.subtitle));
  }
  header.append(headerCopy);
  const headerActions = createElement("div", "fpt-header-actions");
  headerActions.append(createSettingsIconButton());
  if (model.status === "ready") {
    headerActions.append(createMinimizeButton());
  }
  headerActions.append(createCloseButton());
  header.append(headerActions);
  card.append(header);

  if (model.status === "loading") {
    const state = createElement("div", "fpt-message");
    state.append(createElement("p", "fpt-message-title", "Henter pendletid"));
    state.append(createInfoLine("Vi sammenligner kollektiv og gange for denne annonsen."));
    card.append(state);
    return;
  }

  if (model.status === "missing_settings") {
    const state = createElement("div", "fpt-message");
    state.append(createElement("p", "fpt-message-title", "Legg inn reisemål"));
    state.append(
      createInfoLine("Åpne innstillinger og lagre adressen du vil pendle til. Da vises sammenligningen automatisk på FINN.")
    );
    state.append(createActionButton("Åpne innstillinger"));
    card.append(state);
    return;
  }

  if (model.status === "error" || model.status === "no_route") {
    const state = createElement("div", "fpt-message");
    state.append(
      createElement(
        "p",
        "fpt-message-title",
        model.status === "error" ? "Kunne ikke hente pendletid" : "Fant ingen brukbar rute"
      )
    );
    state.append(createInfoLine(model.message));
    card.append(state);
    return;
  }

  const panels = createElement("div", "fpt-panels");
  panels.append(
    createPanel(model.transit, {
      title: "Kollektiv",
      eyebrow: `Hverdager før ${model.arrivalTime}`,
      emptyText: model.transitEmptyText || "Fant ingen kollektivrute for valgt tidspunkt.",
      showDetails: true
    })
  );
  panels.append(
    createPanel(model.walking, {
      title: "Gå hele veien",
      eyebrow: "Kun gange",
      emptyText: model.walkingEmptyText || "Fant ingen gangrute for hele strekningen.",
      showDetails: false
    })
  );
  card.append(panels);

  syncAutoCollapse(model, false);
}

async function refreshCard(addressElement, addressText) {
  const requestId = ++currentRequestId;
  abortActiveRequest();
  const controller = new AbortController();
  activeController = controller;
  const cardContext = {
    addressElement,
    title: "Sammenlign reisealternativer",
    subtitle: addressText
  };

  try {
    const settings = await getSettings();
    if (requestId !== currentRequestId || isCardDismissed) return;

    cardContext.title = settings.destinationLabel
      ? `Til ${settings.destinationLabel}`
      : "Sammenlign reisealternativer";

    if (!hasValidCoordinates(settings.destinationCoordinates)) {
      renderCard({
        ...cardContext,
        status: "missing_settings"
      });
      return;
    }

    renderCard({
      ...cardContext,
      status: "loading"
    });

    const origin = await geocodePlace(addressText, controller.signal);
    if (requestId !== currentRequestId || isCardDismissed) return;

    if (!origin) {
      renderCard({
        ...cardContext,
        status: "no_route",
        message: "Stedet i annonsen kunne ikke kobles til et brukbart sted hos Entur."
      });
      return;
    }

    const arrivalTime = settings.arrivalTime || DEFAULT_ARRIVAL_TIME;
    const arrivalIso = getNextWeekdayArrivalIso(arrivalTime);
    const destination = {
      lat: Number(settings.destinationCoordinates.lat),
      lon: Number(settings.destinationCoordinates.lon)
    };

    const [transitResult, walkingResult] = await Promise.allSettled([
      fetchTripPattern({
        from: origin,
        to: destination,
        arrivalIso,
        walkingOnly: false,
        signal: controller.signal
      }),
      fetchTripPattern({
        from: origin,
        to: destination,
        arrivalIso,
        walkingOnly: true,
        signal: controller.signal
      })
    ]);

    if (requestId !== currentRequestId || isCardDismissed) return;

    const transitFailed = transitResult.status === "rejected";
    const walkingFailed = walkingResult.status === "rejected";

    if (transitFailed) {
      console.warn("Finn Pendle Tid: Klarte ikke å hente kollektivruten.", transitResult.reason);
    }
    if (walkingFailed) {
      console.warn("Finn Pendle Tid: Klarte ikke å hente gangruten.", walkingResult.reason);
    }

    const transit =
      transitResult.status === "fulfilled"
        ? normalizeRoute(transitResult.value, "transit")
        : null;
    const walking =
      walkingResult.status === "fulfilled"
        ? normalizeRoute(walkingResult.value, "walking")
        : null;

    if (!transit && !walking) {
      if (transitFailed || walkingFailed) {
        renderCard({
          ...cardContext,
          status: "error",
          message: "Vi klarte ikke å hente rutedata akkurat nå. Prøv igjen om litt eller last siden på nytt."
        });
        return;
      }

      renderCard({
        ...cardContext,
        status: "no_route",
        message: "Entur fant ingen ruter mellom adressen og reisemålet ditt for valgt tidspunkt."
      });
      return;
    }

    renderCard({
      ...cardContext,
      status: "ready",
      arrivalTime,
      transit,
      walking,
      transitEmptyText: transitFailed
        ? "Klarte ikke å hente kollektivruten akkurat nå."
        : "Fant ingen kollektivrute for valgt tidspunkt.",
      walkingEmptyText: walkingFailed
        ? "Klarte ikke å hente gangruten akkurat nå."
        : "Fant ingen gangrute for hele strekningen."
    });
  } catch (error) {
    if (error?.name === "AbortError") return;

    console.error("Finn Pendle Tid:", error);
    renderCard({
      ...cardContext,
      status: "error",
      message: "Det oppstod en feil mens reisedata ble hentet. Prøv å laste siden på nytt eller sjekk innstillingene."
    });
  } finally {
    if (activeController === controller) {
      activeController = null;
    }
  }
}

function resetAddressState() {
  clearLookupScanTimer();
  currentAddressElement = null;
  currentAddressText = "";
  lastLookupAddressText = "";
}

function inspectCurrentPage() {
  if (isCardDismissed) return;

  const match = findAddressMatch();
  if (!match) return;

  currentAddressElement = match.element;
  currentAddressText = match.text;

  if (match.text === lastLookupAddressText) {
    return;
  }

  lastLookupAddressText = match.text;
  refreshCard(match.element, match.text);
}

function scheduleLookupScan() {
  if (lookupScanTimer || isCardDismissed) return;

  lookupScanTimer = window.setTimeout(() => {
    lookupScanTimer = null;
    inspectCurrentPage();
  }, ADDRESS_SCAN_DELAY_MS);
}

function startLookupObserver() {
  if (lookupObserver) return;

  const root = document.body || document.documentElement;
  if (!root) return;

  lookupObserver = new MutationObserver(() => {
    scheduleLookupScan();
  });

  lookupObserver.observe(root, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

function resetForNewListing() {
  abortActiveRequest();
  resetAddressState();
  resetCardViewState();
  removeCard();
}

chrome.runtime.onMessage.addListener((request) => {
  if (request?.action === "REFRESH_ADDRESS") {
    isCardDismissed = false;
    startLookupObserver();
    resetForNewListing();
    scheduleLookupScan();
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") return;
  if (SETTINGS_KEYS.some((key) => Object.prototype.hasOwnProperty.call(changes, key))) {
    isCardDismissed = false;
    startLookupObserver();
    if (currentAddressText) {
      refreshCard(currentAddressElement, currentAddressText);
      return;
    }
    scheduleLookupScan();
  }
});

window.addEventListener("pagehide", () => {
  abortActiveRequest();
  lookupObserver?.disconnect();
  lookupObserver = null;
  clearLookupScanTimer();
  clearCollapseTimer();
  autoCollapseDeadline = 0;
});

startLookupObserver();
scheduleLookupScan();
