// Netlify Function: proxies chat requests to Google's Gemini API (free tier).
// The API key lives only in the Netlify environment variable GEMINI_API_KEY —
// it is never sent to or visible from the browser.
//
// Get a free key (no credit card required) at https://ai.google.dev -> "Get API key".
// Free tier as of 2026: ~1,500 requests/day on gemini-2.5-flash, no expiration.

const MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_OUTPUT_TOKENS = 700;

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { system, messages } = payload;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: '"messages" array is required' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server is missing GEMINI_API_KEY. Set it in Netlify: Site settings -> Environment variables. Get a free key at https://ai.google.dev' }),
    };
  }

  // Gemini uses roles "user" and "model" (not "assistant"), and a separate
  // top-level systemInstruction field instead of a system-role message.
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body = {
    contents,
    generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.6 },
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  try {
    const resp = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error('Gemini API error:', resp.status, data);
      return {
        statusCode: 502,
        body: JSON.stringify({ error: (data && data.error && data.error.message) || 'Upstream AI API error' }),
      };
    }

    const candidate = data.candidates && data.candidates[0];
    const text = candidate && candidate.content && candidate.content.parts
      ? candidate.content.parts.map((p) => p.text || '').join('\n')
      : '';

    if (!text.trim()) {
      const reason = (candidate && candidate.finishReason) || 'unknown';
      return {
        statusCode: 502,
        body: JSON.stringify({ error: `Model returned no text (finishReason: ${reason})` }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    };
  } catch (err) {
    console.error('Function error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
