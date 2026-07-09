import { NextResponse } from 'next/server';

const DEFAULT_TARGET_TRUCK_RATE_PER_HOUR = 75;
const DEFAULT_TAX_RATE = 0.07;

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

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

function calculateLoads(startTime, cycleMinutes, loadMinutes, loadedMinutes, dumpMinutes, endTime) {
  const start = parseClock(startTime || '07:00');
  const cutoff = parseClock(endTime || '16:00');

  if (!Number.isFinite(cycleMinutes) || cycleMinutes <= 0) {
    return { loadsPossible: 0, lastDumpTime: null, workingMinutes: 0 };
  }

  let loads = 0;
  let lastDumpMinute = null;

  for (let n = 1; n <= 100; n++) {
    const dumpComplete =
      start + (n - 1) * cycleMinutes + loadMinutes + loadedMinutes + dumpMinutes;

    if (dumpComplete <= cutoff) {
      loads = n;
      lastDumpMinute = dumpComplete;
    } else {
      break;
    }
  }

  return {
    loadsPossible: loads,
    lastDumpTime: lastDumpMinute == null ? null : formatClock(lastDumpMinute),
    workingMinutes: lastDumpMinute == null ? 0 : Math.max(0, lastDumpMinute - start)
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

  return {
    minutes: parseGoogleDuration(route.duration) / 60,
    miles: Number(route.distanceMeters || 0) / 1609.344,
    toll: 0
  };
}

function rateFromDailyTarget({
  unit,
  loadsPossible,
  workingHours,
  targetHourly,
  tonsPerLoad,
  yardsPerLoad,
  cycleMinutes
}) {
  if (unit === 'hour') return targetHourly;

  if (loadsPossible <= 0) {
    const fallbackPerLoad = targetHourly * (cycleMinutes / 60);

    if (unit === 'load') return fallbackPerLoad;
    if (unit === 'ton') return tonsPerLoad > 0 ? fallbackPerLoad / tonsPerLoad : 0;
    if (unit === 'yard') return yardsPerLoad > 0 ? fallbackPerLoad / yardsPerLoad : 0;

    return 0;
  }

  const targetRevenueForDay = targetHourly * workingHours;

  if (unit === 'load') return targetRevenueForDay / loadsPossible;
  if (unit === 'ton') return targetRevenueForDay / (loadsPossible * tonsPerLoad);
  if (unit === 'yard') return targetRevenueForDay / (loadsPossible * yardsPerLoad);

  return 0;
}

function costPerSelectedUnit(perCycleCost, unit, tonsPerLoad, yardsPerLoad, cycleMinutes) {
  if (unit === 'ton') return tonsPerLoad > 0 ? perCycleCost / tonsPerLoad : 0;
  if (unit === 'yard') return yardsPerLoad > 0 ? perCycleCost / yardsPerLoad : 0;
  if (unit === 'load') return perCycleCost;
  if (unit === 'hour') return cycleMinutes > 0 ? perCycleCost / (cycleMinutes / 60) : 0;
  return 0;
}

function materialToMainUnit(materialTotal, materialUnit, mainUnit, tonsPerLoad, yardsPerLoad, cycleMinutes) {
  if (!materialUnit || !materialTotal) return 0;

  let materialPerLoad = 0;

  if (materialUnit === 'ton') materialPerLoad = materialTotal * tonsPerLoad;
  if (materialUnit === 'yard') materialPerLoad = materialTotal * yardsPerLoad;
  if (materialUnit === 'load') materialPerLoad = materialTotal;

  return costPerSelectedUnit(materialPerLoad, mainUnit, tonsPerLoad, yardsPerLoad, cycleMinutes);
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

    if (!input.unit) {
      return NextResponse.json(
        { error: 'Select a billing unit before calculating.' },
        { status: 400 }
      );
    }

    const loaded = await getRoute(input.pickup, input.dump, apiKey);
    const ret = await getRoute(input.dump, input.pickup, apiKey);

    const loadedMultiplier = toNumber(input.loadedMultiplier, 1.15);
    const emptyMultiplier = toNumber(input.emptyMultiplier, 1.05);
    const loadMinutes = toNumber(input.loadMinutes, 15);
    const dumpMinutes = toNumber(input.dumpMinutes, 7);
    const mpg = toNumber(input.mpg, 6);
    const fuelPrice = toNumber(input.fuelPrice, 0);
    const tonsPerLoad = toNumber(input.tonsPerLoad, 21);
    const yardsPerLoad = toNumber(input.yardsPerLoad, 18);
    const haulMarkup = toNumber(input.haulMarkup, 0);
    const materialFee = toNumber(input.materialFee, 0);
    const materialMarkup = toNumber(input.materialMarkup, 0);
    const targetHourly = toNumber(input.targetHourly, DEFAULT_TARGET_TRUCK_RATE_PER_HOUR);

    const loadedAdjusted = loaded.minutes * loadedMultiplier;
    const returnAdjusted = ret.minutes * emptyMultiplier;

    const cycleMinutes = loadMinutes + loadedAdjusted + dumpMinutes + returnAdjusted;
    const roundTripMiles = loaded.miles + ret.miles;

    const loadCalc = calculateLoads(
      input.hopStart,
      cycleMinutes,
      loadMinutes,
      loadedAdjusted,
      dumpMinutes,
      input.hopEnd
    );

    const workingHours = loadCalc.workingMinutes / 60;

    const baseHaulRate = rateFromDailyTarget({
      unit: input.unit,
      loadsPossible: loadCalc.loadsPossible,
      workingHours,
      targetHourly,
      tonsPerLoad,
      yardsPerLoad,
      cycleMinutes
    });

    const fuelCostPerCycle = mpg > 0 ? (roundTripMiles / mpg) * fuelPrice : 0;
    const tollsPerCycleTotal = 0;

    const fuelPerSelectedUnit = costPerSelectedUnit(
      fuelCostPerCycle,
      input.unit,
      tonsPerLoad,
      yardsPerLoad,
      cycleMinutes
    );

    const tollsPerSelectedUnit = 0;

    const haulRate = baseHaulRate + fuelPerSelectedUnit + tollsPerSelectedUnit;
    const billingHaulRate = haulRate + haulMarkup;

    const materialTotal = materialFee + materialMarkup;

    const materialTotalForMainUnit = materialToMainUnit(
      materialTotal,
      input.materialUnit,
      input.unit,
      tonsPerLoad,
      yardsPerLoad,
      cycleMinutes
    );

    const totalBillingRate = billingHaulRate + materialTotalForMainUnit;

    let taxableAmount = 0;

    if (input.taxApplicable === 'yes') {
      if (input.taxBasis === 'material') taxableAmount = materialTotalForMainUnit;
      if (input.taxBasis === 'whole') taxableAmount = totalBillingRate;
    }

    const taxAmount = taxableAmount * DEFAULT_TAX_RATE;
    const customerPrice = totalBillingRate + taxAmount;

    return NextResponse.json({
      loadedMiles: loaded.miles,
      returnMiles: ret.miles,
      roundTripMiles,
      googleLoadedMinutes: loaded.minutes,
      googleReturnMinutes: ret.minutes,
      adjustedLoadedMinutes: loadedAdjusted,
      adjustedReturnMinutes: returnAdjusted,
      cycleMinutes,
      loadsPossible: loadCalc.loadsPossible,
      lastDumpTime: loadCalc.lastDumpTime,
      workingHours,
      targetHourly,
      baseHaulRate,
      fuelCostPerCycle,
      fuelPerSelectedUnit,
      tollsPerCycleTotal,
      tollsPerSelectedUnit,
      haulRate,
      haulMarkup,
      billingHaulRate,
      materialFee,
      materialMarkup,
      materialTotal,
      materialTotalForMainUnit,
      totalBillingRate,
      taxAmount,
      customerPrice,
      note:
        'Haul Rate is based on hourly rate, loads possible inside H.O.P., selected unit, fuel, and current truck slowdown factors. Tolls are temporarily disabled while Routes API permissions are verified.'
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Unknown server error' },
      { status: 500 }
    );
  }
}