const FINN_AD_FILTERS = [
  { hostSuffix: "finn.no", pathContains: "realestate/homes/ad.html" },
  { hostSuffix: "finn.no", pathContains: "realestate/lettings/ad.html" }
];

const listingKeyByTabId = new Map();

function safeSendMessage(tabId, message) {
  chrome.tabs.sendMessage(tabId, message, () => {
    void chrome.runtime.lastError;
  });
}

function getListingKey(urlString) {
  try {
    const url = new URL(urlString);
    const finnkode = url.searchParams.get("finnkode");
    if (!finnkode) return "";
    return `${url.pathname}?finnkode=${finnkode}`;
  } catch (error) {
    return "";
  }
}

function rememberListing(tabId, urlString) {
  const listingKey = getListingKey(urlString);
  if (!listingKey) return;
  listingKeyByTabId.set(tabId, listingKey);
}

chrome.webNavigation.onCommitted.addListener(
  (details) => {
    if (details.frameId !== 0) return;
    rememberListing(details.tabId, details.url);
  },
  { url: FINN_AD_FILTERS }
);

chrome.webNavigation.onHistoryStateUpdated.addListener(
  (details) => {
    if (details.frameId !== 0) return;

    const listingKey = getListingKey(details.url);
    if (!listingKey) return;
    if (listingKeyByTabId.get(details.tabId) === listingKey) return;

    listingKeyByTabId.set(details.tabId, listingKey);
    safeSendMessage(details.tabId, { action: "REFRESH_ADDRESS" });
  },
  { url: FINN_AD_FILTERS }
);

chrome.tabs.onRemoved.addListener((tabId) => {
  listingKeyByTabId.delete(tabId);
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((request) => {
  if (request?.action === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
  }
});
