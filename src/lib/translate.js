export async function translateTexts(texts, source) {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts, source })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Translation request failed');
  return json.translations;
}
