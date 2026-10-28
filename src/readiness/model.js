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
export function validateAnswers(answers, installType, binding = {}) {
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
  if (answers.schemaVersion === 2) {
    out.schemaVersion = 2;
    if (answers.acknowledgementAccepted !== true) throw Error('Acknowledgement required');
    out.acknowledgementAccepted = true;
    out.acknowledgementVersion = 'readiness-ack-v1';
    if (!out.comments) throw Error('Comments require an answer; use None if not applicable');
    if (!['trading', 'new', 'remodel'].includes(answers.storeType)) throw Error('Store type required');
    out.storeType = answers.storeType;
    for (const key of requiredReadinessChecks(answers, installType)) {
      if (!['yes', 'no', 'pending'].includes(answers[key])) throw Error('Answer every applicable readiness question');
      out[key] = answers[key];
    }
    for (const key of ['siteContact', 'contactPhone', 'accessHours', 'accessInstructions', 'exceptionDetails', 'exceptionOwner']) {
      if (typeof answers[key] !== 'string' || answers[key].length > (['exceptionDetails', 'accessInstructions'].includes(key) ? 2000 : 150)) throw Error('Invalid contact or action details');
      out[key] = answers[key].trim();
    }
    if (!out.siteContact || !out.contactPhone || !out.accessHours || !out.accessInstructions || !out.exceptionDetails || !out.exceptionOwner) throw Error('Site contact, phone and access hours required');
    out.tableDelivery = installType === 'sfk' && answers.tableInStore !== 'yes' && answers.tableDeliveryKnown === 'yes' ? dateOnly(answers.tableDelivery) : '';
    out.openingDate = answers.storeType !== 'trading' && answers.openingDateKnown === 'yes' ? dateOnly(answers.openingDate) : '';
    out.goLiveDate = answers.goLiveDateKnown === 'yes' ? dateOnly(answers.goLiveDate) : '';
    out.worksCompletionDate = answers.storeType !== 'trading' && answers.worksComplete !== 'yes' && answers.worksCompletionKnown === 'yes' ? dateOnly(answers.worksCompletionDate) : '';
    if (!['yes', 'pending'].includes(answers.resolutionDateKnown)) throw Error('Resolution date answer required');
    out.resolutionDateKnown = answers.resolutionDateKnown;
    out.exceptionDue = answers.resolutionDateKnown === 'yes' ? dateOnly(answers.exceptionDue) : '';
    out.evidenceCategories = Array.isArray(answers.evidenceCategories) ? [...new Set(answers.evidenceCategories.filter(x => ['table', 'powerData', 'peds', 'kit'].includes(x)))] : [];
    out.evidenceStatus = {}; out.evidenceReasons = {};
    for (const category of requiredEvidence(out, installType)) {
      const state = answers.evidenceStatus?.[category];
      if (!['provided', 'pending'].includes(state)) throw Error('Answer every evidence question');
      if (state === 'provided' && !out.evidenceCategories.includes(category)) throw Error('Photo attachment required');
      const reason = String(answers.evidenceReasons?.[category] || '').trim();
      if (reason.length > 500 || (state === 'pending' && !reason)) throw Error('Missing evidence requires an explanation');
      out.evidenceStatus[category] = state;
      out.evidenceReasons[category] = state === 'pending' ? reason : '';
    }
    if (readinessGaps(out, installType, binding).length && (!out.exceptionDetails || !out.exceptionOwner || !['yes', 'pending'].includes(answers.resolutionDateKnown))) throw Error('Outstanding work requires details, owner and a resolution date or unknown-date answer');
  }
  return out;
}
export function requiredReadinessChecks(a, type) {
  return ['installDateConfirmed', 'kitDelivered', 'permits', 'accessConfirmed', 'networkOnline', 'networkPrepared', 'handoverAvailable', 'goLiveDateKnown',
    ...(type === 'sfk' ? ['tableInStore', ...(a.tableInStore === 'yes' ? ['tableAssembled'] : ['tableDeliveryKnown'])] : []),
    ...(a.powerData === 'yes' ? ['powerTested'] : []),
    ...(a.peds === 'yes' ? ['pedQuantityConfirmed'] : []),
    ...(a.kitDelivered === 'yes' ? ['kitComplete', 'kitUndamaged', 'kitSecure'] : []),
    ...(a.storeType !== 'trading' ? ['openingDateKnown', 'openingDateConfirmed', 'worksComplete', ...(a.worksComplete !== 'yes' ? ['worksCompletionKnown'] : [])] : [])];
}
export function readinessGaps(a, type, binding = {}) {
  const labels = { team: 'Store team prepared', area: 'Installation area', powerData: 'Power and data installed', peds: 'PEDs received', floorplan: 'Floorplan confirmation', table: 'SFK table ordered', installDateConfirmed: 'Installation date confirmation', tableInStore: 'SFK table in store', tableAssembled: 'SFK table assembled and positioned', tableDeliveryKnown: 'Table delivery date unknown', worksCompletionKnown: 'Building works completion date unknown', powerTested: 'Power and data tested', pedQuantityConfirmed: 'Correct PED quantity', kitDelivered: 'Kit delivered', kitComplete: 'Kit complete', kitUndamaged: 'Kit undamaged', kitSecure: 'Kit securely stored', permits: 'Access permits', accessConfirmed: 'Access arrangements', networkOnline: 'Internet connection', networkPrepared: 'Network preparation', handoverAvailable: 'Contact available for handover', openingDateKnown: 'Opening/reopening date unknown', openingDateConfirmed: 'Opening/reopening date confirmation', worksComplete: 'Building works complete', goLiveDateKnown: 'Required go-live date unknown' };
  const fields = ['team', 'area', 'powerData', 'peds', 'floorplan', ...(type === 'sfk' ? ['table'] : []), ...requiredReadinessChecks(a, type)];
  const gaps = fields.filter(k => a[k] !== 'yes').map(k => labels[k]);
  if (binding.installDate) {
    if (a.goLiveDate && a.goLiveDate < binding.installDate) gaps.push('Required go-live date precedes installation');
    if (a.openingDate && a.openingDate < binding.installDate) gaps.push('Opening/reopening precedes installation');
    if (type === 'sfk' && a.tableInStore !== 'yes' && a.tableDelivery && a.tableDelivery >= binding.installDate) gaps.push('Table delivery is on/after installation');
    if (a.worksComplete !== 'yes' && a.worksCompletionDate && a.worksCompletionDate >= binding.installDate) gaps.push('Building works finish on/after installation');
    if (a.exceptionDue && a.exceptionDue >= binding.installDate) gaps.push('Resolution is on/after installation');
  }
  for (const [check, category, label] of [['powerData', 'powerData', 'Power/data photo'], ['peds', 'peds', 'PED photo'], ...(type === 'sfk' ? [['tableInStore', 'table', 'Table/area photo']] : [])]) {
    if (a[check] === 'yes' && !(a.evidenceCategories || []).includes(category)) gaps.push(label + ' outstanding');
  }
  return [...new Set(gaps)];
}
export function blockers(answers, installType, binding = {}) {
  if (!answers) return ['Readiness response outstanding'];
  if (answers.schemaVersion === 2) return readinessGaps(answers, installType, binding);
  const labels = { team: 'Team preparation', area: 'Installation area', powerData: 'Power and data', peds: 'PEDs received', floorplan: 'Floorplan confirmation', table: 'SFK table' };
  return Object.entries(labels).filter(([key]) => (key !== 'table' || installType === 'sfk') && answers[key] !== 'yes').map(([, label]) => label);
}
export function vmReadiness(record) {
  const gaps = blockers(record.answers, record.binding.installType, record.binding);
  if (!record.submitted) return { label: 'Awaiting FZE response', ready: false };
  if (record.answers?.schemaVersion !== 2) return { label: 'Legacy response — updated checks required', ready: false };
  if (gaps.length) return { label: 'Readiness gaps', ready: false };
  if (record.vmReview?.decision === 'approved' && record.vmReview.revision === record.revision && record.vmReview.submissionCount === (record.history || []).filter(h => h.answers).length) return { label: 'VM reviewed — ready to proceed', ready: true };
  if (record.vmReview?.decision === 'hold') return { label: 'VM review — on hold', ready: false };
  return { label: 'FZE says ready — VM review pending', ready: false };
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
  return { ...record, revision: record.revision + 1, binding: { ...record.binding, installDate }, sent: {}, submitted: false, answers: null, vmReview: null, history: [...(record.history || []), { type: 'rescheduled', previousDate: record.binding.installDate, previousRevision: record.revision, previousAnswers: record.answers || null }] };
}
export function snapshotChanges(before, rows) {
  const previous = new Map((before || []).map(x => [x.id, x]));
  const changes = [];
  rows.forEach(row => {
    const old = previous.get(row.id);
    if (!old) changes.push({ store: row.store, change: 'Added to call view' });
    else ['installDate', 'outcome', 'readiness', 'pedForm', 'pedOrder', 'shipping', 'openingDate', 'goLiveDate', 'tableState', 'vmDecision'].forEach(key => { if (JSON.stringify(old[key]) !== JSON.stringify(row[key])) changes.push({ store: row.store, change: `${key}: ${old[key] || '—'} → ${row[key] || '—'}` }); });
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

export function requiredEvidence(a, type) { return [...(type === 'sfk' && a.tableInStore === 'yes' ? ['table'] : []), ...(a.powerData === 'yes' ? ['powerData'] : []), ...(a.peds === 'yes' ? ['peds'] : []), ...(a.kitDelivered === 'yes' && (a.kitComplete !== 'yes' || a.kitUndamaged !== 'yes') ? ['kit'] : [])]; }
