import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, AlertCircle, AlertTriangle, Maximize2, Minimize2, Download, PieChart } from 'lucide-react';
import { fetchCountryItems, fetchReadinessItems, updateCountryItemField } from './lib/mondayClient';
import { translateTexts } from './lib/translate';
import { COUNTRY_BOARDS, READINESS_BOARDS, isAffirmative, classifyInstallOutcome } from './lib/boards';
import { Button } from './components/ui/button';

const FLAGS = { UK: '\u{1F1EC}\u{1F1E7}', IE: '\u{1F1EE}\u{1F1EA}', NL: '\u{1F1F3}\u{1F1F1}', DE: '\u{1F1E9}\u{1F1EA}', FI: '\u{1F1EB}\u{1F1EE}' };
const COUNTRY_ORDER = COUNTRY_BOARDS.map((b) => b.country);
const COUNTRY_ACCENT = { UK: 'hsl(var(--chart-1))', IE: 'hsl(var(--chart-2))', NL: 'hsl(var(--chart-3))', DE: 'hsl(var(--chart-4))', FI: 'hsl(var(--chart-5))' };
const COUNTRIES_WITH_READINESS_BOARD = new Set(READINESS_BOARDS.map((b) => b.country));
const WEEKS_TO_SHOW = 4;
const SUMMARY_TAB_KEY = '__summary__';

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

// A site is only ever flagged "at risk" while its outcome is still
// pending (an already-resolved success or issue doesn't need a
// before-the-fact warning) and its Install Day is imminent (today,
// tomorrow, or the day after) \u2014 flagging something 3 weeks out as "at
// risk" the same way as something happening tomorrow would just be
// noise. Three independent triggers, any one of which is enough:
// Kick Off still reads as not-yet-sent, Resource Requested was never
// set, or (for the 3 countries with a readiness form board) no
// franchisee submission exists at all yet.
function isAtRisk(site, now) {
  if (!site.installDate) return false;
  if (classifyInstallOutcome(site.installPhase) !== 'pending') return false;
  const installDate = new Date(site.installDate);
  const daysUntil = Math.ceil((installDate - now) / (1000 * 60 * 60 * 24));
  if (daysUntil < 0 || daysUntil > 2) return false;

  const kickOffNotReady = /not|waiting/i.test(site.kickOff || '');
  const resourceMissing = !site.resourceRequested;
  const noReadinessForm = COUNTRIES_WITH_READINESS_BOARD.has(site.country) && !site.readiness;
  return kickOffNotReady || resourceMissing || noReadinessForm;
}

