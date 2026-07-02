'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

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

const savedFields = [
  'startTime',
  'cutoffTime',
  'hourlyRate',
  'fuelPrice',
  'markupPercent',
  'tollsManual',
  'loadMinutes',
  'dumpMinutes',
  'loadedMultiplier',
  'emptyMultiplier',
  'mpg',
  'tonsPerLoad',
  'yardsPerLoad'
];

function money(n) {
  if (!Number.isFinite(n)) return '$0.00';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function num(n, digits = 1) {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export default function Home() {
  const pickupContainerRef = useRef(null);
  const dumpContainerRef = useRef(null);

  const [form, setForm] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);
  const [mapsError, setMapsError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    const saved = localStorage.getItem('hoganHaulQuoteSettings');

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setForm(prev => ({
          ...prev,
          ...parsed,
          pickup: '',
          dump: ''
        }));
      } catch {
        setForm(defaults);
      }
    }

    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;

    const settingsToSave = {};
    savedFields.forEach(field => {
      settingsToSave[field] = form[field];
    });

    localStorage.setItem('hoganHaulQuoteSettings', JSON.stringify(settingsToSave));
  }, [form, ready]);

  useEffect(() => {
    if (!mapsReady) return;

    async function setupAutocomplete() {
      try {
        if (!window.google?.maps?.importLibrary) {
          setMapsError('Google Maps did not load correctly.');
          return;
        }

        const { PlaceAutocompleteElement } = await window.google.maps.importLibrary('places');

        if (!PlaceAutocompleteElement) {
          setMapsError('Google Place Autocomplete is not available.');
          return;
        }

        if (!pickupContainerRef.current || !dumpContainerRef.current) return;

        pickupContainerRef.current.innerHTML = '';
        dumpContainerRef.current.innerHTML = '';

        const pickupElement = new PlaceAutocompleteElement({
          componentRestrictions: { country: ['us'] }
        });

        const dumpElement = new PlaceAutocompleteElement({
          componentRestrictions: { country: ['us'] }
        });

        pickupElement.setAttribute('placeholder', 'Start typing pickup address');
        dumpElement.setAttribute('placeholder', 'Start typing dump address');

        pickupElement.classList.add('place-autocomplete');
        dumpElement.classList.add('place-autocomplete');

        pickupElement.addEventListener('gmp-select', async event => {
          const placePrediction = event.placePrediction;
          const place = placePrediction.toPlace();

          await place.fetchFields({
            fields: ['formattedAddress', 'displayName']
          });

          setField('pickup', place.formattedAddress || place.displayName || '');
        });

        dumpElement.addEventListener('gmp-select', async event => {
          const placePrediction = event.placePrediction;
          const place = placePrediction.toPlace();

          await place.fetchFields({
            fields: ['formattedAddress', 'displayName']
          });

          setField('dump', place.formattedAddress || place.displayName || '');
        });

        pickupContainerRef.current.appendChild(pickupElement);
        dumpContainerRef.current.appendChild(dumpElement);
      } catch (err) {
        setMapsError('Google address autocomplete could not be started.');
      }
    }

    setupAutocomplete();
  }, [mapsReady]);

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

      if (!res.ok) {
        throw new Error(data.error || 'Could not calculate quote');
      }

      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const mapUrl =
    result && googleKey && form.pickup && form.dump
      ? `https://www.google.com/maps/embed/v1/directions?key=${googleKey}&origin=${encodeURIComponent(
          form.pickup
        )}&destination=${encodeURIComponent(form.dump)}&mode=driving`
      : '';

  return (
    <>
      {googleKey && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${googleKey}&v=weekly&libraries=places&loading=async`}
          strategy="afterInteractive"
          onLoad={() => setMapsReady(true)}
          onError={() => setMapsError('Google Maps script failed to load.')}
        />
      )}

      <main className="page">
        <div className="container">
          <div className="header">
            <h1>Hogan Haul Quote</h1>
            <p>Google Maps mileage + dump truck cycle-time pricing for the whole company.</p>
          </div>
'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

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

const savedFields = [
  'startTime',
  'cutoffTime',
  'hourlyRate',
  'fuelPrice',
  'markupPercent',
  'tollsManual',
  'loadMinutes',
  'dumpMinutes',
  'loadedMultiplier',
  'emptyMultiplier',
  'mpg',
  'tonsPerLoad',
  'yardsPerLoad'
];

function money(n) {
  if (!Number.isFinite(n)) return '$0.00';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function num(n, digits = 1) {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export default function Home() {
  const pickupInputRef = useRef(null);
  const dumpInputRef = useRef(null);

  const [form, setForm] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    const saved = localStorage.getItem('hoganHaulQuoteSettings');

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setForm(prev => ({
          ...prev,
          ...parsed,
          pickup: '',
          dump: ''
        }));
      } catch {
        setForm(defaults);
      }
    }

    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;

    const settingsToSave = {};
    savedFields.forEach(field => {
      settingsToSave[field] = form[field];
    });

    localStorage.setItem('hoganHaulQuoteSettings', JSON.stringify(settingsToSave));
  }, [form, ready]);

  useEffect(() => {
    if (!mapsReady) return;
    if (!window.google?.maps?.places) return;
    if (!pickupInputRef.current || !dumpInputRef.current) return;

    try {
      const options = {
        fields: ['formatted_address', 'name'],
        componentRestrictions: { country: 'us' }
      };

      const pickupAutocomplete = new window.google.maps.places.Autocomplete(
        pickupInputRef.current,
        options
      );

      const dumpAutocomplete = new window.google.maps.places.Autocomplete(
        dumpInputRef.current,
        options
      );

      pickupAutocomplete.addListener('place_changed', () => {
        const place = pickupAutocomplete.getPlace();
        setField('pickup', place.formatted_address || place.name || pickupInputRef.current.value);
      });

      dumpAutocomplete.addListener('place_changed', () => {
        const place = dumpAutocomplete.getPlace();
        setField('dump', place.formatted_address || place.name || dumpInputRef.current.value);
      });
    } catch {
      // Manual address entry still works if Google autocomplete fails.
    }
  }, [mapsReady]);

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

      if (!res.ok) {
        throw new Error(data.error || 'Could not calculate quote');
      }

      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const mapUrl =
    googleKey && form.pickup && form.dump
      ? `https://www.google.com/maps/embed/v1/directions?key=${googleKey}&origin=${encodeURIComponent(
          form.pickup
        )}&destination=${encodeURIComponent(form.dump)}&mode=driving`
      : '';

  return (
    <>
      {googleKey && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${googleKey}&v=weekly&libraries=places&loading=async`}
          strategy="afterInteractive"
          onLoad={() => setMapsReady(true)}
        />
      )}

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
              <input
                ref={pickupInputRef}
                value={form.pickup}
                onChange={e => setField('pickup', e.target.value)}
                placeholder="Type pickup address"
                autoComplete="off"
                required
              />

              <label>Dump Address</label>
              <input
                ref={dumpInputRef}
                value={form.dump}
                onChange={e => setField('dump', e.target.value)}
                placeholder="Type dump address"
                autoComplete="off"
                required
              />

              <div className="row">
                <div>
                  <label>Start Time</label>
                  <input type="time" value={form.startTime} onChange={e => setField('startTime', e.target.value)} />
                </div>
                <div>
                  <label>No Dumps After</label>
                  <input type="time" value={form.cutoffTime} onChange={e => setField('cutoffTime', e.target.value)} />
                </div>
              </div>

              <div className="row">
                <div>
                  <label>Hourly Truck Rate</label>
                  <input type="number" value={form.hourlyRate} onChange={e => setField('hourlyRate', Number(e.target.value))} />
                </div>
                <div>
                  <label>Fuel $ / Gal</label>
                  <input type="number" step="0.01" value={form.fuelPrice} onChange={e => setField('fuelPrice', Number(e.target.value))} />
                </div>
              </div>

              <div className="row">
                <div>
                  <label>Markup %</label>
                  <input type="number" value={form.markupPercent} onChange={e => setField('markupPercent', Number(e.target.value))} />
                </div>
                <div>
                  <label>Manual Tolls $</label>
                  <input type="number" step="0.01" value={form.tollsManual} onChange={e => setField('tollsManual', Number(e.target.value))} />
                </div>
              </div>

              <div className="row">
                <div>
                  <label>Load Min</label>
                  <input type="number" value={form.loadMinutes} onChange={e => setField('loadMinutes', Number(e.target.value))} />
                </div>
                <div>
                  <label>Dump Min</label>
                  <input type="number" value={form.dumpMinutes} onChange={e => setField('dumpMinutes', Number(e.target.value))} />
                </div>
              </div>

              <div className="row">
                <div>
                  <label>Loaded Slowdown</label>
                  <input type="number" step="0.01" value={form.loadedMultiplier} onChange={e => setField('loadedMultiplier', Number(e.target.value))} />
                </div>
                <div>
                  <label>Empty Slowdown</label>
                  <input type="number" step="0.01" value={form.emptyMultiplier} onChange={e => setField('emptyMultiplier', Number(e.target.value))} />
                </div>
              </div>

              <div className="row">
                <div>
                  <label>MPG</label>
                  <input type="number" step="0.1" value={form.mpg} onChange={e => setField('mpg', Number(e.target.value))} />
                </div>
                <div>
                  <label>Tons / Load</label>
                  <input type="number" value={form.tonsPerLoad} onChange={e => setField('tonsPerLoad', Number(e.target.value))} />
                </div>
              </div>

              <label>Yards / Load</label>
              <input type="number" value={form.yardsPerLoad} onChange={e => setField('yardsPerLoad', Number(e.target.value))} />

              <button type="submit" disabled={loading}>
                {loading ? 'Calculating...' : 'Calculate Quote'}
              </button>

              {error && <div className="error">{error}</div>}

              <p className="small">
                Your rate settings are saved on this device. Pickup and dump addresses reset for each new quote.
              </p>
            </form>

            <section className="card">
              <h2 className="sectionTitle">Results</h2>

              {!result && <p className="small">Enter a pickup and dump address, then calculate.</p>}

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

                  <div className="metric full">
                    <div className="label">Route Note</div>
                    <div className="small">{result.note}</div>
                  </div>
                </div>
              )}

              {mapUrl && (
                <div className="mapCard">
                  <h3>Route Map</h3>
                  <iframe
                    title="Pickup to dump route map"
                    src={mapUrl}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
          {!googleKey && (
            <div className="warning">
              Address suggestions and map are off because NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured.
            </div>
          )}


          <div className="grid">
            <form className="card" onSubmit={calculate}>
              <h2 className="sectionTitle">Quote Inputs</h2>

              <label>Pickup Address</label>
              <div ref={pickupContainerRef} className="autocompleteBox" />
              {form.pickup && <div className="selectedAddress">{form.pickup}</div>}

              <label>Dump Address</label>
              <div ref={dumpContainerRef} className="autocompleteBox" />
              {form.dump && <div className="selectedAddress">{form.dump}</div>}

              <div className="row">
                <div>
                  <label>Start Time</label>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={e => setField('startTime', e.target.value)}
                  />
                </div>
                <div>
                  <label>No Dumps After</label>
                  <input
                    type="time"
                    value={form.cutoffTime}
                    onChange={e => setField('cutoffTime', e.target.value)}
                  />
                </div>
              </div>

              <div className="row">
                <div>
                  <label>Hourly Truck Rate</label>
                  <input
                    type="number"
                    value={form.hourlyRate}
                    onChange={e => setField('hourlyRate', Number(e.target.value))}
                  />
                </div>
                <div>
                  <label>Fuel $ / Gal</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.fuelPrice}
                    onChange={e => setField('fuelPrice', Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="row">
                <div>
                  <label>Markup %</label>
                  <input
                    type="number"
                    value={form.markupPercent}
                    onChange={e => setField('markupPercent', Number(e.target.value))}
                  />
                </div>
                <div>
                  <label>Manual Tolls $</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.tollsManual}
                    onChange={e => setField('tollsManual', Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="row">
                <div>
                  <label>Load Min</label>
                  <input
                    type="number"
                    value={form.loadMinutes}
                    onChange={e => setField('loadMinutes', Number(e.target.value))}
                  />
                </div>
                <div>
                  <label>Dump Min</label>
                  <input
                    type="number"
                    value={form.dumpMinutes}
                    onChange={e => setField('dumpMinutes', Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="row">
                <div>
                  <label>Loaded Slowdown</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.loadedMultiplier}
                    onChange={e => setField('loadedMultiplier', Number(e.target.value))}
                  />
                </div>
                <div>
                  <label>Empty Slowdown</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.emptyMultiplier}
                    onChange={e => setField('emptyMultiplier', Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="row">
                <div>
                  <label>MPG</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.mpg}
                    onChange={e => setField('mpg', Number(e.target.value))}
                  />
                </div>
                <div>
                  <label>Tons / Load</label>
                  <input
                    type="number"
                    value={form.tonsPerLoad}
                    onChange={e => setField('tonsPerLoad', Number(e.target.value))}
                  />
                </div>
              </div>

              <label>Yards / Load</label>
              <input
                type="number"
                value={form.yardsPerLoad}
                onChange={e => setField('yardsPerLoad', Number(e.target.value))}
              />

              <button type="submit" disabled={loading}>
                {loading ? 'Calculating...' : 'Calculate Quote'}
              </button>

              {error && <div className="error">{error}</div>}

              <p className="small">
                Your rate settings are saved on this device. Pickup and dump addresses reset for each new quote.
              </p>
            </form>

            <section className="card">
              <h2 className="sectionTitle">Results</h2>

              {!result && (
                <p className="small">
                  Enter a pickup and dump address, then calculate.
                </p>
              )}

              {result && (
                <>
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

                    <div className="metric full">
                      <div className="label">Route Note</div>
                      <div className="small">{result.note}</div>
                    </div>
                  </div>

                  {mapUrl && (
                    <div className="mapCard">
                      <h3>Route Map</h3>
                      <iframe
                        title="Pickup to dump route map"
                        src={mapUrl}
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}