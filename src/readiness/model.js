// Shared deterministic rules; calendar dates deliberately avoid browser time zones.
export const MARKETS = { UK: 'en', IE: 'en', NL: 'nl', DE: 'de' };
export function market(value) {
  const m = ({ GB: 'UK', IRL: 'IE' })[value] || value;
  if (!Object.prototype.hasOwnProperty.call(MARKETS, m)) throw Error('Unsupported market');
  return m;
}
export function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('Invalid calendar date');
  const d = new Date(value + 'T12:00:00Z');
  if (!Number.isFinite(+d) || d.toISOString().slice(0, 10) !== value) throw Error('Invalid calendar date');
  return value;
}
export function plusDays(value, days) {
  const d = new Date(dateOnly(value) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function londonToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function milestones(installDate) {
  return [-10, -7, -5].map((offset, i) => ({ stage: ['invite', 'chase1', 'chase2'][i], date: plusDays(installDate, offset), offset, copyMfp: i === 2 }));
}
export function validateBinding(b) {
  if (!b || !/^[a-zA-Z0-9_-]{1,80}$/.test(b.id || '') || !/^\d{1,10}$/.test(b.store || '') || !/^\d+$/.test(b.itemId || '') || !/^\d+$/.test(b.boardId || '') || !['sfk', 'other'].includes(b.installType)) throw Error('Invalid installation binding');
  market(b.country); dateOnly(b.installDate);
  const expected = { UK: '5678172488', IE: '7519472262', NL: '5757397415', DE: '5757508504' }[market(b.country)];
  if (expected !== b.boardId) throw Error('Country and install board do not match');
  return b;
}
export function validateAnswers(answers, installType) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw Error('Answers required');
  const fields = ['team', 'area', 'powerData', 'peds', 'floorplan'];
  const out = {};
  for (const key of fields) {
    if (!['yes', 'no', 'pending'].includes(answers[key])) throw Error('Answer every readiness question');
    out[key] = answers[key];
  }
  out.table = installType === 'sfk' ? answers.table : 'na';
  if (installType === 'sfk' && !['yes', 'no', 'pending'].includes(out.table)) throw Error('SFK table answer required');
  out.tableDelivery = answers.tableDelivery ? dateOnly(answers.tableDelivery) : '';
  for (const key of ['name', 'comments']) {
    if (typeof answers[key] !== 'string' || answers[key].length > (key === 'name' ? 150 : 3000)) throw Error('Invalid response text');
    out[key] = answers[key].trim();
  }
  if (!out.name) throw Error('Contact name required');
  return out;
}
export function blockers(answers, installType) {
  if (!answers) return ['Readiness response outstanding'];
  const labels = { team: 'Team preparation', area: 'Installation area', powerData: 'Power and data', peds: 'PEDs received', floorplan: 'Floorplan confirmation', table: 'SFK table' };
  return Object.entries(labels).filter(([key]) => (key !== 'table' || installType === 'sfk') && answers[key] !== 'yes').map(([, label]) => label);
}
export function planReminder(record, today) {
  dateOnly(today);
  if (record.cancelled || record.completed || ['Live', 'Postponed', 'Partially completed', 'Aborted'].includes(record.outcome) || record.submitted || today >= record.binding.installDate) return { state: 'stopped', reason: record.submitted ? 'Response received; follow up blockers separately' : 'No outstanding future install' };
  const due = milestones(record.binding.installDate).filter(x => x.date <= today);
  if (!due.length) return { state: 'waiting', next: milestones(record.binding.installDate)[0].date };
  const sent = record.sent || {};
  const latest = due[due.length - 1];
  if (sent[latest.stage]) return { state: 'waiting', reason: 'Latest due stage already sent' };
  // Late arrivals receive one consolidated message, never a burst of old chasers.
  const stage = Object.keys(sent).length ? latest.stage : 'invite';
  if (sent[stage]) return { state: 'waiting', reason: 'Await next milestone' };
  if (Object.values(sent).some(x => x.date === today)) return { state: 'waiting', reason: 'One message per installation per day' };
  const copyMfp = latest.copyMfp;
  if (!record.fzeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.fzeEmail)) return { state: 'blocked', reason: 'Verified FZE email required' };
  if (copyMfp && (!record.mfpEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.mfpEmail))) return { state: 'blocked', reason: 'Verified store MFP email required for escalation' };
  return { state: 'due', stage, date: today, scheduledDate: latest.date, copyMfp, to: record.fzeEmail, cc: copyMfp ? record.mfpEmail : '', key: `${record.binding.id}:${record.revision}:${stage}`, late: stage === 'invite' && latest.stage !== 'invite' };
}
export function reschedule(record, installDate) {
  dateOnly(installDate);
  if (record.binding.installDate === installDate) return record;
  return { ...record, revision: record.revision + 1, binding: { ...record.binding, installDate }, sent: {}, submitted: false, answers: null, history: [...(record.history || []), { type: 'rescheduled', previousDate: record.binding.installDate, previousRevision: record.revision, previousAnswers: record.answers || null }] };
}
export function snapshotChanges(before, rows) {
  const previous = new Map((before || []).map(x => [x.id, x]));
  const changes = [];
  rows.forEach(row => {
    const old = previous.get(row.id);
    if (!old) changes.push({ store: row.store, change: 'Added to call view' });
    else ['installDate', 'outcome', 'readiness', 'pedForm', 'pedOrder', 'shipping'].forEach(key => { if (JSON.stringify(old[key]) !== JSON.stringify(row[key])) changes.push({ store: row.store, change: `${key}: ${old[key] || '—'} → ${row[key] || '—'}` }); });
  });
  const current = new Set(rows.map(x => x.id));
  (before || []).filter(x => !current.has(x.id)).forEach(x => changes.push({ store: x.store, change: 'Removed from call view' }));
  return changes;
}

// Evaluate exception states before success: "Installed - Not Live" is not live.
export function installOutcome(phase) {
  const v = String(phase || '').trim().toLowerCase();
  if (/abort|cancel/.test(v)) return 'Aborted';
  if (/partial|not[ -]*live|revisit/.test(v)) return 'Partially completed';
  if (/postpon/.test(v)) return 'Postponed';
  if (/stuck|block/.test(v)) return 'Blocked';
  if (/complete|installed|hypercare|^live/.test(v)) return 'Live';
  return 'Booked';
}
