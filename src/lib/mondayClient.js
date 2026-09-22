import { COUNTRY_BOARDS, READINESS_BOARDS, READINESS_COLUMNS } from './boards';

async function callMondayApi(action, payload) {
  const res = await fetch('/api/monday', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Monday API request failed');
  return json;
}

function shapeCountryItem(rawItem, board) {
  const valuesById = {};
  // Prefer display_value where present (mirror/board-relation columns
  // often don't reliably populate the plain text field), falling back to
  // text for ordinary column types.
  rawItem.column_values.forEach((cv) => { valuesById[cv.id] = cv.display_value || cv.text; });

  const get = (key) => {
    const colId = board.columns[key];
    return colId ? (valuesById[colId] ?? null) : null;
  };

  return {
    id: rawItem.id,
    boardId: board.id,
    resourceRequestedColumnId: board.columns.resourceRequested,
    bandwidthColumnId: board.columns.bandwidth,
    name: rawItem.name,
    country: board.country,
    group: rawItem.group?.title ?? null,
    installDate: get('installDate'),
    type: get('type'),
    kickOff: get('kickOff'),
    accessPermits: get('accessPermits'),
    hardwareStatus: get('hardwareStatus'),
    installer: get('installer'),
    siteStatus: get('siteStatus'),
    resourceRequested: get('resourceRequested'),
    bandwidth: get('bandwidth')
  };
}

function shapeReadinessItem(rawItem) {
  const valuesById = {};
  rawItem.column_values.forEach((cv) => { valuesById[cv.id] = cv.text; });
  return {
    id: rawItem.id,
    storeId: (valuesById[READINESS_COLUMNS.storeId] || '').trim(),
    date: valuesById[READINESS_COLUMNS.date] ?? null,
    contactName: valuesById[READINESS_COLUMNS.contactName] ?? null,
    teamPrepared: valuesById[READINESS_COLUMNS.teamPrepared] ?? null,
    areaPrepared: valuesById[READINESS_COLUMNS.areaPrepared] ?? null,
    powerData: valuesById[READINESS_COLUMNS.powerData] ?? null,
    hasFreedomPayTerminals: valuesById[READINESS_COLUMNS.hasFreedomPayTerminals] ?? null,
    finalConfirmation: valuesById[READINESS_COLUMNS.finalConfirmation] ?? null
  };
}

export async function fetchCountryItems() {
  const boardsPayload = COUNTRY_BOARDS.map((b) => ({
    id: b.id,
    columnIds: Object.values(b.columns).filter(Boolean)
  }));
  const { results } = await callMondayApi('multiItems', { boards: boardsPayload });

  const items = [];
  results.forEach((r) => {
    const board = COUNTRY_BOARDS.find((b) => b.id === r.boardId);
    r.items.forEach((raw) => items.push(shapeCountryItem(raw, board)));
  });
  return items;
}

export async function fetchReadinessItems() {
  const boardsPayload = READINESS_BOARDS.map((b) => ({
    id: b.id,
    columnIds: Object.values(READINESS_COLUMNS)
  }));
  const { results } = await callMondayApi('multiItems', { boards: boardsPayload });

  const itemsByStoreId = new Map();
  results.forEach((r) => {
    const board = READINESS_BOARDS.find((b) => b.id === r.boardId);
    r.items.forEach((raw) => {
      const shaped = { ...shapeReadinessItem(raw), country: board.country };
      if (!shaped.storeId) return;
      // A store can submit more than once (corrections, resubmissions) \u2014
      // keep whichever submission has the latest date.
      const existing = itemsByStoreId.get(shaped.storeId);
      if (!existing || (shaped.date && (!existing.date || shaped.date > existing.date))) {
        itemsByStoreId.set(shaped.storeId, shaped);
      }
    });
  });
  return itemsByStoreId;
}

// Writes a single field back to its country board \u2014 used for the two
// fields that only exist in this tool now (Resource Requested, Bandwidth),
// since Monday itself is still the single source of truth for them.
export async function updateCountryItemField(boardId, itemId, columnId, value) {
  await callMondayApi('updateStatus', { boardId, itemId, columnId, value });
}
