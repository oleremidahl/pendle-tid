const DESTINATION = { lat: 59.90386208001988, lon: 10.739245328835816 }; // Vippetangen
const CLIENT_NAME = "olerd-finn-transit-extension";
// const ARRIVAL_TIME = "2026-01-19T08:00:00+02:00";
const ARRIVAL_TIME = getNextMondayOslo();
const USE_ARRIVAL_TIME = true;

/**
 * Extracts "HH:mm" from an ISO string without using local Date methods
 * This prevents your local computer's timezone from shifting the 08:00 result.
 */
function getLocalTimeStr(isoStr) {
  if (!isoStr) return "";
  // Input: "2026-05-18T07:45:00+02:00" -> Result: "07:45"
  return isoStr.split("T")[1].substring(0, 5);
}

/**
 * Returns an ISO string for next Monday 8AM Oslo time.
 * Works regardless of the user's local timezone.
 * 
 * @returns {string} ISO string like "2026-01-27T08:00:00+01:00"
 */
function getNextMondayOslo() {
  // Get current date in Oslo timezone
  const now = new Date();
  const osloFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse current Oslo time
  const parts = osloFormatter.formatToParts(now);
  const getValue = (type) => parts.find(p => p.type === type)?.value;
  
  const osloYear = parseInt(getValue('year'));
  const osloMonth = parseInt(getValue('month')) - 1; // JS months are 0-indexed
  const osloDay = parseInt(getValue('day'));
  
  // Create a date object representing "today" in Oslo
  const osloToday = new Date(Date.UTC(osloYear, osloMonth, osloDay));
  
  // Calculate days until next Monday (1 = Monday, 0 = Sunday)
  const currentDay = osloToday.getUTCDay();
  const daysUntilMonday = currentDay === 0 ? 1 : currentDay === 1 ? 7 : (8 - currentDay);
  
  // Get next Monday
  const nextMonday = new Date(osloToday);
  nextMonday.setUTCDate(osloToday.getUTCDate() + daysUntilMonday);
  
  // Format as YYYY-MM-DD
  const year = nextMonday.getUTCFullYear();
  const month = String(nextMonday.getUTCMonth() + 1).padStart(2, '0');
  const day = String(nextMonday.getUTCDate()).padStart(2, '0');
  
  // Create a date at 8:00 Oslo time on that Monday
  const targetDate = new Date(`${year}-${month}-${day}T08:00:00`);
  
  // Determine Oslo timezone offset for that specific date
  const osloOffset = getOsloOffset(targetDate);
  
  // Return ISO string with Oslo offset
  return `${year}-${month}-${day}T08:00:00${osloOffset}`;
}

/**
 * Get the timezone offset for Oslo at a specific date.
 * Oslo uses CET (UTC+1) in winter and CEST (UTC+2) in summer.
 * 
 * @param {Date} date - The date to check
 * @returns {string} Offset string like "+01:00" or "+02:00"
 */
function getOsloOffset(date) {
  // Create formatter for Oslo timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Oslo',
    timeZoneName: 'longOffset'
  });
  
  // Get the formatted string with offset
  const parts = formatter.formatToParts(date);
  const offsetPart = parts.find(p => p.type === 'timeZoneName');
  
  if (offsetPart && offsetPart.value.includes('GMT')) {
    // Parse "GMT+1" or "GMT+2"
    const offset = offsetPart.value.replace('GMT', '').replace('+', '');
    return `+${offset.padStart(2, '0')}:00`;
  }
  
  // Fallback: manually check DST
  // DST in Oslo typically: last Sunday of March to last Sunday of October
  const month = date.getMonth();
  
  // Rough approximation: DST is active from April to October
  if (month >= 3 && month <= 9) {
    return '+02:00'; // CEST (summer time)
  } else {
    return '+01:00'; // CET (winter time)
  }
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
        ${USE_ARRIVAL_TIME ? `dateTime: "${ARRIVAL_TIME}"` : ''}
        ${USE_ARRIVAL_TIME ? 'arriveBy: true' : ''}
        numTripPatterns: 1
        walkReluctance: 10
      ) {
        tripPatterns {
          duration
          streetDistance
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
      const timeStr = getLocalTimeStr(leg.expectedStartTime);
      if (leg.mode.toUpperCase() === "FOOT") {
        const dist = leg.distance ? ` (${fmtMeters(leg.distance)})` : "";
        lines.push({ text: `🚶 Walk ${mins} min${dist}, ${timeStr}`, tone: "normal" });
      } else {
        const label = fmtLineLabel(leg) || "Transit";
        lines.push({ text: `${label}, ${mins} min, ${timeStr}`, tone: "normal" });
      }
    });

    return {
      header: `${Math.round(pattern.duration / 60)} min commute ${USE_ARRIVAL_TIME ? `(arrive before ${getLocalTimeStr(ARRIVAL_TIME)})` : ''}<br>Walking distance: ${pattern.streetDistance}m`,
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
    console.log("📍 Transit Helper: Address element not found, retrying...");
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