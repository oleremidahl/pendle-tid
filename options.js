const CLIENT_NAME = "finn-pendle-tid-extension";
const SETTINGS_KEYS = ["destinationLabel", "destinationCoordinates", "arrivalTime"];
const DEFAULT_ARRIVAL_TIME = "08:00";

const form = document.getElementById("settings-form");
const destinationInput = document.getElementById("destination-input");
const destinationDropdown = document.getElementById("destination-dropdown");
const arrivalTimeInput = document.getElementById("arrival-time-input");
const saveButton = document.getElementById("save-button");
const resetButton = document.getElementById("reset-button");
const savedState = document.getElementById("saved-state");
const statusMessage = document.getElementById("status-message");

let selectedDestination = null;
let destinationSuggestions = [];
let activeSuggestionIndex = -1;
let suggestionRequestId = 0;
let suggestionController = null;
let suggestionTimer = null;

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, resolve);
  });
}

function storageSet(values) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(values, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

function storageRemove(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

function normalizeText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function setBusy(isBusy) {
  saveButton.disabled = isBusy;
  resetButton.disabled = isBusy;
}

function clearSuggestionTimer() {
  if (suggestionTimer) {
    clearTimeout(suggestionTimer);
    suggestionTimer = null;
  }
}

function abortSuggestionRequest() {
  if (suggestionController) {
    suggestionController.abort();
    suggestionController = null;
  }
}

function setStatus(type, message) {
  statusMessage.textContent = message;
  statusMessage.className = "status-message is-visible";
  if (type === "success") {
    statusMessage.classList.add("is-success");
  }
  if (type === "error") {
    statusMessage.classList.add("is-error");
  }
}

function clearStatus() {
  statusMessage.textContent = "";
  statusMessage.className = "status-message";
}

function hasValidCoordinates(coordinates) {
  return Number.isFinite(Number(coordinates?.lat)) && Number.isFinite(Number(coordinates?.lon));
}

function getSuggestionMeta(feature) {
  return normalizeText(
    feature?.properties?.postalCode && feature?.properties?.postalName
      ? `${feature.properties.postalCode} ${feature.properties.postalName}`
      : feature?.properties?.municipality || feature?.properties?.county || ""
  );
}

function mapFeatureToDestination(feature) {
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  return {
    label:
      feature?.properties?.label ||
      feature?.properties?.name ||
      feature?.properties?.locality ||
      "",
    meta: getSuggestionMeta(feature),
    destinationCoordinates: {
      lat: Number(coordinates[1]),
      lon: Number(coordinates[0])
    }
  };
}

function formatCoordinates(coordinates) {
  if (!hasValidCoordinates(coordinates)) return "";
  return `${Number(coordinates.lat).toFixed(5)}, ${Number(coordinates.lon).toFixed(5)}`;
}

function updateSavedState(values) {
  if (values.destinationLabel && hasValidCoordinates(values.destinationCoordinates)) {
    savedState.textContent = `Lagret reisemål: ${values.destinationLabel} (${formatCoordinates(values.destinationCoordinates)}). Fremme før ${values.arrivalTime || DEFAULT_ARRIVAL_TIME}.`;
    return;
  }

  savedState.textContent = "Ingen reisemål lagret ennå. Når du lagrer et sted her, dukker sammenligningskortet opp automatisk på FINN-annonsene.";
}

function setDropdownVisible(isVisible) {
  destinationDropdown.classList.toggle("is-visible", isVisible);
  destinationInput.setAttribute("aria-expanded", isVisible ? "true" : "false");
}

function clearSuggestions() {
  destinationSuggestions = [];
  activeSuggestionIndex = -1;
  destinationDropdown.replaceChildren();
  setDropdownVisible(false);
}

function renderSuggestions() {
  destinationDropdown.replaceChildren();

  if (!destinationSuggestions.length) {
    const empty = document.createElement("div");
    empty.className = "search-empty";
    empty.textContent = "Ingen treff. Prøv en mer presis adresse eller et stedsnavn.";
    destinationDropdown.append(empty);
    setDropdownVisible(true);
    return;
  }

  destinationSuggestions.forEach((suggestion, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `search-item${index === activeSuggestionIndex ? " is-active" : ""}`;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", index === activeSuggestionIndex ? "true" : "false");

    const title = document.createElement("span");
    title.className = "search-item-title";
    title.textContent = suggestion.label;
    button.append(title);

    if (suggestion.meta) {
      const meta = document.createElement("span");
      meta.className = "search-item-meta";
      meta.textContent = suggestion.meta;
      button.append(meta);
    }

    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      applySuggestion(index);
    });

    destinationDropdown.append(button);
  });

  setDropdownVisible(true);
}

function applySuggestion(index) {
  const suggestion = destinationSuggestions[index];
  if (!suggestion) return;

  selectedDestination = suggestion;
  activeSuggestionIndex = index;
  destinationInput.value = suggestion.label;
  clearSuggestions();
  clearStatus();
}

