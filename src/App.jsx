import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { fetchCountryItems, fetchReadinessItems, updateCountryItemField } from './lib/mondayClient';
import { COUNTRY_BOARDS, isAffirmative } from './lib/boards';
import { Button } from './components/ui/button';

const FLAGS = { UK: '\u{1F1EC}\u{1F1E7}', IE: '\u{1F1EE}\u{1F1EA}', NL: '\u{1F1F3}\u{1F1F1}', DE: '\u{1F1E9}\u{1F1EA}', FI: '\u{1F1EB}\u{1F1EE}' };
const COUNTRY_ORDER = COUNTRY_BOARDS.map((b) => b.country);
const WEEKS_TO_SHOW = 4;

// Monday of the week containing `date`.
function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatDateWithYear(d) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Whether an install has genuinely been assigned a confirmed installer,
// vs still sitting at a "waiting to hear back" state. Per how UK/DE
// actually use this field: a real installer name (PTech, SS, ADS,
// Self Installation) means resource is allocated; anything else
// ("Waiting on confirmation from PT", "TBC", blank, a rejection) means
// it isn't yet.
function deriveResourceAllocated(installerValue) {
  if (installerValue === null || installerValue === undefined) return null; // not tracked for this country
  const v = installerValue.trim().toLowerCase();
  if (!v || v.includes('waiting') || v === 'tbc' || v.includes('changed date') || v.includes('rejected')) {
    return 'No';
  }
  return 'Yes';
}

function StatusPill({ value }) {
  if (value === null || value === undefined) {
    return <span className="text-xs text-muted-foreground">not tracked</span>;
  }
  if (value === '') {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const v = value.toLowerCase();
  const isGood = v === 'yes' || v === 'ja' || v === 'jaa' || v === 'kicked off' || v === 'delivered' || v === 'done' || v === 'not required' || v === 'received';
  const isBad = v === 'no' || v === 'nein' || v === 'nee' || v === 'not sent' || v.includes('risk') || v.includes('issue') || v.includes('cancel');
  const color = isGood ? 'hsl(var(--status-complete))' : isBad ? 'hsl(var(--destructive))' : 'hsl(var(--status-scheduled))';
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: `${color}22`, color }}>
      {value}
    </span>
  );
}

