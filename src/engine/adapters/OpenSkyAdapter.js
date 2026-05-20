// engine/adapters/OpenSkyAdapter.js — Real-time aircraft arrival data from OpenSky Network
//
// Polls the OpenSky States API for aircraft within a radius of an airport.
// Detects arriving aircraft (descending, within range) and computes inter-arrival times.
// Returns an empirical distribution of inter-arrival intervals for use in DES models.
//
// API: https://opensky-network.org/api/states/all?lamin=...&lomin=...&lamax=...&lomax=...
// Docs: https://opensky-network.org/apidoc/rest.html

const OPENSKY_BASE = "https://opensky-network.org/api/states/all";
const DEFAULT_RADIUS_NM = 50; // nautical miles
const NM_TO_DEG_LAT = 1 / 60; // 1 NM ≈ 1 minute of latitude
const POLL_INTERVAL_MS = 30000; // 30 seconds between polls

// Airport coordinates (ICAO → [lat, lon])
const AIRPORT_COORDS = {
  EGLL: [51.4700, -0.4543], // London Heathrow
  KJFK: [40.6413, -73.7781], // New York JFK
  KLAX: [33.9425, -118.4081], // Los Angeles
  KORD: [41.9742, -87.9073], // Chicago O'Hare
  EDDF: [50.0379, 8.5622], // Frankfurt
  RJTT: [35.5494, 139.7798], // Tokyo Haneda
  YSSY: [-33.9461, 151.1772], // Sydney
  LFPG: [49.0097, 2.5479], // Paris CDG
};

function degToRad(deg) { return deg * Math.PI / 180; }

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3440.065; // Earth radius in nautical miles
  const dLat = degToRad(lat2 - lat1);
  const dLon = degToRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(degToRad(lat1)) * Math.cos(degToRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getAirportBounds(icao, radiusNm = DEFAULT_RADIUS_NM) {
  const coords = AIRPORT_COORDS[icao.toUpperCase()];
  if (!coords) return null;
  const [lat, lon] = coords;
  const degRadius = radiusNm * NM_TO_DEG_LAT;
  return {
    lamin: lat - degRadius,
    lamax: lat + degRadius,
    lomin: lon - degRadius,
    lomax: lon + degRadius,
    airportLat: lat,
    airportLon: lon,
  };
}

export class OpenSkyAdapter {
  constructor(source) {
    this._source = source;
    this._icao = source.airportIcao || "EGLL";
    this._radius = source.radiusNm || DEFAULT_RADIUS_NM;
    this._pollInterval = source.pollIntervalMs || POLL_INTERVAL_MS;
    this._cachedData = null;
    this._fetchedAt = null;
    this._pending = null;
    this._arrivalTimes = []; // timestamps of detected arrivals
    this._interArrivals = []; // computed inter-arrival intervals (minutes)
    this._lastSeen = new Set(); // tracks callsigns already counted
    this._intervalId = null;
  }

  _buildUrl() {
    const bounds = getAirportBounds(this._icao, this._radius);
    if (!bounds) return null;
    const params = new URLSearchParams({
      lamin: bounds.lamin.toFixed(4),
      lamax: bounds.lamax.toFixed(4),
      lomin: bounds.lomin.toFixed(4),
      lomax: bounds.lomax.toFixed(4),
    });
    return `${OPENSKY_BASE}?${params.toString()}`;
  }

  async _fetch() {
    const url = this._buildUrl();
    if (!url) throw new Error(`Unknown airport ICAO code: ${this._icao}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`OpenSky API returned HTTP ${res.status}`);
    return await res.json();
  }

  _processArrivals(data) {
    if (!data || !data.states) return;
    const bounds = getAirportBounds(this._icao, this._radius);
    if (!bounds) return;
    const now = Date.now() / 1000;

    for (const state of data.states) {
      const callsign = (state[1] || "").trim();
      const lat = state[6];
      const lon = state[5];
      const geoAlt = state[13]; // geometric altitude in meters
      const vertRate = state[11]; // vertical rate in m/s
      const onGround = state[8];

      if (!callsign || lat == null || lon == null) continue;
      if (this._lastSeen.has(callsign)) continue;

      const distNm = haversineDistance(bounds.airportLat, bounds.airportLon, lat, lon);
      const isArriving = !onGround && vertRate < -1 && geoAlt != null && geoAlt < 3000;

      if (isArriving && distNm <= this._radius) {
        this._lastSeen.add(callsign);
        this._arrivalTimes.push(now);

        if (this._arrivalTimes.length >= 2) {
          const interval = (this._arrivalTimes[this._arrivalTimes.length - 1] - this._arrivalTimes[this._arrivalTimes.length - 2]) / 60;
          if (interval > 0 && interval < 120) {
            this._interArrivals.push(interval);
          }
        }
      }
    }

    // Clean up old seen callsigns after 30 minutes
    if (this._lastSeen.size > 500) {
      this._lastSeen = new Set([...this._lastSeen].slice(-200));
    }
  }

  async prefetch() {
    if (!this._pending) {
      this._pending = this._fetch()
        .then(data => {
          this._cachedData = data;
          this._fetchedAt = Date.now();
          this._processArrivals(data);
        })
        .catch(err => {
          console.warn("[OpenSkyAdapter] Fetch failed:", err.message);
        })
        .finally(() => { this._pending = null; });
    }
    await this._pending;
  }

  startPolling() {
    if (this._intervalId) return;
    this.prefetch();
    this._intervalId = setInterval(() => this.prefetch(), this._pollInterval);
  }

  stopPolling() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  getInterArrivals() {
    return [...this._interArrivals];
  }

  getArrivalCount() {
    return this._arrivalTimes.length;
  }

  getLatest(field) {
    if (this._cachedData == null) return null;
    if (field === "arrivalCount") return this._arrivalTimes.length;
    if (field === "interArrivalMean") {
      const arr = this._interArrivals;
      if (arr.length < 2) return null;
      return arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    if (field === "interArrivals") return this._interArrivals;
    return null;
  }

  dispose() {
    this.stopPolling();
    this._cachedData = null;
    this._fetchedAt = null;
    this._pending = null;
    this._arrivalTimes = [];
    this._interArrivals = [];
    this._lastSeen.clear();
  }
}

export { AIRPORT_COORDS, getAirportBounds, haversineDistance };
