// Coin balance button (top right). Coins come from the C# server.
const Coins = {
  value: 0,

  async refresh() {
    try {
      const { coins } = await Api.get('/coins');
      this.set(coins);
    } catch { /* keep showing the last known balance */ }
  },

  set(n) {
    this.value = n;
    const btn = document.getElementById('coins-btn');
    btn.classList.remove('hidden');
    document.getElementById('coins-count').textContent = n.toLocaleString();
    btn.classList.remove('bump');
    void btn.offsetWidth; // restart the bump animation
    btn.classList.add('bump');
  },
};

// Pet profile card — opens when you click an item in the pet shop. Also where you buy things.
const PetProfile = {
  _items: null,

  get visible() { return !document.getElementById('pet-overlay').classList.contains('hidden'); },

  init() {
    document.getElementById('pet-overlay').addEventListener('click', e => {
      if (e.target.id === 'pet-overlay' || e.target.id === 'pet-close') this.hide();
    });
  },

  // Loads the shop catalog once (names, prices, descriptions).
  async load() {
    if (!this._items) this._items = await Api.get('/shop/items').catch(() => null);
    return this._items;
  },

  item(id) { return this._items?.find(i => i.id === id); },

  // Display name for an item id, even before the catalog has loaded.
  nameOf(id) { return this.item(id)?.name ?? id; },

  _e(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },

  async show(id) {
    await this.load();
    const item = this.item(id);
    if (!item) return;
    const e = s => this._e(s);
    const isPet = item.kind === 'cat' || item.kind === 'fish';

    const kindLabel = { fish: 'fish', cat: 'cat', food: 'food', equipment: 'supplies' }[item.kind] ?? item.kind;
    const careLabel = ['', 'easy to care for', 'a little extra care', 'lots of love needed'][item.care] ?? '';
    const hearts = [1, 2, 3].map(n => `<span class="${n <= item.care ? 'on' : ''}">♥</span>`).join('');
    const hasDetails = isPet || item.personality.length > 0;

    const card = document.getElementById('pet-card');
    card.className = `kind-${item.kind}`;
    card.innerHTML = `
      <div class="pet-ribbon">${isPet ? 'pet profile' : 'shop item'}</div>
      <button class="pet-close" id="pet-close" title="close (Esc)" aria-label="close">✕</button>

      <div class="pet-top">
        <div class="pet-portrait">
          <span class="pet-sparkle s1">✦</span><span class="pet-sparkle s2">✧</span>
          <img src="${PetShop.imagePath(item.id)}" alt="${e(item.name)}" draggable="false" id="pet-art">
          <div class="pet-shadow"></div>
        </div>
        <div class="pet-heading">
          <span class="pet-kind">${kindLabel}</span>
          <h2 class="pet-name">${e(item.name)}</h2>
          ${item.type ? `<p class="pet-type">${e(item.type)}</p>` : ''}
          <span class="pet-price"><i class="coin"></i>${item.price.toLocaleString()} coins</span>
        </div>
      </div>

      <div class="pet-divider"><span>♡</span></div>

      <p class="pet-desc">${e(item.description)}</p>

      ${hasDetails ? `
      <div class="pet-details">
        ${item.personality.length ? `
        <div class="pet-detail">
          <span class="pet-label">${item.kind === 'food' ? 'flavor' : 'personality'}</span>
          <div class="pet-chips">${item.personality.map(p => `<span class="pet-chip">${e(p)}</span>`).join('')}</div>
        </div>` : ''}
        ${isPet ? `
        <div class="pet-detail">
          <span class="pet-label">care</span>
          <div class="pet-care"><span class="pet-hearts">${hearts}</span><small>${careLabel}</small></div>
        </div>` : ''}
      </div>` : ''}

      <div class="pet-buy" id="pet-buy"><p class="pet-buy-msg">checking…</p></div>
    `;

    // Art not drawn yet → friendly placeholder instead of a broken image.
    document.getElementById('pet-art').addEventListener('error', ev => {
      const note = document.createElement('span');
      note.className = 'pet-noart';
      note.textContent = 'art coming soon';
      ev.target.replaceWith(note);
    });

    document.getElementById('pet-overlay').classList.remove('hidden');

    const res = await Api.send('GET', '/shop/check/' + encodeURIComponent(id));
    if (!this.visible) return;
    if (res.ok) this._renderBuy(item, res.data);
    else document.getElementById('pet-buy').innerHTML = `<p class="pet-buy-msg">Couldn't check the shop right now.</p>`;
  },

  // Requirement checklist, what you own, coins progress and the Buy button.
  _renderBuy(item, check, note = '') {
    const box = document.getElementById('pet-buy');
    if (!box) return;
    const e = s => this._e(s);
    const isPet = item.kind === 'cat' || item.kind === 'fish';
    const short = Math.max(0, check.price - check.coins);
    const progress = Math.min(100, Math.round((check.coins / check.price) * 100));

    const reqs = check.requirements.length ? `
      <div class="pet-reqs">
        <span class="pet-label">you need</span>
        <ul>
          ${check.requirements.map(r => `
            <li class="${r.met ? 'met' : 'missing'}">
              <span class="req-mark">${r.met ? '✓' : '✕'}</span>
              <span class="req-name">${e(r.label)}</span>
              <small>${r.have}/${r.need}</small>
            </li>`).join('')}
        </ul>
      </div>` : '';

    const owned = check.owned > 0
      ? `<p class="pet-owned">${isPet ? 'You own' : 'You have'} <b>${check.owned}</b></p>` : '<span></span>';

    const savings = short > 0 ? `
      <div class="pet-savings">
        <div class="pet-bar"><div class="pet-bar-fill" style="width:${progress}%"></div></div>
        <p><b>${short.toLocaleString()}</b> more coins to go · you have ${check.coins.toLocaleString()}</p>
      </div>` : '';

    const reason = !check.canBuy && check.reason !== 'not_enough_coins'
      ? `<p class="pet-buy-msg">${e(check.message)}</p>` : '';

    box.innerHTML = `
      ${reqs}
      ${savings}
      <div class="pet-buy-row">
        ${owned}
        <button class="pet-buy-btn" id="pet-buy-btn" ${check.canBuy ? '' : 'disabled'}>
          Buy <i class="coin"></i>${check.price.toLocaleString()}
        </button>
      </div>
      ${note || reason}
    `;
    document.getElementById('pet-buy-btn').addEventListener('click', () => this._buy(item));
  },

  async _buy(item) {
    const btn = document.getElementById('pet-buy-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'buying…'; }

    const res = await Api.send('POST', '/shop/buy', { itemId: item.id });
    if (!res.ok) {
      const check = res.data?.requirements ? res.data : null;
      if (check) this._renderBuy(item, check, `<p class="pet-buy-msg">${this._e(check.message)}</p>`);
      else document.getElementById('pet-buy').innerHTML = '<p class="pet-buy-msg">Something went wrong. Try again?</p>';
      return;
    }

    Coins.set(res.data.coins);
    if (res.data.petId) this._askName(item, res.data);
    else this._renderBuy(item, res.data.check, '<p class="pet-buy-msg good">Added to your things.</p>');
  },

  // After buying a pet: give it a name (optional).
  _askName(item, result) {
    const box = document.getElementById('pet-buy');
    box.innerHTML = `
      <div class="pet-namer">
        <p class="pet-welcome">Welcome home! What should we call your new ${item.kind}?</p>
        <div class="pet-name-row">
          <input class="panel-input" id="pet-nickname" maxlength="40" placeholder="${this._e(item.name)}" autocomplete="off">
          <button class="pet-buy-btn" id="pet-name-save">save</button>
        </div>
        <button class="pet-skip" id="pet-name-skip">skip for now</button>
      </div>`;

    const input = document.getElementById('pet-nickname');
    const done = msg => this._renderBuy(item, result.check, `<p class="pet-buy-msg good">${msg}</p>`);
    const save = async () => {
      const name = input.value.trim();
      if (!name) return done('Adopted!');
      await Api.patch('/pets/' + encodeURIComponent(result.petId), { nickname: name }).catch(() => {});
      done(`Welcome home, ${this._e(name)}!`);
    };

    input.focus();
    input.addEventListener('keydown', e => {
      if (e.key !== 'Escape') e.stopPropagation(); // typing shouldn't move the player or trigger game keys
      if (e.key === 'Enter') save();
    });
    document.getElementById('pet-name-save').addEventListener('click', save);
    document.getElementById('pet-name-skip').addEventListener('click', () => done('Adopted! You can name them in My Pets.'));
  },

  hide() { document.getElementById('pet-overlay').classList.add('hidden'); },
};
