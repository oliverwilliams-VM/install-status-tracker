// Diagnostic endpoint \u2014 NOT used by the live app. Visit this URL directly
// in a browser to inspect real Monday board/column structure before
// wiring up the actual dashboard logic. Delete once the real app no
// longer needs it, or leave it \u2014 it's harmless either way.

const MONDAY_API_URL = 'https://api.monday.com/v2';

// The boards already understood from the PipelineBoard/install-dashboard
// projects, plus the 3 new "readiness" boards this project needs to
// investigate \u2014 shape currently unknown (per-site? per-week? something
// else?), so these get sample items pulled too, not just column defs.
const BOARDS = [
  { id: '5678025992', name: 'Sign Up \u2192 Ready to Go', sampleItems: true },
  { id: '5678172488', name: 'Install \u2192 BAU (UK)', sampleItems: false },
  { id: '7519472262', name: 'Install \u2192 BAU (IE)', sampleItems: false },
  { id: '5757397415', name: 'Install \u2192 BAU (NL)', sampleItems: false },
  { id: '5757508504', name: 'Install \u2192 BAU (DE)', sampleItems: false },
  { id: '5756651462', name: 'Install \u2192 BAU (FI)', sampleItems: false },
  { id: '18379251681', name: 'Readiness board 1 (unverified)', sampleItems: true },
  { id: '18391075175', name: 'Readiness board 2 (unverified)', sampleItems: true },
  { id: '18396748434', name: 'Readiness board 3 (unverified)', sampleItems: true }
];

const SAMPLE_ITEM_COUNT = 5;

export default async function handler(req, res) {
  const token = process.env.MONDAY_API_TOKEN;

  if (!token) {
    res.status(500).json({ error: 'MONDAY_API_TOKEN is not set \u2014 add it in Vercel Project Settings > Environment Variables.' });
    return;
  }

  try {
    const results = [];
    for (const b of BOARDS) {
      const response = await fetch(MONDAY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({
          query: `query ($boardId: [ID!], $sampleLimit: Int!) {
            boards(ids: $boardId) {
              name
              columns { id title type settings_str }
              groups { id title }
              items_page(limit: $sampleLimit) {
                items {
                  id
                  name
                  group { id title }
                  column_values {
                    id
                    text
                    type
                  }
                }
              }
            }
          }`,
          variables: { boardId: [b.id], sampleLimit: b.sampleItems ? SAMPLE_ITEM_COUNT : 0 }
        })
      });
      const json = await response.json();
      if (json.errors) {
        results.push({ id: b.id, name: b.name, error: json.errors.map((e) => e.message).join('; ') });
        continue;
      }
      if (!json.data.boards || json.data.boards.length === 0) {
        results.push({ id: b.id, name: b.name, error: `No board found for id ${b.id}` });
        continue;
      }
      const board = json.data.boards[0];

      const columns = board.columns.map((col) => {
        if ((col.type === 'status' || col.type === 'dropdown') && col.settings_str) {
          try {
            const settings = JSON.parse(col.settings_str);
            const labels = settings.labels
              ? Object.values(settings.labels)
              : (settings.options || []).map((o) => o.name);
            return { id: col.id, title: col.title, type: col.type, labels };
          } catch {
            return { id: col.id, title: col.title, type: col.type };
          }
        }
        return { id: col.id, title: col.title, type: col.type };
      });

      const sampleItems = b.sampleItems
        ? board.items_page.items.map((item) => ({
            id: item.id,
            name: item.name,
            group: item.group?.title,
            values: Object.fromEntries(
              item.column_values.filter((cv) => cv.text).map((cv) => [cv.id, cv.text])
            )
          }))
        : undefined;

      results.push({
        id: b.id,
        name: b.name,
        boardName: board.name,
        groups: board.groups,
        columns,
        ...(sampleItems ? { sampleItems } : {})
      });
    }
    res.status(200).json({ boards: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
