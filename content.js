const DESTINATION = { lat: 59.90386208001988, lon: 10.739245328835816 }; // Vippetangen
const CLIENT_NAME = "olerd-finn-transit-extension";

/**
 * Calculates the ISO string for the upcoming Monday at 08:00.
 */
function getNextMondayEightAM() {
    const d = new Date();
    d.setDate(d.getDate() + (1 + 7 - d.getDay()) % 7 || 7);
    d.setHours(8, 0, 0, 0);
    return d.toISOString();
}

/**
 * Communicates with Entur Geocoder and JourneyPlanner APIs.
 */
async function getCommuteTime(addressText) {
    try {
        // 1. Geocode: Turn text address into coordinates
        const geoRes = await fetch(`https://api.entur.io/geocoder/v1/search?text=${encodeURIComponent(addressText)}&layers=address&size=1`, {
            headers: { 'ET-Client-Name': CLIENT_NAME }
        });
        const geoData = await geoRes.json();
        if (!geoData?.features?.length) return null;

        const [lon, lat] = geoData.features[0].geometry.coordinates;

        // 2. Journey Plan: Request trip duration for Monday 08:00
        const monday = getNextMondayEightAM();
        const query = `
        {
          trip(
            from: { coordinates: { latitude: ${lat}, longitude: ${lon} } }
            to: { coordinates: { latitude: ${DESTINATION.lat}, longitude: ${DESTINATION.lon} } }
            dateTime: "${monday}"
          ) {
            tripPatterns {
              duration
            }
          }
        }`;

        const tripRes = await fetch("https://api.entur.io/journey-planner/v3/graphql", {
            method: "POST",
            headers: { "Content-Type": "application/json", "ET-Client-Name": CLIENT_NAME },
            body: JSON.stringify({ query })
        });
        const tripData = await tripRes.json();
        console.log(tripData.data);
        const seconds = tripData.data.trip.tripPatterns[0]?.duration;
        return seconds ? Math.round(seconds / 60) : null;
    } catch (err) {
        console.error("📍 Finn Transit Helper Error:", err);
        return null;
    }
}

/**
 * Main function to scrape address and update the UI.
 */
async function findAddress() {
    const addressSelector = '[data-testid="object-address"]';
    const element = document.querySelector(addressSelector);
    
    if (element) {
        // Prevent duplicate processing on the same element
        if (element.dataset.processed === "true") return;
        element.dataset.processed = "true";

        const address = element.innerText.trim();
        console.log("📍 Finn Transit Helper found address:", address);

        const minutes = await getCommuteTime(address);
        
        if (minutes) {
            window.showTransitToast?.(minutes);
        }
    } else {
        // Retry if the Finn.no SPA hasn't rendered the element yet
        console.log("📍 Finn Transit Helper: Address element not found, retrying...");
        setTimeout(findAddress, 500); 
    }
}

// 1. Run immediately when page loads
findAddress();

// 2. Run when background.js says the URL/finnkode has changed
chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "REFRESH_ADDRESS") {
        // Clear the flag so findAddress can process the new content
        const element = document.querySelector('[data-testid="object-address"]');
        if (element) delete element.dataset.processed;
        findAddress();
    }
});