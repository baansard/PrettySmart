// My Pets panel — everything you own (pets, equipment, food), opened from the sidebar.
const MyPets = {
  get visible() { return !document.getElementById('pets-overlay').classList.contains('hidden'); },

  init() {
    document.getElementById('my-pets-btn').addEventListener('click', () => this.visible ? this.hide() : this.show());
    document.getElementById('pets-overlay').addEventListener('click', e => {
      if (e.target.id === 'pets-overlay') this.hide();
    });
  },

  get _panel() { return document.getElementById('pets-panel'); },

  _e(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },

  async show() {
    document.getElementById('pets-overlay').classList.remove('hidden');
    this._panel.innerHTML = '<p class="muted">loading…</p>';
    const [me] = await Promise.all([Api.get('/me').catch(() => null), PetProfile.load()]);
    if (!me) {
      this._panel.innerHTML = '<p class="quiz-msg">Couldn\'t load your pets right now.</p>';
      return;
    }
    Coins.set(me.coins);
    this._render(me);
  },

  hide() { document.getElementById('pets-overlay').classList.add('hidden'); },

  _render(me) {
    const e = s => this._e(s);
    const thumb = id => `<img class="mp-thumb" src="${PetShop.imagePath(id)}" alt="" onerror="this.style.visibility='hidden'">`;
    const status = s => s === 'healthy' ? '' : `<span class="mp-status ${e(s)}">${s === 'dead' ? 'passed away' : e(s)}</span>`;

    const petRows = kind => me.pets.filter(p => p.kind === kind).map(p => `
      <li class="panel-item mp-row" data-id="${e(p.id)}">
        ${thumb(p.speciesId)}
        <div class="mp-info">
          <span class="mp-name">${e(p.nickname || PetProfile.nameOf(p.speciesId))}</span>
          ${p.nickname ? `<small class="mp-sub">${e(PetProfile.nameOf(p.speciesId))}</small>` : '<small class="mp-sub">no name yet</small>'}
        </div>
        ${status(p.status)}
        <button class="panel-link mp-rename">${p.nickname ? 'rename' : 'name'}</button>
      </li>`).join('');

    const section = (title, rows) => rows ? `
      <div class="q-group">
        <div class="q-group-label">${title}</div>
        <ul class="panel-list">${rows}</ul>
      </div>` : '';

    const supplies = me.inventory.map(i => `
      <li class="panel-item mp-row">
        ${thumb(i.itemId)}
        <div class="mp-info"><span class="mp-name">${e(PetProfile.nameOf(i.itemId))}</span></div>
        <span class="mp-qty">×${i.quantity}</span>
      </li>`).join('');

    const empty = !me.pets.length && !me.inventory.length;
    this._panel.innerHTML = `
      <h2 class="panel-title">my pets</h2>
      ${empty ? '<p class="quiz-msg">Nothing here yet. Earn coins with quizzes, then visit the Pet Shop!</p>' : ''}
      ${section(`cats <span class="q-count">${me.pets.filter(p => p.kind === 'cat').length}</span>`, petRows('cat'))}
      ${section(`fish <span class="q-count">${me.pets.filter(p => p.kind === 'fish').length}</span>`, petRows('fish'))}
      ${section('supplies', supplies)}
    `;

    this._panel.querySelectorAll('.mp-rename').forEach(btn =>
      btn.addEventListener('click', () => this._rename(btn.closest('.mp-row'), me)));
  },

  _rename(row, me) {
    const pet = me.pets.find(p => String(p.id) === row.dataset.id);
    const info = row.querySelector('.mp-info');
    info.innerHTML = `<input class="panel-input mp-input" maxlength="40" value="${this._e(pet.nickname ?? '')}" placeholder="${this._e(PetProfile.nameOf(pet.speciesId))}">`;
    row.querySelector('.mp-rename').textContent = 'save';
    const input = info.querySelector('input');
    input.focus();

    const save = async () => {
      const name = input.value.trim();
      await Api.patch('/pets/' + encodeURIComponent(pet.id), { nickname: name }).catch(() => {});
      pet.nickname = name || null;
      this._render(me);
    };
    input.addEventListener('keydown', e => {
      if (e.key !== 'Escape') e.stopPropagation(); // typing shouldn't move the player
      if (e.key === 'Enter') save();
    });
    const btn = row.querySelector('.mp-rename');
    btn.replaceWith(btn.cloneNode(true)); // drop the old "rename" handler
    row.querySelector('.mp-rename').addEventListener('click', save);
  },
};
