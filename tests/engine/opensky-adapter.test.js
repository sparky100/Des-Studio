import { describe, expect, it } from 'vitest';
import { haversineDistance, getAirportBounds, AIRPORT_COORDS } from '../../src/engine/adapters/OpenSkyAdapter.js';

describe('haversineDistance', () => {
  it('returns 0 for same coordinates', () => {
    const d = haversineDistance(51.47, -0.4543, 51.47, -0.4543);
    expect(d).toBe(0);
  });

  it('returns approximately correct distance for known points', () => {
    // Heathrow to Gatwick ≈ 24 NM
    const d = haversineDistance(51.4700, -0.4543, 51.1537, -0.1821);
    expect(d).toBeGreaterThan(20);
    expect(d).toBeLessThan(30);
  });

  it('returns approximately correct distance for JFK to LGA', () => {
    // JFK to LaGuardia ≈ 10 NM
    const d = haversineDistance(40.6413, -73.7781, 40.7769, -73.8740);
    expect(d).toBeGreaterThan(5);
    expect(d).toBeLessThan(15);
  });
});

describe('getAirportBounds', () => {
  it('returns bounds for known ICAO codes', () => {
    const bounds = getAirportBounds('EGLL', 50);
    expect(bounds).not.toBeNull();
    expect(bounds.airportLat).toBe(51.4700);
    expect(bounds.airportLon).toBe(-0.4543);
    expect(bounds.lamin).toBeLessThan(bounds.lamax);
    expect(bounds.lomin).toBeLessThan(bounds.lomax);
  });

  it('returns null for unknown ICAO codes', () => {
    const bounds = getAirportBounds('XXXX', 50);
    expect(bounds).toBeNull();
  });

  it('adjusts bounds based on radius', () => {
    const small = getAirportBounds('KJFK', 10);
    const large = getAirportBounds('KJFK', 100);
    expect(large.lamax - large.lamin).toBeGreaterThan(small.lamax - small.lamin);
  });

  it('is case-insensitive for ICAO codes', () => {
    const upper = getAirportBounds('EGLL', 50);
    const lower = getAirportBounds('egll', 50);
    expect(upper).toEqual(lower);
  });
});

describe('AIRPORT_COORDS', () => {
  it('includes major airports', () => {
    expect(AIRPORT_COORDS).toHaveProperty('EGLL');
    expect(AIRPORT_COORDS).toHaveProperty('KJFK');
    expect(AIRPORT_COORDS).toHaveProperty('KLAX');
    expect(AIRPORT_COORDS).toHaveProperty('KORD');
    expect(AIRPORT_COORDS).toHaveProperty('EDDF');
    expect(AIRPORT_COORDS).toHaveProperty('RJTT');
    expect(AIRPORT_COORDS).toHaveProperty('YSSY');
    expect(AIRPORT_COORDS).toHaveProperty('LFPG');
  });

  it('has valid coordinate ranges', () => {
    for (const [icao, [lat, lon]] of Object.entries(AIRPORT_COORDS)) {
      expect(lat).toBeGreaterThan(-90);
      expect(lat).toBeLessThan(90);
      expect(lon).toBeGreaterThan(-180);
      expect(lon).toBeLessThan(180);
    }
  });
});
