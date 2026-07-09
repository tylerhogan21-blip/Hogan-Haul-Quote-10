'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';

const companyDefaults = {
  targetHourly: 75,
  fuelPrice: 3.85,
  loadMinutes: 15,
  dumpMinutes: 7,
  loadedMultiplier: 1.15,
  emptyMultiplier: 1.05,
  mpg: 6,
  tonsPerLoad: 21,
  yardsPerLoad: 18
};

const quoteDefaults = {
  customerName: '',
  jobName: '',
  jobDate: '',
  jobsiteAddress: '',
  importExport: '',
  pickup: '',
  dump: '',
  unit: '',
  materialUnit: '',
  materialFee: 0,
  materialMarkup: 0,
  haulMarkup: 0,
  taxApplicable: '',
  taxBasis: '',
  hopStart: '07:00',
  hopEnd: '16:00',
  ...companyDefaults
};

const savedCompanyFields = [
  'targetHourly',
  'fuelPrice',
  'loadMinutes',
  'dumpMinutes',
  'loadedMultiplier',
  'emptyMultiplier',
  'mpg',
  'tonsPerLoad',
  'yardsPerLoad'
];

function money(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return '$0.00';
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function num(n, digits = 1) {
  const value = Number(n);
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function unitLabel(unit) {
  if (unit === 'ton') return '/ ton';
  if (unit === 'yard') return '/ yard';
  if (unit === 'load') return '/ load';
  if (unit === 'hour') return '/ hr';
  return '';
}

export default function Home() {
  const jobsiteRef = useRef(null);
  const pickupRef = useRef(null);
  const dumpRef = useRef(null);

  const [form, setForm] = useState(quoteDefaults);
  const [ready, setReady] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);
  const [autocompleteReady, setAutocompleteReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('hoganLiteCompanySettings') || '{}');
      setForm({ ...quoteDefaults, ...saved });
    } catch {
      setForm(quoteDefaults);
    }

    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;

    const settingsToSave = {};
    savedCompanyFields.forEach(field => {
      settingsToSave[field] = form[field];
    });

    localStorage.setItem('hoganLiteCompanySettings', JSON.stringify(settingsToSave));
  }, [form, ready]);

  useEffect(() => {
  if (!mapsReady) return;

  const timer = setTimeout(() => {
    if (!window.google?.maps?.places?.Autocomplete) return;
    if (!jobsiteRef.current || !pickupRef.current || !dumpRef.current) return;

    const options = {
      fields: ['formatted_address', 'name'],
      componentRestrictions: { country: 'us' }
    };

    function attach(ref, field) {
      const autocomplete = new window.google.maps.places.Autocomplete(ref.current, options);

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        const address = place.formatted_address || place.name || ref.current.value;
        setField(field, address);
      });
    }

    attach(jobsiteRef, 'jobsiteAddress');
    attach(pickupRef, 'pickup');
    attach(dumpRef, 'dump');

    setAutocompleteReady(true);
  }, 500);

  return () => clearTimeout(timer);
}, [mapsReady]);

  function setField(name, value) {
    setForm(prev => {
      const next = { ...prev, [name]: value };

      if (name === 'jobsiteAddress') {
        if (prev.importExport === 'import') next.dump = value;
        if (prev.importExport === 'export') next.pickup = value;
      }

      return next;
    });
  }

  function handleImportExport(value) {
    setForm(prev => {
      const next = { ...prev, importExport: value };

      if (value === 'import' && prev.jobsiteAddress) next.dump = prev.jobsiteAddress;
      if (value === 'export' && prev.jobsiteAddress) next.pickup = prev.jobsiteAddress;

      return next;
    });
  }

  function handleUnit(value) {
    setForm(prev => ({
      ...prev,
      unit: value,
      materialUnit: value === 'hour' ? '' : value
    }));
  }

  function pickCompanySettings(prev) {
    const settings = {};
    savedCompanyFields.forEach(field => {
      settings[field] = prev[field];
    });
    return settings;
  }

  function newQuoteSameJob() {
    setResult(null);
    setError('');
    setCopyStatus('');

    setForm(prev => ({
      ...quoteDefaults,
      ...pickCompanySettings(prev),
      customerName: prev.customerName,
      jobName: prev.jobName,
      jobDate: prev.jobDate,
      jobsiteAddress: prev.jobsiteAddress
    }));
  }

  function freshStart() {
    setResult(null);
    setError('');
    setCopyStatus('');

    setForm(prev => ({
      ...quoteDefaults,
      ...pickCompanySettings(prev)
    }));
  }

  async function calculate(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    setCopyStatus('');
    setLoading(true);

    try {
      const res = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Could not calculate quote.');

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

  const customerText = useMemo(() => {
    if (!result) return '';

    return [
      `Thanks for reaching out.`,
      `The price${form.jobName ? ` for ${form.jobName}` : ''} is ${money(result.customerPrice)} ${unitLabel(form.unit)}.`,
      form.taxApplicable === 'yes' ? `Tax included.` : null,
      `Thank you for the opportunity.`
    ].filter(Boolean).join(' ');
  }, [form, result]);

  const internalText = useMemo(() => {
    if (!result) return '';

    return [
      'HOGAN INTERNAL QUOTE',
      form.customerName ? `Customer: ${form.customerName}` : null,
      form.jobName ? `Job: ${form.jobName}` : null,
      form.jobDate ? `Job Date: ${form.jobDate}` : null,
      form.jobsiteAddress ? `Jobsite: ${form.jobsiteAddress}` : null,
      form.importExport ? `Type: ${form.importExport}` : null,
      `Pickup: ${form.pickup}`,
      `Dump: ${form.dump}`,
      `Unit: ${form.unit}`,
      `Haul Rate: ${money(result.haulRate)} ${unitLabel(form.unit)}`,
      `Haul Markup: ${money(form.haulMarkup)} ${unitLabel(form.unit)}`,
      `Billing Haul Rate: ${money(result.billingHaulRate)} ${unitLabel(form.unit)}`,
      `Material Total: ${money(result.materialTotalForMainUnit)} ${unitLabel(form.unit)}`,
      `Total Billing Rate: ${money(result.totalBillingRate)} ${unitLabel(form.unit)}`,
      `Tax: ${money(result.taxAmount)}`,
      `Customer Price: ${money(result.customerPrice)} ${unitLabel(form.unit)}`,
      `Round Trip Miles: ${num(result.roundTripMiles)} mi`,
      `Cycle Time: ${num(result.cycleMinutes)} min`,
      `Loads Per Day: ${num(result.loadsPossible, 0)}`,
      `Last Load Dumped: ${result.lastDumpTime || '—'}`
    ].filter(Boolean).join('\n');
  }, [form, result]);

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(`${label} copied.`);
    } catch {
      setCopyStatus('Could not copy.');
    }
  }

  return (
    <>
     {googleKey && (
  <Script
    src={`https://maps.googleapis.com/maps/api/js?key=${googleKey}&v=weekly&libraries=places`}
    strategy="afterInteractive"
    onLoad={() => setMapsReady(true)}
  />
)}

      <main className="page">
        <div className="container">
          <div className="header">
            <h1>HOGAN Lite Calculator</h1>
            <p>Fast daily-use quote calculator for Hogan Haul.</p>
            <p className="small">
              Maps: {mapsReady ? 'Ready' : 'Loading'} | Autocomplete: {autocompleteReady ? 'Ready' : 'Loading'}
            </p>
          </div>

          <div className="grid">
            <form className="card" onSubmit={calculate}>
              <h2 className="sectionTitle">Information</h2>

              <label>Customer Name</label>
              <input value={form.customerName} onChange={e => setField('customerName', e.target.value)} />

              <label>Job Name</label>
              <input value={form.jobName} onChange={e => setField('jobName', e.target.value)} />

              <label>Job Date</label>
              <input type="date" value={form.jobDate} onChange={e => setField('jobDate', e.target.value)} />

              <label>Jobsite Address *</label>
              <input
                ref={jobsiteRef}
                value={form.jobsiteAddress}
                onChange={e => setField('jobsiteAddress', e.target.value)}
                required
                autoComplete="off"
                placeholder="Enter jobsite address"
              />

              <label>Import / Export</label>
              <select value={form.importExport} onChange={e => handleImportExport(e.target.value)}>
                <option value="">Select</option>
                <option value="import">Import</option>
                <option value="export">Export</option>
              </select>

              <label>Pickup Address *</label>
              <input
                ref={pickupRef}
                value={form.pickup}
                onChange={e => setField('pickup', e.target.value)}
                required
                autoComplete="off"
                placeholder="Enter pickup address"
              />

              <label>Dump Address *</label>
              <input
                ref={dumpRef}
                value={form.dump}
                onChange={e => setField('dump', e.target.value)}
                required
                autoComplete="off"
                placeholder="Enter dump address"
              />

              <div className="row">
                <div>
                  <label>H.O.P. Start</label>
                  <input type="time" value={form.hopStart} onChange={e => setField('hopStart', e.target.value)} />
                </div>
                <div>
                  <label>H.O.P. End</label>
                  <input type="time" value={form.hopEnd} onChange={e => setField('hopEnd', e.target.value)} />
                </div>
              </div>

              <h2 className="sectionTitle">Haul Section</h2>

              <label>Unit Selector *</label>
              <select value={form.unit} onChange={e => handleUnit(e.target.value)} required>
                <option value="">Select Unit</option>
                <option value="ton">Per Ton</option>
                <option value="yard">Per Yard</option>
                <option value="load">Per Load</option>
                <option value="hour">Per Hour</option>
              </select>

              <Metric label={`Haul Rate ${unitLabel(form.unit)}`} value={result ? money(result.haulRate) : 'Calculated'} />

              <label>Haul Markup {unitLabel(form.unit)}</label>
              <input type="number" step="0.01" value={form.haulMarkup} onChange={e => setField('haulMarkup', Number(e.target.value))} />

              <Metric label={`Billing Haul Rate ${unitLabel(form.unit)}`} value={result ? money(result.billingHaulRate) : 'Calculated'} />

              <details className="collapse">
                <summary>Material Section</summary>

                <label>Material Unit</label>
                <select value={form.materialUnit} onChange={e => setField('materialUnit', e.target.value)}>
                  <option value="">Select Material Unit</option>
                  <option value="ton">Per Ton</option>
                  <option value="yard">Per Yard</option>
                  <option value="load">Per Load</option>
                </select>

                <label>Material / Dump Fee {unitLabel(form.materialUnit)}</label>
                <input type="number" step="0.01" value={form.materialFee} onChange={e => setField('materialFee', Number(e.target.value))} />

                <label>Material Markup {unitLabel(form.materialUnit)}</label>
                <input type="number" step="0.01" value={form.materialMarkup} onChange={e => setField('materialMarkup', Number(e.target.value))} />

                <Metric label={`Total Material / Dump Fee ${unitLabel(form.unit)}`} value={result ? money(result.materialTotalForMainUnit) : 'Calculated'} />
              </details>

              <h2 className="sectionTitle">Customer Price</h2>

              <Metric label={`Total Billing Rate ${unitLabel(form.unit)}`} value={result ? money(result.totalBillingRate) : 'Calculated'} />

              <div className="row">
                <div>
                  <label>Tax Applicable</label>
                  <select value={form.taxApplicable} onChange={e => setField('taxApplicable', e.target.value)}>
                    <option value="">Select</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                <div>
                  <label>Tax Basis</label>
                  <select value={form.taxBasis} onChange={e => setField('taxBasis', e.target.value)}>
                    <option value="">Select</option>
                    <option value="material">Material Only</option>
                    <option value="whole">Entire Bill</option>
                  </select>
                </div>
              </div>

              <div className="customerPriceBox">
                <div className="label">Customer Price w/ Tax</div>
                <div className="customerPriceValue">
                  {result ? `${money(result.customerPrice)} ${unitLabel(form.unit)}` : 'Calculated'}
                </div>
              </div>

              <details className="collapse">
                <summary>Rate Engine</summary>

                <label>Hourly Rate</label>
                <input type="number" step="0.01" value={form.targetHourly} onChange={e => setField('targetHourly', Number(e.target.value))} />

                <label>Fuel $ / Gal</label>
                <input type="number" step="0.01" value={form.fuelPrice} onChange={e => setField('fuelPrice', Number(e.target.value))} />

                <Metric label={`Tolls Per Cycle ${unitLabel(form.unit)}`} value={result ? money(result.tollsPerSelectedUnit) : 'Calculated'} />
                <Metric label="Loads Per Day" value={result ? num(result.loadsPossible, 0) : 'Calculated'} />
                <Metric label="Last Load Dumped Time" value={result?.lastDumpTime || 'Calculated'} />

                <div className="row">
                  <div>
                    <label>Load Minutes</label>
                    <input type="number" value={form.loadMinutes} onChange={e => setField('loadMinutes', Number(e.target.value))} />
                  </div>
                  <div>
                    <label>Dump Minutes</label>
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

                <label>MPG</label>
                <input type="number" step="0.1" value={form.mpg} onChange={e => setField('mpg', Number(e.target.value))} />

                <label>Tons / Load</label>
                <input type="number" value={form.tonsPerLoad} onChange={e => setField('tonsPerLoad', Number(e.target.value))} />

                <label>Yards / Load</label>
                <input type="number" value={form.yardsPerLoad} onChange={e => setField('yardsPerLoad', Number(e.target.value))} />
              </details>

              <button type="submit" disabled={loading}>
                {loading ? 'Calculating...' : 'Calculate Quote'}
              </button>

              {error && <div className="error">{error}</div>}
            </form>

            <section className="card">
              <h2 className="sectionTitle">Route / Quote</h2>

              {!result && <p className="small">Enter quote details, then calculate.</p>}

              {result && (
                <div className="results">
                  <Metric label="Haul Rate" value={`${money(result.haulRate)} ${unitLabel(form.unit)}`} />
                  <Metric label="Billing Haul Rate" value={`${money(result.billingHaulRate)} ${unitLabel(form.unit)}`} />
                  <Metric label="Customer Price" value={`${money(result.customerPrice)} ${unitLabel(form.unit)}`} />
                  <Metric label="Round Trip Miles" value={`${num(result.roundTripMiles)} mi`} />
                  <Metric label="Cycle Time" value={`${num(result.cycleMinutes)} min`} />
                  <Metric label="Loads Per Day" value={num(result.loadsPossible, 0)} />
                  <Metric label="Last Load Dumped" value={result.lastDumpTime || '—'} />
                </div>
              )}

              {mapUrl && (
                <div className="mapCard">
                  <h3>Route Map</h3>
                  <iframe title="Route Map" src={mapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                </div>
              )}

              <a className="actionLink" href={result ? `sms:?&body=${encodeURIComponent(customerText)}` : '#'}>Text Customer</a>
              <a className="actionLink" href={result ? `sms:?&body=${encodeURIComponent(internalText)}` : '#'}>Text Internal</a>
              <button type="button" disabled={!result} onClick={() => copyText(internalText, 'Internal quote')}>Copy Internal</button>
              <button type="button" onClick={newQuoteSameJob}>New Quote / Same Job</button>
              <button type="button" onClick={freshStart}>Fresh Start</button>

              {copyStatus && <p className="small">{copyStatus}</p>}
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