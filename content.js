const DESTINATION = { lat: 59.90386208001988, lon: 10.739245328835816 }; // Vippetangen
const CLIENT_NAME = "olerd-finn-transit-extension";
// Use the explicit +02:00 offset to lock the query to Norway's May timezone
const MONDAY_18_MAY_OSLO = "2026-05-18T08:00:00+02:00";

/**
 * Extracts "HH:mm" from an ISO string without using local Date methods
 * This prevents your local computer's timezone from shifting the 08:00 result.
 */
function getLocalTimeStr(isoStr) {
  if (!isoStr) return "";
  // Input: "2026-05-18T07:45:00+02:00" -> Result: "07:45"
  return isoStr.split("T")[1].substring(0, 5);
}

function fmtMeters(m) {
  if (typeof m !== "number") return "";
  const rounded = Math.round(m);
  return rounded >= 1000 ? `${(rounded / 1000).toFixed(1)} km` : `${rounded} m`;
}

function fmtLineLabel(leg) {
  const code = leg?.line?.publicCode;
  if (!code) return null;
  const mode = (leg.mode || "").toUpperCase();
  const labels = { BUS: "🚌 Bus", RAIL: "🚝 Train", TRAM: "🚋 Tram", SUBWAY: "🚊 Metro", METRO: "🚊 Metro", FERRY: "⛴️ Ferry" };
  const modeLabel = labels[mode] || mode.charAt(0) + mode.slice(1).toLowerCase();
  return `${modeLabel} ${code}`;
}

async function getCommuteTime(addressText) {
  try {
    // 1. Geocode
    const geoRes = await fetch(`https://api.entur.io/geocoder/v1/search?text=${encodeURIComponent(addressText)}&layers=address&size=1`, {
      headers: { 'ET-Client-Name': CLIENT_NAME }
    });
    const geoData = await geoRes.json();
    if (!geoData?.features?.length) return null;
    const [lon, lat] = geoData.features[0].geometry.coordinates;

    // 2. Journey Plan with ArriveBy: true
    const query = `{
      trip(
        from: { coordinates: { latitude: ${lat}, longitude: ${lon} } }
        to: { coordinates: { latitude: ${DESTINATION.lat}, longitude: ${DESTINATION.lon} } }
        dateTime: "${MONDAY_18_MAY_OSLO}"
        arriveBy: true
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

    const tripRes = await fetch("https://api.entur.io/journey-planner/v3/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", "ET-Client-Name": CLIENT_NAME },
      body: JSON.stringify({ query })
    });

    const tripData = await tripRes.json();
    const pattern = tripData.data.trip.tripPatterns[0];
    if (!pattern) return null;

    // 3. Build Toast Model directly
    const legs = pattern.legs || [];
    const lines = [];
    
    legs.forEach((leg, i) => {
      // Add wait times between legs
      if (i > 0) {
        const gapMs = new Date(leg.expectedStartTime) - new Date(legs[i - 1].expectedEndTime);
        const gapMin = Math.round(gapMs / 60000);
        if (gapMin > 0) lines.push({ text: `⏳ Wait ${gapMin} min`, tone: "muted" });
      }

      const mins = Math.max(0, Math.round(leg.duration / 60));
      if (leg.mode.toUpperCase() === "FOOT") {
        const dist = leg.distance ? ` (${fmtMeters(leg.distance)})` : "";
        lines.push({ text: `🚶 Walk ${mins} min${dist}`, tone: "normal" });
      } else {
        const label = fmtLineLabel(leg) || "Transit";
        lines.push({ text: `${label}, ${mins} min`, tone: "normal" });
      }
    });

    return {
      header: `${Math.round(pattern.duration / 60)} min commute to work (arrive before 08:00)`,
      subheader: `Leave ${getLocalTimeStr(legs[0].expectedStartTime)} • Arrive ${getLocalTimeStr(legs[legs.length - 1].expectedEndTime)}`,
      lines
    };

  } catch (err) {
    console.error("📍 Transit Helper Error:", err);
    return null;
  }
}

async function findAddress() {
  const element = document.querySelector('[data-testid="object-address"]');
  if (element && !element.dataset.processed) {
    element.dataset.processed = "true";
    const commuteModel = await getCommuteTime(element.innerText.trim());
    if (commuteModel) window.showTransitToast?.(commuteModel);
  } else if (!element) {
    setTimeout(findAddress, 500);
  }
}

findAddress();

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "REFRESH_ADDRESS") {
    const element = document.querySelector('[data-testid="object-address"]');
    if (element) delete element.dataset.processed;
    findAddress();
  }
});