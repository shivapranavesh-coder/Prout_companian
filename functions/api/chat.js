const MODEL = 'gemini-flash-latest';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_OUTPUT_TOKENS = 2048;

export async function onRequestPost(context) {
  const { request, env } = context;

  let payload;
  try {
    payload = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { system, messages } = payload;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: '"messages" array is required' }), { status: 400 });
  }

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing GEMINI_API_KEY. Set it in Cloudflare Pages: Settings -> Environment variables.' }), { status: 500 });
  }

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body = {
    contents,
    generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.6 },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  try {
    const resp = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json();

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: (data?.error?.message) || 'Upstream AI API error' }), { status: 502 });
    }

    const candidate = data.candidates && data.candidates[0];
    const text = candidate?.content?.parts?.map((p) => p.text || '').join('\n') || '';

    if (!text.trim()) {
      return new Response(JSON.stringify({ error: `Model returned no text (finishReason: ${candidate?.finishReason || 'unknown'})` }), { status: 502 });
    }

    return new Response(JSON.stringify({ text }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
