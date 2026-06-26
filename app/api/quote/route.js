import { NextResponse } from 'next/server';

function parseClock(time) {
  const [h, m] = String(time || '00:00').split(':').map(Number);
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

function formatClock(totalMinutes) {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hh = Math.floor(normalized / 60);
  const mm = normalized % 60;
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function lastDumpTime(startTime, cycleMinutes, loadMinutes, loadedMinutes, dumpMinutes, cutoffTime) {
  const start = parseClock(startTime);
  const cutoff = parseClock(cutoffTime);

  if (!Number.isFinite(cycleMinutes) || cycleMinutes <= 0) {
    return { loadsPossible: 0, lastDump: null };
  }

  let loads = 0;
  let lastDumpMinute = null;

  for (let n = 1; n <= 100; n++) {
    const dumpComplete = start + (n - 1) * cycleMinutes + loadMinutes + loadedMinutes + dumpMinutes;

    if (dumpComplete <= cutoff) {
      loads = n;
      lastDumpMinute = dumpComplete;
    } else {
      break;
    }
  }

  if (lastDumpMinute == null) {
    return { loadsPossible: 0, lastDump: null };
  }

  return {
    loadsPossible: loads,
    lastDump: formatClock(lastDumpMinute)
  };
}

function parseGoogleDuration(duration) {
  if (!duration) return 0;

  if (typeof duration === 'string') {
    const seconds = Number(duration.replace('s', ''));
    return Number.isFinite(seconds) ? seconds : 0;
  }

  if (typeof duration === 'object') {
    const seconds = Number(duration.seconds || 0);
    return Number.isFinite(seconds) ? seconds : 0;
  }

  return 0;
}

async function getRoute(origin, destination, apiKey) {
  const body = {
    origin: { address: origin },
    destination: { address: destination },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    computeAlternativeRoutes: false,
    languageCode: 'en-US',
    units: 'IMPERIAL'
  };

  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters'
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();

  if (!res.ok) {
    const googleMessage =
      data?.error?.message ||
      data?.error?.status ||
      JSON.stringify(data?.error || data);

    throw new Error(`Google Routes API error: ${googleMessage}`);
  }

  const route = data.routes?.[0];

  if (!route) {
    throw new Error('No route found. Check the pickup and dump addresses.');
  }

  const seconds = parseGoogleDuration(route.duration);
  const meters = Number(route.distanceMeters || 0);

  return {
    minutes: seconds / 60,
    miles: meters / 1609.344,
    toll: 0
  };
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing GOOGLE_MAPS_API_KEY in Vercel environment variables.' },
        { status: 500 }
      );
    }

    const input = await req.json();

    if (!input.pickup || !input.dump) {
      return NextResponse.json(
        { error: 'Pickup and dump addresses are required.' },
        { status: 400 }
      );
    }

    const loaded = await getRoute(input.pickup, input.dump, apiKey);
    const ret = await getRoute(input.dump, input.pickup, apiKey);

    const loadedMultiplier = Number(input.loadedMultiplier || 1.15);
    const emptyMultiplier = Number(input.emptyMultiplier || 1.05);
    const loadMinutes = Number(input.loadMinutes || 15);
    const dumpMinutes = Number(input.dumpMinutes || 7);
    const mpg = Number(input.mpg || 6);
    const fuelPrice = money(input.fuelPrice);
    const hourlyRate = money(input.hourlyRate);
    const markupPercent = Number(input.markupPercent || 0);
    const tonsPerLoad = Number(input.tonsPerLoad || 21);
    const yardsPerLoad = Number(input.yardsPerLoad || 18);

    const loadedAdjusted = loaded.minutes * loadedMultiplier;
    const returnAdjusted = ret.minutes * emptyMultiplier;

    const cycleMinutes = loadMinutes + loadedAdjusted + dumpMinutes + returnAdjusted;
    const roundTripMiles = loaded.miles + ret.miles;

    const fuelCost = mpg > 0 ? (roundTripMiles / mpg) * fuelPrice : 0;
    const tollCost = money(input.tollsManual);
    const timeCost = (cycleMinutes / 60) * hourlyRate;

    const costPerLoad = timeCost + fuelCost + tollCost;
    const quotePerLoad = costPerLoad * (1 + markupPercent / 100);
    const quotePerTon = tonsPerLoad > 0 ? quotePerLoad / tonsPerLoad : 0;
    const quotePerYard = yardsPerLoad > 0 ? quotePerLoad / yardsPerLoad : 0;

    const dump = lastDumpTime(
      input.startTime,
      cycleMinutes,
      loadMinutes,
      loadedAdjusted,
      dumpMinutes,
      input.cutoffTime
    );

    return NextResponse.json({
      loadedMiles: loaded.miles,
      returnMiles: ret.miles,
      roundTripMiles,
      googleLoadedMinutes: loaded.minutes,
      googleReturnMinutes: ret.minutes,
      adjustedLoadedMinutes: loadedAdjusted,
      adjustedReturnMinutes: returnAdjusted,
      cycleMinutes,
      loadsPossible: dump.loadsPossible,
      lastDumpTime: dump.lastDump,
      fuelCost,
      tollCost,
      costPerLoad,
      quotePerLoad,
      quotePerTon,
      quotePerYard,
      note: 'Google Routes traffic-aware drive time is adjusted by your dump-truck slowdown multipliers. Automatic Google toll estimates are disabled in this version; use Manual Tolls $ when needed.'
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Unknown server error' },
      { status: 500 }
    );
  }
}