function outcomeRowStyle(outcome) {
  if (outcome === 'success') return { backgroundColor: 'hsl(var(--status-complete) / 0.12)' };
  if (outcome === 'issue') return { backgroundColor: 'hsl(var(--destructive) / 0.12)' };
  return undefined;
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTabKey, setActiveTabKey] = useState(null);
  const [countryFilter, setCountryFilter] = useState('all');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [countryData, readinessData] = await Promise.all([fetchCountryItems(), fetchReadinessItems()]);
      setItems(countryData);
      setReadinessByStoreId(readinessData);
      setLastUpdated(new Date());
      translateGermanNotes(readinessData);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Translation is a progressive enhancement, not a blocking step \u2014 the
  // German notes are already shown as soon as the main fetch completes;
  // this quietly swaps in English once it comes back, or leaves the
  // German text in place if the translation call fails for any reason.
  async function translateGermanNotes(readinessData) {
    const toTranslate = [];
    readinessData.forEach((item, storeId) => {
      if (item.country === 'DE' && item.finalConfirmation && !item.finalConfirmationEn) {
        toTranslate.push(storeId);
      }
    });
    if (toTranslate.length === 0) return;

    try {
      const translations = await translateTexts(
        toTranslate.map((storeId) => readinessData.get(storeId).finalConfirmation),
        'de'
      );
      setReadinessByStoreId((prev) => {
        const next = new Map(prev);
        toTranslate.forEach((storeId, i) => {
          const item = next.get(storeId);
          if (item) next.set(storeId, { ...item, finalConfirmationEn: translations[i] });
        });
        return next;
      });
    } catch (err) {
      console.error('Translation failed, showing original German text:', err);
    }
  }

  async function refresh() {
    setRefetching(true);
    try {
      const [countryData, readinessData] = await Promise.all([fetchCountryItems(), fetchReadinessItems()]);
      setItems(countryData);
      setReadinessByStoreId(readinessData);
      setLastUpdated(new Date());
      translateGermanNotes(readinessData);
    } catch (err) {
      console.error(err);
    } finally {
      setRefetching(false);
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  function timeAgo(date) {
    if (!date) return '';
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
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

  useEffect(() => {
    function handleChange() { setIsFullscreen(Boolean(document.fullscreenElement)); }
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

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
    const now = new Date();

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
        const enriched = { ...item, readiness };
        byCountry[item.country].push({
          ...enriched,
          outcome: classifyInstallOutcome(enriched.installPhase),
          atRisk: isAtRisk(enriched, now)
        });
      });
      Object.values(byCountry).forEach((list) => list.sort((a, b) => a.installDate.localeCompare(b.installDate)));

      return { ...week, byCountry, total: inWeek.length };
    });
  }, [items, readinessByStoreId, weeks]);

  // Default to the first week once data has actually loaded.
  useEffect(() => {
    if (weeklyData && !activeTabKey) {
      setActiveTabKey(weeklyData[0].key);
    }
  }, [weeklyData, activeTabKey]);

  // Overview stats across every visible week combined \u2014 a single week's
  // handful of sites isn't a meaningful sample on its own, so the summary
  // looks at the whole visible horizon instead.
  const summaryStats = useMemo(() => {
    if (!weeklyData) return null;
    const all = weeklyData.flatMap((w) => COUNTRY_ORDER.flatMap((c) => w.byCountry[c]));
    const counts = { success: 0, issue: 0, pending: 0 };
    all.forEach((s) => { counts[s.outcome] += 1; });
    const total = all.length;
    const pct = (n) => (total > 0 ? Math.round((n / total) * 100) : 0);
    return { total, counts, pct };
  }, [weeklyData]);

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

  const isSummaryActive = activeTabKey === SUMMARY_TAB_KEY;
  const activeWeek = !isSummaryActive ? (weeklyData.find((w) => w.key === activeTabKey) || weeklyData[0]) : null;

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <header className="border-b border-border px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <img src="/Vita Mojo_Primary_Dark.png" alt="Vita Mojo" className="h-8 w-auto" />
            <div className="h-8 w-px bg-border" />
            <img src="/Subway.png" alt="Subway" className="h-8 w-auto" />
            <div className="h-8 w-px bg-border" />
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight leading-tight">Install Status Tracker</h1>
              <p className="text-xs text-muted-foreground">
                Burndown call prep {lastUpdated && `\u00b7 Updated ${timeAgo(lastUpdated)}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 no-print">
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={toggleFullscreen} title={isFullscreen ? 'Exit full screen' : 'Full screen'}>
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs w-fit" onClick={refresh} disabled={refetching}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs w-fit" onClick={() => window.print()}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Download PDF
            </Button>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 py-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex flex-wrap gap-2">
            {weeklyData.map((week) => (
              <button
                key={week.key}
                onClick={() => setActiveTabKey(week.key)}
                className="px-4 py-2.5 rounded-md border text-sm font-medium transition-colors"
                style={{
                  borderColor: week.key === activeTabKey ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                  backgroundColor: week.key === activeTabKey ? 'hsl(var(--primary) / 0.1)' : 'hsl(var(--surface-1))'
                }}
              >
                {week.label}
                <span className="ml-2 text-xs text-muted-foreground">({week.total})</span>
              </button>
            ))}
            <button
              onClick={() => setActiveTabKey(SUMMARY_TAB_KEY)}
              className="px-4 py-2.5 rounded-md border text-sm font-medium transition-colors inline-flex items-center gap-1.5"
              style={{
                borderColor: isSummaryActive ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                backgroundColor: isSummaryActive ? 'hsl(var(--primary) / 0.1)' : 'hsl(var(--surface-1))'
              }}
            >
              <PieChart className="w-3.5 h-3.5" />
              Summary
            </button>
          </div>

          {!isSummaryActive && (
            <div className="flex gap-1.5">
              {['all', ...COUNTRY_ORDER].map((c) => (
                <button
                  key={c}
                  onClick={() => setCountryFilter(c)}
                  className="px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors"
                  style={{
                    borderColor: countryFilter === c ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                    backgroundColor: countryFilter === c ? 'hsl(var(--primary) / 0.1)' : 'hsl(var(--surface-1))'
                  }}
                >
                  {c === 'all' ? 'All' : `${FLAGS[c]} ${c}`}
                </button>
              ))}
            </div>
          )}
        </div>

        {isSummaryActive ? (
          <section className="space-y-4">
            <div className="flex items-baseline gap-3">
              <h2 className="text-xl font-bold">Programme Summary</h2>
              <span className="text-sm text-muted-foreground">
                Across all {WEEKS_TO_SHOW} visible weeks · {summaryStats.total} site{summaryStats.total === 1 ? '' : 's'}
              </span>
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              {[
                { label: 'Complete / Live', key: 'success', color: 'hsl(var(--status-complete))' },
                { label: 'Issue / Revisit', key: 'issue', color: 'hsl(var(--destructive))' },
                { label: 'Not Installed Yet', key: 'pending', color: 'hsl(var(--status-scheduled))' }
              ].map((s) => (
                <div key={s.key} className="border border-border rounded-md p-5 bg-[hsl(var(--surface-1))]" style={{ borderTop: `3px solid ${s.color}` }}>
                  <div className="text-4xl font-bold tabular-nums" style={{ color: s.color }}>{summaryStats.pct(summaryStats.counts[s.key])}%</div>
                  <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{summaryStats.counts[s.key]} of {summaryStats.total} sites</div>
                  <div className="mt-3 h-1.5 rounded-full bg-[hsl(var(--surface-2))] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${summaryStats.pct(summaryStats.counts[s.key])}%`, backgroundColor: s.color }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="space-y-3">
            <div className="flex items-baseline gap-3">
              <h2 className="text-xl font-bold">{activeWeek.label}</h2>
              <span className="text-sm text-muted-foreground">
                {formatDate(activeWeek.start)} – {formatDateWithYear(activeWeek.end)} · {activeWeek.total} site{activeWeek.total === 1 ? '' : 's'}
              </span>
            </div>

            {activeWeek.total === 0 ? (
              <p className="text-sm text-muted-foreground border border-border rounded-md p-4 bg-[hsl(var(--surface-1))]">No installs scheduled this week.</p>
            ) : (
              COUNTRY_ORDER
                .filter((c) => activeWeek.byCountry[c].length > 0 && (countryFilter === 'all' || countryFilter === c))
                .map((country) => (
                  <div key={country} className="border border-border rounded-md overflow-hidden bg-[hsl(var(--surface-1))]" style={{ borderTop: `3px solid ${COUNTRY_ACCENT[country]}` }}>
                    <div className="px-4 py-3 bg-[hsl(var(--surface-2))] border-b border-border flex items-center gap-2.5">
                      <span className="text-3xl leading-none">{FLAGS[country]}</span>
                      <h3 className="text-base font-bold">{country} <span className="font-normal text-muted-foreground text-sm">— {activeWeek.byCountry[country].length} site{activeWeek.byCountry[country].length === 1 ? '' : 's'}</span></h3>
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
                          {activeWeek.byCountry[country].map((site) => (
                            <tr key={site.id} className="hover:brightness-110 transition-all" style={outcomeRowStyle(site.outcome)}>
                              <td className="px-4 py-2.5 text-sm font-medium">
                                <span className="inline-flex items-center gap-1.5">
                                  {site.atRisk && <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'hsl(var(--status-scheduled))' }} />}
                                  {site.name}
                                </span>
                              </td>
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
                                {site.readiness ? (
                                  site.readiness.finalConfirmation ? (
                                    <span title={site.readiness.finalConfirmationEn ? site.readiness.finalConfirmation : undefined}>
                                      {site.readiness.finalConfirmationEn || site.readiness.finalConfirmation}
                                      {site.readiness.finalConfirmationEn && (
                                        <span className="text-[10px] text-muted-foreground/70 italic ml-1">(translated)</span>
                                      )}
                                    </span>
                                  ) : '\u2014'
                                ) : 'No readiness form submitted yet'}
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
        )}
      </main>
    </div>
  );
}