export default function App() {
  const [items, setItems] = useState(null);
  const [readinessByStoreId, setReadinessByStoreId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [countryData, readinessData] = await Promise.all([fetchCountryItems(), fetchReadinessItems()]);
      setItems(countryData);
      setReadinessByStoreId(readinessData);
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setRefetching(true);
    try {
      const [countryData, readinessData] = await Promise.all([fetchCountryItems(), fetchReadinessItems()]);
      setItems(countryData);
      setReadinessByStoreId(readinessData);
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setRefetching(false);
    }
  }

  const [savingFields, setSavingFields] = useState(new Set());

  // Optimistic edit: update the UI immediately, write to Monday in the
  // background, and roll back to the previous value if the write fails
  // rather than leaving the screen showing something that didn't save.
  async function handleFieldEdit(item, field, columnId, value) {
    const fieldKey = `${item.id}:${field}`;
    const previousValue = item[field];

    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, [field]: value } : i)));
    setSavingFields((prev) => new Set(prev).add(fieldKey));

    try {
      await updateCountryItemField(item.boardId, item.id, columnId, value);
    } catch (err) {
      console.error(err);
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, [field]: previousValue } : i)));
    } finally {
      setSavingFields((prev) => {
        const next = new Set(prev);
        next.delete(fieldKey);
        return next;
      });
    }
  }

  useEffect(() => { load(); }, []);

  const weeks = useMemo(() => {
    const thisMonday = mondayOf(new Date());
    return Array.from({ length: WEEKS_TO_SHOW }, (_, i) => {
      const start = new Date(thisMonday);
      start.setDate(start.getDate() + i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return {
        key: start.toISOString().slice(0, 10),
        start,
        end,
        label: i === 0 ? 'This Week' : i === 1 ? 'Next Week' : `WC ${formatDate(start)}`
      };
    });
  }, []);

  // Every item, enriched with its readiness-form match (by site number)
  // and bucketed into whichever week its Install Date falls in \u2014 items
  // with no date, or a date outside the visible window, are dropped.
  const weeklyData = useMemo(() => {
    if (!items || !readinessByStoreId) return null;

    return weeks.map((week) => {
      const inWeek = items.filter((item) => {
        if (!item.installDate) return false;
        const d = new Date(item.installDate);
        return d >= week.start && d <= new Date(week.end.getTime() + 24 * 60 * 60 * 1000 - 1);
      });

      const byCountry = {};
      COUNTRY_ORDER.forEach((c) => { byCountry[c] = []; });
      inWeek.forEach((item) => {
        const readiness = readinessByStoreId.get(item.name.trim());
        byCountry[item.country].push({ ...item, readiness });
      });
      Object.values(byCountry).forEach((list) => list.sort((a, b) => a.installDate.localeCompare(b.installDate)));

      return { ...week, byCountry, total: inWeek.length };
    });
  }, [items, readinessByStoreId, weeks]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading install status…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] flex items-center justify-center px-4">
        <div className="max-w-md border border-border rounded-md p-6 bg-[hsl(var(--surface-1))]">
          <div className="flex items-center gap-2 text-destructive mb-2">
            <AlertCircle className="w-5 h-5" />
            <h2 className="font-semibold">Couldn't load data</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button size="sm" onClick={load}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <header className="border-b border-border sticky top-0 bg-[hsl(var(--background))] z-10">
        <div className="px-4 sm:px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-bold">Install Status Tracker</h1>
            <p className="text-xs text-muted-foreground">
              {lastUpdated && `Updated ${lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs w-fit" onClick={refresh} disabled={refetching}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </header>

      <main className="px-4 sm:px-6 py-6 space-y-8">
        {weeklyData.map((week) => (
          <section key={week.key} className="space-y-3">
            <div className="flex items-baseline gap-3">
              <h2 className="text-xl font-bold">{week.label}</h2>
              <span className="text-sm text-muted-foreground">
                {formatDate(week.start)} – {formatDateWithYear(week.end)} · {week.total} site{week.total === 1 ? '' : 's'}
              </span>
            </div>

            {week.total === 0 ? (
              <p className="text-sm text-muted-foreground border border-border rounded-md p-4 bg-[hsl(var(--surface-1))]">No installs scheduled this week.</p>
            ) : (
              COUNTRY_ORDER.filter((c) => week.byCountry[c].length > 0).map((country) => (
                <div key={country} className="border border-border rounded-md overflow-hidden bg-[hsl(var(--surface-1))]">
                  <div className="px-4 py-2.5 bg-[hsl(var(--surface-2))] border-b border-border flex items-center gap-2">
                    <span>{FLAGS[country]}</span>
                    <h3 className="text-sm font-semibold">{country} — {week.byCountry[country].length} site{week.byCountry[country].length === 1 ? '' : 's'}</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-[hsl(var(--surface-2))] border-b border-border">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Store</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Type</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Install Day</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Kicked Off</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Permit</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">HW Status</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Resource Allocated</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Peds Delivered</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Resource Req</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Bandwidth (Mbps)</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Readiness Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {week.byCountry[country].map((site) => (
                          <tr key={site.id} className="hover:bg-[hsl(var(--surface-2))] transition-colors">
                            <td className="px-4 py-2.5 text-sm font-medium">{site.name}</td>
                            <td className="px-4 py-2.5 text-sm text-muted-foreground">{site.type || '\u2014'}</td>
                            <td className="px-4 py-2.5 text-sm text-muted-foreground">{formatDate(new Date(site.installDate))}</td>
                            <td className="px-4 py-2.5"><StatusPill value={site.kickOff} /></td>
                            <td className="px-4 py-2.5"><StatusPill value={site.accessPermits} /></td>
                            <td className="px-4 py-2.5"><StatusPill value={site.hardwareStatus} /></td>
                            <td className="px-4 py-2.5"><StatusPill value={deriveResourceAllocated(site.installer)} /></td>
                            <td className="px-4 py-2.5">
                              <StatusPill value={
                                site.readiness
                                  ? (isAffirmative(site.readiness.hasFreedomPayTerminals) ? 'Yes' : 'No')
                                  : null
                              } />
                            </td>
                            <td className="px-4 py-2.5">
                              <select
                                className="text-xs bg-transparent border border-border rounded px-1.5 py-1"
                                value={site.resourceRequested || ''}
                                onChange={(e) => handleFieldEdit(site, 'resourceRequested', site.resourceRequestedColumnId, e.target.value)}
                                disabled={savingFields.has(`${site.id}:resourceRequested`)}
                              >
                                <option value="">—</option>
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                              </select>
                            </td>
                            <td className="px-4 py-2.5">
                              <input
                                type="text"
                                className="text-xs bg-transparent border border-border rounded px-1.5 py-1 w-20"
                                defaultValue={site.bandwidth || ''}
                                onBlur={(e) => {
                                  if (e.target.value !== (site.bandwidth || '')) {
                                    handleFieldEdit(site, 'bandwidth', site.bandwidthColumnId, e.target.value);
                                  }
                                }}
                                disabled={savingFields.has(`${site.id}:bandwidth`)}
                              />
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-xs">
                              {site.readiness?.finalConfirmation || (site.readiness ? '\u2014' : 'No readiness form submitted yet')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
