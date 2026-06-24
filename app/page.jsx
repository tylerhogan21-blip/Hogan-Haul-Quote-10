'use client';

import { useState } from 'react';

const defaults = {
  pickup: '',
  dump: '',
  startTime: '07:00',
  cutoffTime: '16:00',
  hourlyRate: 175,
  fuelPrice: 3.85,
  markupPercent: 15,
  tollsManual: 0,
  loadMinutes: 15,
  dumpMinutes: 7,
  loadedMultiplier: 1.15,
  emptyMultiplier: 1.05,
  mpg: 6,
  tonsPerLoad: 21,
  yardsPerLoad: 18
};

function money(n) {
  if (!Number.isFinite(n)) return '$0.00';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}
function num(n, digits = 1) {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}
function minutesToClock(startTime, minutes) {
  const [h, m] = startTime.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  d.setMinutes(d.getMinutes() + Math.round(minutes));
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function Home() {
  const [form, setForm] = useState(defaults);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  function setField(name, value) {
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function calculate(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not calculate quote');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <div className="container">
        <div className="header">
          <h1>Hogan Haul Quote</h1>
          <p>Google Maps mileage + dump truck cycle-time pricing for the whole company.</p>
        </div>
        <div className="grid">
          <form className="card" onSubmit={calculate}>
            <h2 className="sectionTitle">Quote Inputs</h2>
            <label>Pickup Address</label>
            <input value={form.pickup} onChange={e => setField('pickup', e.target.value)} placeholder="Quarry / pit / pickup" required />
            <label>Dump Address</label>
            <input value={form.dump} onChange={e => setField('dump', e.target.value)} placeholder="Jobsite / dump location" required />
            <div className="row">
              <div><label>Start Time</label><input type="time" value={form.startTime} onChange={e => setField('startTime', e.target.value)} /></div>
              <div><label>No Dumps After</label><input type="time" value={form.cutoffTime} onChange={e => setField('cutoffTime', e.target.value)} /></div>
            </div>
            <div className="row">
              <div><label>Hourly Truck Rate</label><input type="number" value={form.hourlyRate} onChange={e => setField('hourlyRate', Number(e.target.value))} /></div>
              <div><label>Fuel $ / Gal</label><input type="number" step="0.01" value={form.fuelPrice} onChange={e => setField('fuelPrice', Number(e.target.value))} /></div>
            </div>
            <div className="row">
              <div><label>Markup %</label><input type="number" value={form.markupPercent} onChange={e => setField('markupPercent', Number(e.target.value))} /></div>
              <div><label>Manual Tolls $</label><input type="number" step="0.01" value={form.tollsManual} onChange={e => setField('tollsManual', Number(e.target.value))} /></div>
            </div>
            <div className="row">
              <div><label>Load Min</label><input type="number" value={form.loadMinutes} onChange={e => setField('loadMinutes', Number(e.target.value))} /></div>
              <div><label>Dump Min</label><input type="number" value={form.dumpMinutes} onChange={e => setField('dumpMinutes', Number(e.target.value))} /></div>
            </div>
            <div className="row">
              <div><label>Loaded Slowdown</label><input type="number" step="0.01" value={form.loadedMultiplier} onChange={e => setField('loadedMultiplier', Number(e.target.value))} /></div>
              <div><label>Empty Slowdown</label><input type="number" step="0.01" value={form.emptyMultiplier} onChange={e => setField('emptyMultiplier', Number(e.target.value))} /></div>
            </div>
            <div className="row">
              <div><label>MPG</label><input type="number" step="0.1" value={form.mpg} onChange={e => setField('mpg', Number(e.target.value))} /></div>
              <div><label>Tons / Load</label><input type="number" value={form.tonsPerLoad} onChange={e => setField('tonsPerLoad', Number(e.target.value))} /></div>
            </div>
            <label>Yards / Load</label>
            <input type="number" value={form.yardsPerLoad} onChange={e => setField('yardsPerLoad', Number(e.target.value))} />
            <button type="submit" disabled={loading}>{loading ? 'Calculating...' : 'Calculate Quote'}</button>
            {error && <div className="error">{error}</div>}
            <p className="small">Defaults: 15 min load, 7 min dump, 6 MPG, 21 tons/load, 18 yards/load, 1.15 loaded slowdown, 1.05 empty slowdown.</p>
          </form>

          <section className="card">
            <h2 className="sectionTitle">Results</h2>
            {!result && <p className="small">Enter a pickup and dump address, then calculate. The app will call Google Routes API server-side using your Vercel environment variable.</p>}
            {result && (
              <div className="results">
                <Metric label="Loaded Miles" value={`${num(result.loadedMiles)} mi`} />
                <Metric label="Return Miles" value={`${num(result.returnMiles)} mi`} />
                <Metric label="Round Trip Miles" value={`${num(result.roundTripMiles)} mi`} />
                <Metric label="Google Loaded Time" value={`${num(result.googleLoadedMinutes)} min`} />
                <Metric label="Google Return Time" value={`${num(result.googleReturnMinutes)} min`} />
                <Metric label="Adjusted Cycle" value={`${num(result.cycleMinutes)} min`} />
                <Metric label="Loads Possible" value={num(result.loadsPossible, 0)} />
                <Metric label="Last Load Dumped" value={result.lastDumpTime || '—'} />
                <Metric label="Fuel Cost / Load" value={money(result.fuelCost)} />
                <Metric label="Tolls / Load" value={money(result.tollCost)} />
                <Metric label="Cost / Load" value={money(result.costPerLoad)} />
                <Metric label="Quote / Load" value={money(result.quotePerLoad)} />
                <Metric label="Quote / Ton" value={money(result.quotePerTon)} />
                <Metric label="Quote / Yard" value={money(result.quotePerYard)} />
                <div className="metric full"><div className="label">Route Note</div><div className="small">{result.note}</div></div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value }) {
  return <div className="metric"><div className="label">{label}</div><div className="value">{value}</div></div>;
}
