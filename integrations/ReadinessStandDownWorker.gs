// Runs in the standalone readiness coordinator. This worker has no mail sender.
function RD_previewStandDownWorker() {
  return RD_standDownWorker_(true);
}

function RD_runStandDownWorker() {
  return RD_standDownWorker_(false);
}

function RD_installStandDownWorkerTrigger() {
  const properties = PropertiesService.getScriptProperties();
  if (properties.getProperty('RD_STAND_DOWN_ALERTS_APPROVED') === 'YES') {
    throw Error('Disable stand-down alerts before installing the trigger');
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw Error('Readiness coordinator busy');
  try {
    const handler = 'RD_runStandDownWorker';
    const triggers = ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === handler);
    if (triggers.length > 1) throw Error('Duplicate stand-down triggers require reconciliation');
    if (triggers.length === 1) return { state: 'already-installed' };
    ScriptApp.newTrigger(handler).timeBased().everyMinutes(15).create();
    return { state: 'installed-disabled' };
  } finally {
    lock.releaseLock();
  }
}

function RD_standDownWorker_(preview) {
  const properties = PropertiesService.getScriptProperties();
  if (!preview && properties.getProperty('RD_STAND_DOWN_ALERTS_APPROVED') !== 'YES') {
    return { state: 'disabled', records: [] };
  }

  const cohort = RD_standDownCohort_(properties);
  const folder = DriveApp.getFolderById(properties.getProperty('RD_STATE_FOLDER_ID'));
  const today = Utilities.formatDate(new Date(), 'Europe/London', 'yyyy-MM-dd');
  const records = [];
  const deadline = Date.now() + 120000;
  for (const entry of cohort) {
    if (Date.now() >= deadline) return { state: 'budget-exhausted', records };
    try {
      const file = RD_find_(folder, entry.id + '.json');
      if (!file) throw Error('Issued readiness request missing');
      const record = JSON.parse(file.getBlob().getDataAsString());
      RD_assertStandDownBinding_(record, entry);
      if (preview) RD_assertCurrent_(record, properties);
      const plan = planReminder(record, today);
      if (plan.state !== 'standDown' || Date.now() < Date.parse(entry.notBefore)) {
        records.push({ id: entry.id, state: plan.state === 'standDown' ? 'waiting' : plan.state });
        continue;
      }
      if (preview) {
        records.push({ id: entry.id, state: record.pendingSubmission ? 'held' : 'would-notify' });
        continue;
      }
      const result = RD_dispatchWithExistingSender(entry.id, null, null, entry);
      records.push({
        id: entry.id,
        state: result.state,
        notificationsAccepted: result.notificationsAccepted || 0,
        notificationOutcomeUncertain: result.notificationOutcomeUncertain === true,
      });
    } catch (error) {
      records.push({ id: entry.id, state: 'held', reason: String(error.message || 'Readiness action requires review') });
    }
  }
  const result = { state: preview ? 'preview' : 'complete', records };
  if (!preview) console.log(JSON.stringify(result));
  return result;
}

function RD_standDownCohort_(properties) {
  const entries = JSON.parse(properties.getProperty('RD_STAND_DOWN_COHORT') || 'null');
  if (!Array.isArray(entries) || !entries.length || entries.length > 25) {
    throw Error('A reviewed cohort of 1 to 25 issued readiness requests is required');
  }
  const ids = new Set();
  for (const entry of entries) {
    if (!entry || !/^[a-zA-Z0-9_-]{1,80}$/.test(entry.id || '') ||
        !Number.isSafeInteger(entry.revision) || entry.revision < 1 ||
        !/^\d+$/.test(entry.itemId || '') || ids.has(entry.id) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(entry.notBefore || '') ||
        !Number.isFinite(Date.parse(entry.notBefore))) throw Error('Invalid or duplicate stand-down cohort entry');
    dateOnly(entry.installDate);
    ids.add(entry.id);
  }
  return entries;
}

function RD_assertStandDownBinding_(record, entry) {
  if (record.binding.id !== entry.id || record.binding.itemId !== entry.itemId ||
      record.revision !== entry.revision || record.binding.installDate !== entry.installDate) {
    throw Error('Readiness booking changed; review the cohort entry');
  }
}
