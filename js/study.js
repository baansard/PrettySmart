// Study menu — HTML overlay, opens when player presses E near the desk.
const Study = {
  open: false,
  selectedClass: null,
  classes: [],

  _desk: { x: 570, y: 170, w: 100, h: 62 },
  _proximity: 80,

  isNearDesk(player) {
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    const cx = this._desk.x + this._desk.w / 2;
    const cy = this._desk.y + this._desk.h / 2;
    return Math.abs(px - cx) < this._proximity && Math.abs(py - cy) < this._proximity;
  },

  init() {
    document.getElementById('study-overlay').addEventListener('click', e => {
      if (e.target.id === 'study-overlay') this.close();
    });
  },

  async openMenu() {
    this.open = true;
    document.getElementById('study-overlay').classList.remove('hidden');
    const { data } = await DB.from('classes').select('*').order('name');
    this.classes = data || [];
    this._renderClasses();
  },

  close() {
    this.open = false;
    this.selectedClass = null;
    document.getElementById('study-overlay').classList.add('hidden');
  },

  get _panel() { return document.getElementById('study-panel'); },

  _e(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  },

  _renderClasses() {
    this._panel.innerHTML = `
      <h2 class="panel-title">study</h2>
      <ul class="panel-list">
        ${this.classes.length
          ? this.classes.map(c => `
              <li class="panel-item" data-id="${this._e(c.id)}" data-name="${this._e(c.name)}">
                ${this._e(c.name)}
              </li>`).join('')
          : '<li class="panel-item muted">No classes yet — add some in Manage</li>'}
      </ul>
    `;
    this._panel.querySelectorAll('.panel-item[data-id]').forEach(el =>
      el.addEventListener('click', () => {
        this.selectedClass = { id: el.dataset.id, name: el.dataset.name };
        this._renderOptions();
      })
    );
  },

  _renderOptions() {
    this._panel.innerHTML = `
      <button class="panel-back" id="study-back">← back</button>
      <h2 class="panel-title">${this._e(this.selectedClass.name)}</h2>
      <ul class="panel-list">
        <li class="panel-item" id="opt-book">Book</li>
        <li class="panel-item" id="opt-flashcards">Flashcards</li>
        <li class="panel-item" id="opt-quiz">Quiz</li>
      </ul>
    `;
    document.getElementById('study-back').addEventListener('click', () => this._renderClasses());
    // Study activities will be wired up in a later step
  },

  // Call while camera transform is active — draws "Press E" in world space above desk.
  drawPrompt(ctx) {
    const x  = this._desk.x + this._desk.w / 2;
    const y  = this._desk.y - 18;
    const label = "Press E";
    ctx.font = "bold 13px sans-serif";
    const tw = ctx.measureText(label).width;
    const pw = tw + 16;
    const ph = 20;
    const rx = x - pw / 2;
    const ry = y - ph;
    ctx.fillStyle = "rgba(255,182,193,0.92)";
    ctx.beginPath();
    ctx.roundRect(rx, ry, pw, ph, 6);
    ctx.fill();
    ctx.fillStyle = "#5a2030";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, ry + ph / 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  },
};
