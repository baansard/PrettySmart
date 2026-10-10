// Calls the C# backend (server/PrettySmart.Api) with the signed-in user's Supabase token.
const Api = {
  // Returns { ok, status, data } without throwing, for callers that handle "no" answers (e.g. can't buy).
  async send(method, path, body) {
    const { data: { session } } = await DB.auth.getSession();
    const res = await fetch('/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: 'Bearer ' + session.access_token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = res.status === 204 ? '' : await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
  },

  async request(method, path, body) {
    const res = await this.send(method, path, body);
    if (!res.ok) {
      console.error(`API ${method} ${path} failed:`, res.status, res.data);
      throw new Error(`API ${method} ${path} failed (${res.status})`);
    }
    return res.data;
  },

  get(path)          { return this.request('GET', path); },
  post(path, body)   { return this.request('POST', path, body); },
  patch(path, body)  { return this.request('PATCH', path, body); },
  del(path)          { return this.request('DELETE', path); },
};
