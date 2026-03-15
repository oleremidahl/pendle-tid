const FINN_AD_FILTERS = [
  { hostSuffix: "finn.no", pathContains: "realestate/homes/ad.html" },
  { hostSuffix: "finn.no", pathContains: "realestate/lettings/ad.html" }
];

function safeSendMessage(tabId, message) {
  chrome.tabs.sendMessage(tabId, message, () => {
    void chrome.runtime.lastError;
  });
}

chrome.webNavigation.onHistoryStateUpdated.addListener(
  (details) => {
    if (details.url.includes("finnkode=")) {
      safeSendMessage(details.tabId, { action: "REFRESH_ADDRESS" });
    }
  },
  { url: FINN_AD_FILTERS }
);

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((request) => {
  if (request?.action === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
  }
});
