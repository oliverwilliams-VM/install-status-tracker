// This file runs on Vercel's server, never in the browser.
// Your Monday API token is read from an environment variable set in the
// Vercel dashboard (Project Settings -> Environment Variables) — it is
// never sent to, or visible in, the browser.

const MONDAY_API_URL = 'https://api.monday.com/v2';

async function mondayGraphQL(query, variables = {}) {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) {
    throw new Error('MONDAY_API_TOKEN is not set in this deployment\'s environment variables.');
  }

  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token
    },
    body: JSON.stringify({ query, variables })
  });

  const json = await res.json();
  if (json.errors) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  return json.data;
}

// Fetches every item on ONE board, following Monday's cursor pagination.
async function fetchAllItemsForBoard(boardId, columnIds) {
  const items = [];
  let cursor = null;

  const query = `
    query ($boardId: [ID!], $cursor: String, $columnIds: [String!]) {
      boards(ids: $boardId) {
        items_page(limit: 500, cursor: $cursor) {
          cursor
          items {
            id
            name
            group { id title }
            column_values(ids: $columnIds) {
              id
              text
              value
              ... on BoardRelationValue {
                display_value
              }
              ... on MirrorValue {
                display_value
              }
            }
          }
        }
      }
    }
  `;

  do {
    const data = await mondayGraphQL(query, { boardId: [boardId], cursor, columnIds });
    if (!data.boards || data.boards.length === 0) {
      throw new Error(`No board found for id ${boardId}.`);
    }
    const page = data.boards[0].items_page;
    items.push(...page.items);
    cursor = page.cursor;
  } while (cursor);

  return items;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { action, payload } = req.body;

  try {
    if (action === 'multiItems') {
      // payload.boards: [{ id, columnIds }, ...]
      const { boards } = payload;
      const results = [];
      for (const b of boards) {
        const items = await fetchAllItemsForBoard(b.id, b.columnIds);
        results.push({ boardId: b.id, items });
      }
      res.status(200).json({ results });
      return;
    }

    if (action === 'updateStatus') {
      const { boardId, itemId, columnId, value } = payload;
      const data = await mondayGraphQL(
        `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
          change_simple_column_value(
            board_id: $boardId,
            item_id: $itemId,
            column_id: $columnId,
            value: $value
          ) { id }
        }`,
        { boardId, itemId, columnId, value }
      );
      res.status(200).json({ result: data.change_simple_column_value });
      return;
    }

    res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
