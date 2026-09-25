import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, AlertCircle, AlertTriangle, CheckCircle2, XCircle, Maximize2, Minimize2, Download, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { fetchCountryItems, fetchReadinessItems, updateCountryItemField } from './lib/mondayClient';
import { translateTexts } from './lib/translate';
import { COUNTRY_BOARDS, READINESS_BOARDS, isAffirmative, classifyInstallOutcome } from './lib/boards';
import { Button } from './components/ui/button';

const FLAGS = { UK: '\u{1F1EC}\u{1F1E7}', IE: '\u{1F1EE}\u{1F1EA}', NL: '\u{1F1F3}\u{1F1F1}', DE: '\u{1F1E9}\u{1F1EA}', FI: '\u{1F1EB}\u{1F1EE}' };
const COUNTRY_ORDER = COUNTRY_BOARDS.map((b) => b.country);
const COUNTRY_ACCENT = { UK: 'hsl(var(--chart-1))', IE: 'hsl(var(--chart-2))', NL: 'hsl(var(--chart-3))', DE: 'hsl(var(--chart-4))', FI: 'hsl(var(--chart-5))' };
const COUNTRIES_WITH_READINESS_BOARD = new Set(READINESS_BOARDS.map((b) => b.country));
// Quick-access offsets from "this week" (0). Anything beyond these is
// still reachable via the Prev/Next arrows or the date-jump picker \u2014
// this is just what gets its own always-visible button.
const QUICK_OFFSETS = [0, 1, 2, 3];

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

