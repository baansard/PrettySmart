// Calls the C# backend (server/PrettySmart.Api) with the signed-in user's Supabase token.
const Api = {
  async request(method, path, body) {
    const { data: { session } } = await DB.auth.getSession();
    const res = await fetch('/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: 'Bearer ' + session.access_token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`API ${method} ${path} failed:`, res.status, await res.text());
      throw new Error(`API ${method} ${path} failed (${res.status})`);
    }
    return res.status === 204 ? null : res.json();
  },

  get(path)        { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  del(path)        { return this.request('DELETE', path); },
};
