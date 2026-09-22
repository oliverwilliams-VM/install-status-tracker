// Translates an array of texts to English using the Google Cloud
// Translation API. Runs server-side so the API key is never exposed to
// the browser.

const TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GOOGLE_TRANSLATE_API_KEY is not set in this deployment\'s environment variables.' });
    return;
  }

  const { texts, source } = req.body;
  if (!Array.isArray(texts) || texts.length === 0) {
    res.status(400).json({ error: 'texts must be a non-empty array of strings.' });
    return;
  }

  try {
    const params = new URLSearchParams();
    texts.forEach((t) => params.append('q', t));
    params.append('target', 'en');
    params.append('format', 'text');
    if (source) params.append('source', source);
    params.append('key', apiKey);

    const response = await fetch(`${TRANSLATE_URL}?${params.toString()}`, { method: 'POST' });
    const json = await response.json();

    if (json.error) {
      res.status(500).json({ error: json.error.message || 'Google Translate API request failed' });
      return;
    }

    const translations = json.data.translations.map((t) => t.translatedText);
    res.status(200).json({ translations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
