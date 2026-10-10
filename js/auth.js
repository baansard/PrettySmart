const Auth = {
  user: null,

  async init() {
    // If the session check errors or hangs, fall back to the login screen instead of a blank page.
    let session = null;
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('session check timed out')), 5000));
      ({ data: { session } } = await Promise.race([DB.auth.getSession(), timeout]));
    } catch (err) {
      console.error('Could not restore session:', err);
    }
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
    Study.init();
    Manage.init();
    PetProfile.init();
    MyPets.init();
    Coins.refresh();
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

// Wait for every script (Study, Manage, main.js…) to load before restoring the session.
window.addEventListener('DOMContentLoaded', () => Auth.init());
