// Detect when the user navigates to a new ad within the same tab
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.url.includes("finnkode=")) {
        chrome.tabs.sendMessage(details.tabId, { action: "REFRESH_ADDRESS" });
    }
}, { url: [{ hostSuffix: 'finn.no', pathContains: 'realestate/homes/ad.html' }] });