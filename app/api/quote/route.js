import { NextResponse } from 'next/server';

function parseClock(time) {
  const [h, m] = String(time || '00:00').split(':').map(Number);
  return h * 60 + m;
}

function lastDumpTime(startTime, cycleMinutes, loadMinutes, loadedMinutes, dumpMinutes, cutoffTime) {
  const start = parseClock(startTime);
  const cutoff = parseClock(cutoffTime);
  if (!Number.isFinite(cycleMinutes) || cycleMinutes <= 0) return { loadsPossible: 0, lastDump: null };
  let loads = 0;
  let lastDumpMinute = null;
  for (let n = 1; n <= 100; n++) {
    const dumpComplete = start + ((n - 1) * cycleMinutes) + loadMinutes + loadedMinutes + dumpMinutes;
    if (dumpComplete <= cutoff) {
      loads = n;
      lastDumpMinute = dumpComplete;
    } else break;
  }
  if (lastDumpMinute == null) return { loadsPossible: 0, lastDump: null };
  const hh = Math.floor(lastDumpMinute / 60) % 24;
  const mm = Math.round(lastDumpMinute % 60);
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return { loadsPossible: loads, lastDump: d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) };
}

async function getRoute(origin, destination, apiKey) {
  const body = {
    origin: { address: origin },
    destination: { address: destination },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
    computeAlternativeRoutes: false,
    extraComputations: ['TOLLS'],
    routeModifiers: { vehicleInfo: { emissionType: 'DIESEL' } },
    languageCode: 'en-US',
    units: 'IMPERIAL'
  };

  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.travelAdvisory.tollInfo'
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Google Routes API error');
  const route = data.routes?.[0];
  if (!route) throw new Error('No route found');

  const seconds = Number(String(route.duration || '0s').replace('s', '')) || 0;
  const meters = Number(route.distanceMeters || 0);
  let toll = 0;
  const price = route.travelAdvisory?.tollInfo?.estimatedPrice?.[0];
  if (price) {
    const units = Number(price.units || 0);
    const nanos = Number(price.nanos || 0) / 1e9;
    toll = units + nanos;
  }
  return { minutes: seconds / 60, miles: meters / 1609.344, toll };
}

export async function POST(req) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Missing GOOGLE_MAPS_API_KEY in Vercel environment variables.' }, { status: 500 });
    const input = await req.json();
    if (!input.pickup || !input.dump) return NextResponse.json({ error: 'Pickup and dump addresses are required.' }, { status: 400 });

    const loaded = await getRoute(input.pickup, input.dump, apiKey);
    const ret = await getRoute(input.dump, input.pickup, apiKey);

    const loadedAdjusted = loaded.minutes * Number(input.loadedMultiplier || 1.15);
    const returnAdjusted = ret.minutes * Number(input.emptyMultiplier || 1.05);
    const loadMinutes = Number(input.loadMinutes || 15);
    const dumpMinutes = Number(input.dumpMinutes || 7);
    const cycleMinutes = loadMinutes + loadedAdjusted + dumpMinutes + returnAdjusted;
    const roundTripMiles = loaded.miles + ret.miles;
    const fuelCost = (roundTripMiles / Number(input.mpg || 6)) * Number(input.fuelPrice || 0);
    const tollCost = loaded.toll + ret.toll + Number(input.tollsManual || 0);
    const timeCost = (cycleMinutes / 60) * Number(input.hourlyRate || 0);
    const costPerLoad = timeCost + fuelCost + tollCost;
    const quotePerLoad = costPerLoad * (1 + Number(input.markupPercent || 0) / 100);
    const quotePerTon = quotePerLoad / Number(input.tonsPerLoad || 21);
    const quotePerYard = quotePerLoad / Number(input.yardsPerLoad || 18);
    const dump = lastDumpTime(input.startTime, cycleMinutes, loadMinutes, loadedAdjusted, dumpMinutes, input.cutoffTime);

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
      note: 'Google Routes traffic-aware time is adjusted by your dump-truck slowdown multipliers. Tolls are included when Google returns toll estimates; manual tolls can be added if needed.'
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
