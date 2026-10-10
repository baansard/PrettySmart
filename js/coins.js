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

// Pet profile card — opens when you click an item in the pet shop.
const PetProfile = {
  _items: null,

  get visible() { return !document.getElementById('pet-overlay').classList.contains('hidden'); },

  init() {
    document.getElementById('pet-overlay').addEventListener('click', e => {
      if (e.target.id === 'pet-overlay' || e.target.id === 'pet-close') this.hide();
    });
  },

  async show(id) {
    try {
      this._items ??= await Api.get('/shop/items');
    } catch {
      return;
    }
    const item = this._items.find(i => i.id === id);
    if (!item) return;

    const img = item.kind === 'fish' ? `assets/fish/${item.id}.png`
              : item.kind === 'cat'  ? `assets/cat/${item.id}front.png`
              : `assets/${item.id}.png`;
    const e = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const kindLabel = { fish: 'fish', cat: 'cat', food: 'treat' }[item.kind] ?? item.kind;
    const careLabel = ['', 'easy to care for', 'a little extra care', 'lots of love needed'][item.care];
    const hearts = [1, 2, 3].map(n => `<span class="${n <= item.care ? 'on' : ''}">♥</span>`).join('');

    const have = Coins.value;
    const progress = Math.min(100, Math.round((have / item.price) * 100));
    const short = item.price - have;

    const card = document.getElementById('pet-card');
    card.className = `kind-${item.kind}`;
    card.innerHTML = `
      <div class="pet-ribbon">pet profile</div>
      <button class="pet-close" id="pet-close" title="close (Esc)" aria-label="close">✕</button>

      <div class="pet-top">
        <div class="pet-portrait">
          <span class="pet-sparkle s1">✦</span><span class="pet-sparkle s2">✧</span>
          <img src="${img}" alt="${e(item.name)}" draggable="false">
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

      <div class="pet-details">
        <div class="pet-detail">
          <span class="pet-label">${item.kind === "food" ? "flavor" : "personality"}</span>
          <div class="pet-chips">${item.personality.map(p => `<span class="pet-chip">${e(p)}</span>`).join('')}</div>
        </div>
        ${item.kind === "food" ? "" : `
        <div class="pet-detail">
          <span class="pet-label">care</span>
          <div class="pet-care"><span class="pet-hearts">${hearts}</span><small>${careLabel}</small></div>
        </div>`}
      </div>

      <div class="pet-savings ${short <= 0 ? 'ready' : ''}">
        <div class="pet-bar"><div class="pet-bar-fill" style="width:${progress}%"></div></div>
        <p>${short <= 0
          ? 'you have enough coins!'
          : `<b>${short.toLocaleString()}</b> more coins to go · you have ${have.toLocaleString()}`}</p>
      </div>
    `;
    document.getElementById('pet-overlay').classList.remove('hidden');
  },

  hide() { document.getElementById('pet-overlay').classList.add('hidden'); },
};