async function searchDestinations(queryText, signal) {
  const response = await fetch(
    `https://api.entur.io/geocoder/v1/search?text=${encodeURIComponent(queryText)}&size=6&lang=no`,
    {
      headers: { "ET-Client-Name": CLIENT_NAME },
      signal
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  return (data?.features || [])
    .map(mapFeatureToDestination)
    .filter((item) => item && item.label && hasValidCoordinates(item.destinationCoordinates));
}

async function geocodePlace(queryText) {
  const response = await fetch(
    `https://api.entur.io/geocoder/v1/search?text=${encodeURIComponent(queryText)}&layers=address&size=1&lang=no`,
    {
      headers: { "ET-Client-Name": CLIENT_NAME }
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  const feature = data?.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  return {
    label:
      feature?.properties?.label ||
      feature?.properties?.name ||
      normalizeText(queryText),
    destinationCoordinates: {
      lat: Number(coordinates[1]),
      lon: Number(coordinates[0])
    }
  };
}

async function resolveDestinationForSave(queryText) {
  if (selectedDestination && normalizeText(selectedDestination.label) === queryText) {
    return selectedDestination;
  }

  const suggestions = await searchDestinations(queryText);
  if (suggestions.length) {
    return suggestions[0];
  }

  return geocodePlace(queryText);
}

function scheduleDestinationSearch() {
  clearSuggestionTimer();
  abortSuggestionRequest();

  const queryText = normalizeText(destinationInput.value);
  if (queryText.length < 2) {
    clearSuggestions();
    return;
  }

  suggestionTimer = window.setTimeout(async () => {
    const requestId = ++suggestionRequestId;
    const controller = new AbortController();
    suggestionController = controller;

    try {
      const suggestions = await searchDestinations(queryText, controller.signal);
      if (requestId !== suggestionRequestId) return;

      selectedDestination = null;
      destinationSuggestions = suggestions;
      activeSuggestionIndex = suggestions.length ? 0 : -1;
      renderSuggestions();
    } catch (error) {
      if (error?.name === "AbortError") return;
      console.error("Finn Pendle Tid options:", error);
      clearSuggestions();
    } finally {
      if (suggestionController === controller) {
        suggestionController = null;
      }
    }
  }, 180);
}

async function loadSettings() {
  const values = await storageGet(SETTINGS_KEYS);
  const normalized = {
    destinationLabel: normalizeText(values.destinationLabel),
    destinationCoordinates: hasValidCoordinates(values.destinationCoordinates)
      ? values.destinationCoordinates
      : null,
    arrivalTime: values.arrivalTime || DEFAULT_ARRIVAL_TIME
  };

  destinationInput.value = normalized.destinationLabel || "";
  selectedDestination = normalized.destinationLabel && normalized.destinationCoordinates
    ? {
        label: normalized.destinationLabel,
        meta: "",
        destinationCoordinates: normalized.destinationCoordinates
      }
    : null;
  arrivalTimeInput.value = normalized.arrivalTime;
  updateSavedState(normalized);
}

async function handleSave(event) {
  event.preventDefault();
  clearStatus();

  const destinationText = normalizeText(destinationInput.value);
  const arrivalTime = arrivalTimeInput.value || DEFAULT_ARRIVAL_TIME;

  if (!destinationText) {
    setStatus("error", "Skriv inn adressen eller stedet du vil pendle til.");
    destinationInput.focus();
    return;
  }

  setBusy(true);
  try {
    const result = await resolveDestinationForSave(destinationText);
    if (!result) {
      setStatus("error", "Fant ikke noe reisemål hos Entur. Prøv en mer presis adresse.");
      return;
    }

    const values = {
      destinationLabel: result.label,
      destinationCoordinates: result.destinationCoordinates,
      arrivalTime
    };

    await storageSet(values);
    destinationInput.value = result.label;
    selectedDestination = result;
    clearSuggestions();
    updateSavedState(values);
    setStatus("success", "Innstillingene er lagret. Åpne en FINN-annonse for å se sammenligningen.");
  } catch (error) {
    console.error("Finn Pendle Tid options:", error);
    setStatus("error", "Kunne ikke lagre innstillingene akkurat nå. Prøv igjen om litt.");
  } finally {
    setBusy(false);
  }
}

async function handleReset() {
  clearStatus();
  setBusy(true);
  try {
    await storageRemove(SETTINGS_KEYS);
    destinationInput.value = "";
    selectedDestination = null;
    clearSuggestions();
    arrivalTimeInput.value = DEFAULT_ARRIVAL_TIME;
    updateSavedState({
      destinationLabel: "",
      destinationCoordinates: null,
      arrivalTime: DEFAULT_ARRIVAL_TIME
    });
    setStatus("success", "Lagret reisemål er slettet.");
  } catch (error) {
    console.error("Finn Pendle Tid options:", error);
    setStatus("error", "Kunne ikke slette lagrede innstillinger.");
  } finally {
    setBusy(false);
  }
}

destinationInput.addEventListener("input", () => {
  selectedDestination = null;
  scheduleDestinationSearch();
});

destinationInput.addEventListener("focus", () => {
  if (destinationSuggestions.length) {
    renderSuggestions();
  }
});

destinationInput.addEventListener("blur", () => {
  window.setTimeout(() => {
    clearSuggestions();
  }, 120);
});

destinationInput.addEventListener("keydown", (event) => {
  if (!destinationSuggestions.length || !destinationDropdown.classList.contains("is-visible")) {
    if (event.key === "Escape") {
      clearSuggestions();
    }
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, destinationSuggestions.length - 1);
    renderSuggestions();
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0);
    renderSuggestions();
    return;
  }

  if (event.key === "Enter" && activeSuggestionIndex >= 0) {
    event.preventDefault();
    applySuggestion(activeSuggestionIndex);
    return;
  }

  if (event.key === "Escape") {
    clearSuggestions();
  }
});

form.addEventListener("submit", handleSave);
resetButton.addEventListener("click", handleReset);
loadSettings().catch((error) => {
  console.error("Finn Pendle Tid options:", error);
  setStatus("error", "Kunne ikke lese lagrede innstillinger.");
});