function weekLabelForOffset(offset, start) {
  if (offset === 0) return 'This Week';
  if (offset === 1) return 'Next Week';
  if (offset > 1) return `WC ${formatDate(start)}`;
  if (offset === -1) return 'Last Week';
  return `WC ${formatDate(start)}`;
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
// before-the-fact warning). Deliberately NOT gated by "days until
// install relative to today" \u2014 that created exactly the kind of
// inconsistency where two sites in the very same week's table, with
// the identical missing-readiness-form problem, got different visual
// treatment purely because one happened to fall a day or two closer to
// today's real-world date. Every pending site in whatever week you're
// currently viewing gets checked the same way. Either trigger is
// enough on its own: Kick Off still reads as not-yet-sent, or (for the
// 3 countries with a readiness form board) no franchisee submission
// exists at all yet.
function isAtRisk(site) {
  if (classifyInstallOutcome(site.installPhase) !== 'pending') return false;
  const kickOffNotReady = /not|waiting/i.test(site.kickOff || '');
  const noReadinessForm = COUNTRIES_WITH_READINESS_BOARD.has(site.country) && !site.readiness;
  return kickOffNotReady || noReadinessForm;
}

// "Ordered with Apex" is a specific supplier variant of the same "Ordered"
// state on the Hardware Status column — shown simply as "Ordered" here
// since the burndown call only cares that it's on order, not who from.
function displayHardwareStatus(value) {
  if ((value || '').trim().toLowerCase() === 'ordered with apex') return 'Ordered';
  return value;
}

function outcomeRowStyle(outcome) {
  if (outcome === 'success') return { backgroundColor: 'hsl(var(--status-complete) / 0.14)' };
  if (outcome === 'issue') return { backgroundColor: 'hsl(var(--destructive) / 0.14)' };
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
  const [weekOffset, setWeekOffset] = useState(0); // 0 = this week; negative = past, positive = future
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

  // The currently viewed week, purely derived from weekOffset \u2014 this can
  // point at any week at all, past or future, not just a fixed forward
  // window. Data for past weeks is already being fetched (Monday doesn't
  // delete a site just because its Install Date has passed), so viewing
  // history needs no extra fetching, just a wider view window.
  const viewedWeek = useMemo(() => {
    const thisMonday = mondayOf(new Date());
    const start = new Date(thisMonday);
    start.setDate(start.getDate() + weekOffset * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start, end, key: start.toISOString().slice(0, 10), label: weekLabelForOffset(weekOffset, start) };
  }, [weekOffset]);

  // Every item in the viewed week, enriched with its readiness-form
  // match (by site number) and its outcome/at-risk classification.
  const weekData = useMemo(() => {
    if (!items || !readinessByStoreId) return null;

    const inWeek = items.filter((item) => {
      if (!item.installDate) return false;
      const d = new Date(item.installDate);
      return d >= viewedWeek.start && d <= new Date(viewedWeek.end.getTime() + 24 * 60 * 60 * 1000 - 1);
    });

    const byCountry = {};
    COUNTRY_ORDER.forEach((c) => { byCountry[c] = []; });
    inWeek.forEach((item) => {
      const readiness = readinessByStoreId.get(item.name.trim());
      const enriched = { ...item, readiness };
      byCountry[item.country].push({
        ...enriched,
        outcome: classifyInstallOutcome(enriched.installPhase),
        atRisk: isAtRisk(enriched)
      });
    });
    Object.values(byCountry).forEach((list) => list.sort((a, b) => a.installDate.localeCompare(b.installDate)));

    return { ...viewedWeek, byCountry, total: inWeek.length };
  }, [items, readinessByStoreId, viewedWeek]);

  // Hero summary stats, scoped to ONLY the currently viewed week \u2014 not
  // an aggregate across multiple weeks. Issue/Revisit sites are broken out
  // by name so the KPI card can show exactly which sites and why, not just
  // a bare percentage \u2014 revisitCause is only ever populated for DE today
  // (the only board with a real "Revisit Cause" column on the item itself),
  // so this falls back to the site's own Install Phase label everywhere else.
  const weekSummary = useMemo(() => {
    if (!weekData) return null;
    const all = COUNTRY_ORDER.flatMap((c) => weekData.byCountry[c]);
    const counts = { success: 0, issue: 0, pending: 0 };
    all.forEach((s) => { counts[s.outcome] += 1; });
    const total = all.length;
    const pct = (n) => (total > 0 ? Math.round((n / total) * 100) : 0);
    const issueSites = all
      .filter((s) => s.outcome === 'issue')
      .map((s) => ({ id: s.id, name: s.name, country: s.country, cause: s.revisitCause || s.installPhase || 'Unspecified' }));
    return { total, counts, pct, issueSites };
  }, [weekData]);

  // Precomputed label + start date for each quick-access button, so the
  // render itself doesn't need to juggle Date mutation inline.
  const quickWeeks = useMemo(() => {
    const thisMonday = mondayOf(new Date());
    return QUICK_OFFSETS.map((offset) => {
      const start = new Date(thisMonday);
      start.setDate(start.getDate() + offset * 7);
      return { offset, start, label: weekLabelForOffset(offset, start) };
    });
  }, []);

  function jumpToDate(dateStr) {
    if (!dateStr) return;
    const picked = mondayOf(new Date(dateStr));
    const thisMonday = mondayOf(new Date());
    const offset = Math.round((picked - thisMonday) / (7 * 24 * 60 * 60 * 1000));
    setWeekOffset(offset);
  }

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
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 w-9 p-0" onClick={() => setWeekOffset((o) => o - 1)} title="Previous week">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            {quickWeeks.map(({ offset, label }) => (
              <button
                key={offset}
                onClick={() => setWeekOffset(offset)}
                className="px-4 py-2.5 rounded-md border text-sm font-medium transition-colors"
                style={{
                  borderColor: offset === weekOffset ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                  backgroundColor: offset === weekOffset ? 'hsl(var(--primary) / 0.1)' : 'hsl(var(--surface-1))'
                }}
              >
                {label}
              </button>
            ))}
            <Button variant="outline" size="sm" className="h-9 w-9 p-0" onClick={() => setWeekOffset((o) => o + 1)} title="Next week">
              <ChevronRight className="w-4 h-4" />
            </Button>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-[hsl(var(--surface-1))] text-xs text-muted-foreground">
              <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Jump to</span>
              <input
                type="date"
                className="bg-transparent text-xs outline-none border-0 w-28 text-foreground"
                onChange={(e) => jumpToDate(e.target.value)}
              />
            </div>
          </div>

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
        </div>

        <section className="space-y-4">
          <div className="flex items-baseline gap-3">
            <h2 className="text-xl font-bold">{weekData.label}</h2>
            <span className="text-sm text-muted-foreground">
              {formatDate(weekData.start)} – {formatDateWithYear(weekData.end)} · {weekData.total} site{weekData.total === 1 ? '' : 's'}
            </span>
            {weekOffset < 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-[hsl(var(--surface-2))] text-muted-foreground">Viewing history</span>
            )}
          </div>

          {weekData.total > 0 && (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              {[
                { label: 'Complete / Live', key: 'success', color: 'hsl(var(--status-complete))' },
                { label: 'Issue / Revisit', key: 'issue', color: 'hsl(var(--destructive))' },
                { label: 'Not Installed Yet', key: 'pending', color: 'hsl(var(--status-scheduled))' }
              ].map((s) => (
                <div key={s.key} className="border border-border rounded-md p-4 bg-[hsl(var(--surface-1))]" style={{ borderTop: `3px solid ${s.color}` }}>
                  <div className="text-3xl font-bold tabular-nums" style={{ color: s.color }}>{weekSummary.pct(weekSummary.counts[s.key])}%</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.label} · {weekSummary.counts[s.key]} of {weekSummary.total}</div>
                  <div className="mt-2 h-1.5 rounded-full bg-[hsl(var(--surface-2))] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${weekSummary.pct(weekSummary.counts[s.key])}%`, backgroundColor: s.color }} />
                  </div>
                  {s.key === 'issue' && weekSummary.issueSites.length > 0 && (
                    <ul className="mt-3 pt-3 border-t border-border space-y-1.5">
                      {weekSummary.issueSites.map((site) => (
                        <li key={site.id} className="flex items-start gap-1.5 text-xs">
                          <span className="flex-shrink-0">{FLAGS[site.country]}</span>
                          <span className="font-medium flex-shrink-0">{site.name}</span>
                          <span className="text-muted-foreground truncate">— {site.cause}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          {weekData.total === 0 ? (
            <p className="text-sm text-muted-foreground border border-border rounded-md p-4 bg-[hsl(var(--surface-1))]">No installs scheduled this week.</p>
          ) : (
            COUNTRY_ORDER
              .filter((c) => weekData.byCountry[c].length > 0 && (countryFilter === 'all' || countryFilter === c))
              .map((country) => (
                <div key={country} className="border border-border rounded-md overflow-hidden bg-[hsl(var(--surface-1))]" style={{ borderTop: `3px solid ${COUNTRY_ACCENT[country]}` }}>
                  <div className="px-4 py-3 bg-[hsl(var(--surface-2))] border-b border-border flex items-center gap-2.5">
                    <span className="text-3xl leading-none">{FLAGS[country]}</span>
                    <h3 className="text-base font-bold">{country} <span className="font-normal text-muted-foreground text-sm">— {weekData.byCountry[country].length} site{weekData.byCountry[country].length === 1 ? '' : 's'}</span></h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-[hsl(var(--surface-2))] border-b border-border">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Store</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Type</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Install Day</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Kicked Off</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">HW Status</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Resource Allocated</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Peds Delivered</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Readiness Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {weekData.byCountry[country].map((site) => (
                          <tr key={site.id} className="hover:brightness-110 transition-all" style={outcomeRowStyle(site.outcome)}>
                            <td className="px-4 py-2.5 text-sm font-medium">
                              <span className="inline-flex items-center gap-1.5">
                                {site.outcome === 'success' && <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'hsl(var(--status-complete))' }} />}
                                {site.outcome === 'issue' && <XCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'hsl(var(--destructive))' }} />}
                                {site.atRisk && <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'hsl(var(--status-scheduled))' }} />}
                                {site.name}
                              </span>
                              {site.outcome === 'success' && <div className="text-[10px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: 'hsl(var(--status-complete))' }}>Complete</div>}
                              {site.outcome === 'issue' && <div className="text-[10px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: 'hsl(var(--destructive))' }}>Issue</div>}
                            </td>
                            <td className="px-4 py-2.5 text-sm text-muted-foreground">{site.type || '\u2014'}</td>
                            <td className="px-4 py-2.5 text-sm text-muted-foreground">{formatDate(new Date(site.installDate))}</td>
                            <td className="px-4 py-2.5"><StatusPill value={site.kickOff} /></td>
                            <td className="px-4 py-2.5"><StatusPill value={displayHardwareStatus(site.hardwareStatus)} /></td>
                            <td className="px-4 py-2.5"><StatusPill value={deriveResourceAllocated(site.installer)} /></td>
                            <td className="px-4 py-2.5">
                              <StatusPill value={
                                site.readiness
                                  ? (isAffirmative(site.readiness.hasFreedomPayTerminals) ? 'Yes' : 'No')
                                  : null
                              } />
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
      </main>
    </div>
  );
}
