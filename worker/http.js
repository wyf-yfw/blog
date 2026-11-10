const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export function json(body, status = 200, extra = {}) {
  const headers = new Headers(JSON_HEADERS);
  for (const [key, value] of Object.entries(extra)) headers.append(key, value);
  return new Response(JSON.stringify(body), { status, headers });
}

export function fail(status, error, hint) {
  return json({ error, hint }, status);
}

export function httpError(status, error, hint) {
  const err = new Error(hint);
  err.status = status;
  err.code = error;
  err.hint = hint;
  return err;
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch (e) {
    return {};
  }
}
