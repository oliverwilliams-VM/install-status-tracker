// Translates an array of texts to English using MyMemory's free
// translation API \u2014 no API key, no account, no billing setup at all.
// Free tier is 5,000 characters/day per IP, which comfortably covers a
// handful of short German readiness notes per week. Quality is a step
// below Google/DeepL on complex sentences, but is fine for the short,
// plain-language notes this app deals with.

const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';

async function translateOne(text, source) {
  const params = new URLSearchParams({
    q: text,
    langpair: `${source || 'de'}|en`
  });
  const response = await fetch(`${MYMEMORY_URL}?${params.toString()}`);
  const json = await response.json();
  if (json.responseStatus && Number(json.responseStatus) !== 200) {
    throw new Error(json.responseDetails || 'MyMemory translation failed');
  }
  return json.responseData?.translatedText || text;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { texts, source } = req.body;
  if (!Array.isArray(texts) || texts.length === 0) {
    res.status(400).json({ error: 'texts must be a non-empty array of strings.' });
    return;
  }

  try {
    // MyMemory only translates one string per request, so these run in
    // parallel rather than as a single batched call like Google's did.
    const translations = await Promise.all(texts.map((t) => translateOne(t, source)));
    res.status(200).json({ translations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
