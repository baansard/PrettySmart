const Auth = {
  user: null,

  async init() {
    const { data: { session } } = await DB.auth.getSession();
    if (session) {
      this.user = session.user;
      this._ready();
    } else {
      document.getElementById('login-overlay').classList.remove('hidden');
    }

    DB.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && !this.user) {
        this.user = session.user;
        document.getElementById('login-overlay').classList.add('hidden');
        this._ready();
      }
    });

    this._setupForm();
  },

  _ready() {
    Manage.init();
    start();
  },

  _setupForm() {
    let mode = 'login';

    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        mode = tab.dataset.mode;
        document.querySelectorAll('.auth-tab').forEach(t =>
          t.classList.toggle('active', t.dataset.mode === mode)
        );
        document.getElementById('auth-submit').textContent = mode === 'login' ? 'Log in' : 'Register';
        document.getElementById('auth-error').textContent = '';
      });
    });

    document.getElementById('auth-submit').addEventListener('click', async () => {
      const email    = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-password').value;
      const errEl    = document.getElementById('auth-error');
      errEl.style.color = '#c0407a';
      errEl.textContent = '';

      if (!email || !password) { errEl.textContent = 'Please fill in both fields.'; return; }

      if (mode === 'login') {
        const { error } = await DB.auth.signInWithPassword({ email, password });
        if (error) errEl.textContent = error.message;
      } else {
        const { error } = await DB.auth.signUp({ email, password });
        if (error) { errEl.textContent = error.message; return; }
        errEl.style.color = '#4caf50';
        errEl.textContent = 'Check your email to confirm, then log in.';
      }
    });

    ['auth-email', 'auth-password'].forEach(id =>
      document.getElementById(id).addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('auth-submit').click();
      })
    );
  },
};

Auth.init();
