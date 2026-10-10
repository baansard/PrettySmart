const Manage = {
  visible: false,
  selectedClass: null,
  classes: [],

  _e(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },

  get _panel() { return document.getElementById('manage-panel'); },

  init() {
    document.getElementById('manage-btn').addEventListener('click', () => this.show());
    document.getElementById('manage-overlay').addEventListener('click', e => {
      if (e.target.id === 'manage-overlay') this.hide();
    });
  },

  async show() {
    this.visible = true;
    document.getElementById('manage-overlay').classList.remove('hidden');
    await this._loadClasses();
    this._renderClasses();
  },

  hide() {
    this.visible = false;
    document.getElementById('manage-overlay').classList.add('hidden');
  },

  async _loadClasses() {
    const data = await Api.get('/classes').catch(() => []);
    this.classes = data || [];
  },

  _on(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  },

  // ── Screen 1: class list ─────────────────────────────────────────────────
  _renderClasses() {
    this._panel.innerHTML = `
      <h2 class="panel-title">class</h2>
      <ul class="panel-list">
        ${this.classes.length
          ? this.classes.map(c => `
              <li class="panel-item" data-id="${this._e(c.id)}" data-name="${this._e(c.name)}">
                ${this._e(c.name)}
              </li>`).join('')
          : '<li class="panel-item muted">No classes yet</li>'}
      </ul>
      <button class="panel-link" id="manage-classes-btn">+ manage classes</button>
    `;
    this._panel.querySelectorAll('.panel-item[data-id]').forEach(el =>
      el.addEventListener('click', () => {
        this.selectedClass = { id: el.dataset.id, name: el.dataset.name };
        this._lastChapter = null;
        this._renderContent();
      })
    );
    this._on('manage-classes-btn', () => this._renderManageClasses());
  },

  // ── Screen 2: content type ───────────────────────────────────────────────
  _renderContent() {
    this._panel.innerHTML = `
      <button class="panel-back" id="back">← back</button>
      <h2 class="panel-title">${this._e(this.selectedClass.name)}</h2>
      <ul class="panel-list">
        <li class="panel-item" id="go-fc">flashcards</li>
        <li class="panel-item" id="go-quiz">quiz questions</li>
        <li class="panel-item" id="go-ch">book chapters / text</li>
      </ul>
    `;
    this._on('back',    () => this._renderClasses());
    this._on('go-fc',   () => this._renderFlashcards());
    this._on('go-quiz', () => this._renderQuiz());
    this._on('go-ch',   () => this._renderChapters());
  },

  // Chapters for the selected class, in the order they were added.
  async _loadChapters() {
    const { data } = await DB.from('chapters').select('id, title').eq('class_id', this.selectedClass.id).order('id');
    return data || [];
  },

  // Chapter picker for the add forms. Remembers the last chapter used.
  _chapterSelect(id, chapters) {
    if (!chapters.length) return '';
    const last = String(this._lastChapter ?? '');
    return `
      <select class="panel-input" id="${id}">
        <option value="">no chapter</option>
        ${chapters.map(c => `<option value="${this._e(c.id)}" ${String(c.id) === last ? 'selected' : ''}>${this._e(c.title)}</option>`).join('')}
      </select>`;
  },

  // Groups items under their chapter (in chapter order, "No chapter" last).
  // renderItem(item) returns the <li> for one item.
  _chapterGroups(items, chapters, renderItem, emptyText) {
    const groups = chapters.map(c => ({ label: c.title, items: items.filter(i => String(i.chapter_id) === String(c.id)) }));
    const known = new Set(chapters.map(c => String(c.id)));
    groups.push({ label: 'No chapter', items: items.filter(i => i.chapter_id == null || !known.has(String(i.chapter_id))) });

    const html = groups.filter(g => g.items.length).map(g => `
      <div class="q-group">
        <div class="q-group-label">${this._e(g.label)} <span class="q-count">${g.items.length}</span></div>
        <ul class="panel-list">${g.items.map(renderItem).join('')}</ul>
      </div>`).join('');
    return html || `<p class="muted" style="font-size:13px;padding:4px 0">${emptyText}</p>`;
  },

  // ── Screen 3a: flashcards (grouped by chapter) ───────────────────────────
  async _renderFlashcards() {
    const [chapters, { data: cards }] = await Promise.all([
      this._loadChapters(),
      DB.from('flashcards').select('*').eq('class_id', this.selectedClass.id).order('id'),
    ]);

    this._panel.innerHTML = `
      <button class="panel-back" id="back">← back</button>
      <h2 class="panel-title">flashcards · ${this._e(this.selectedClass.name)}</h2>
      <div class="panel-form">
        <input id="fc-term" class="panel-input" placeholder="term" />
        <textarea id="fc-def" class="panel-textarea" placeholder="definition"></textarea>
        ${this._chapterSelect('fc-chapter', chapters)}
        <button class="panel-btn" id="fc-save">save</button>
        <p class="auth-error" id="fc-error"></p>
      </div>
      ${this._chapterGroups(cards || [], chapters, c => `
        <li class="panel-item row small">
          <span><b>${this._e(c.term)}</b> — ${this._e(c.definition)}</span>
          <button class="del-btn" data-id="${c.id}">✕</button>
        </li>`, 'No flashcards yet')}
    `;
    this._on('back', () => this._renderContent());
    this._on('fc-save', async () => {
      const term = document.getElementById('fc-term').value.trim();
      const def  = document.getElementById('fc-def').value.trim();
      if (!term || !def) return;
      const chapter_id = document.getElementById('fc-chapter')?.value || null;
      this._lastChapter = chapter_id;
      const { error } = await DB.from('flashcards').insert({ class_id: this.selectedClass.id, term, definition: def, chapter_id });
      if (error) {
        document.getElementById('fc-error').textContent = error.message.includes('chapter_id')
          ? 'Flashcard chapters need a one-time database update (server/sql/002_flashcard_chapters.sql).'
          : error.message;
        return;
      }
      this._renderFlashcards();
    });
    this._panel.querySelectorAll('.del-btn').forEach(b =>
      b.addEventListener('click', async () => {
        await DB.from('flashcards').delete().eq('id', b.dataset.id);
        this._renderFlashcards();
      })
    );
  },

  // ── Screen 3b: quiz questions (grouped by chapter) ───────────────────────
  async _renderQuiz() {
    const [chapters, { data: qs }] = await Promise.all([
      this._loadChapters(),
      DB.from('quiz_questions').select('*').eq('class_id', this.selectedClass.id).order('id'),
    ]);

    const chapterSelect = this._chapterSelect('q-chapter', chapters);

    const groupsHtml = this._chapterGroups(qs || [], chapters, q => `
      <li class="panel-item q-item">
        <div class="q-info">
          <div class="q-text">${this._e(q.question)}</div>
          <div class="q-meta">
            ${q.is_math ? 'type-in' : 'multiple choice'}
            ${q.question_type === 'multiple_choice' && q.choices
              ? ' · ' + q.choices.map((c,i) => `<span class="${c === q.correct_answer ? 'q-correct' : ''}">${String.fromCharCode(65+i)}) ${this._e(c)}</span>`).join('  ')
              : ' · answer: <span class="q-correct">' + this._e(q.correct_answer) + '</span>'}
          </div>
        </div>
        <button class="del-btn" data-id="${q.id}">✕</button>
      </li>`, 'No questions yet');

    this._panel.innerHTML = `
      <button class="panel-back" id="back">← back</button>
      <h2 class="panel-title">quiz questions · ${this._e(this.selectedClass.name)}</h2>
      <div class="panel-form">
        <textarea id="q-text" class="panel-textarea" placeholder="question"></textarea>
        ${chapterSelect}
        <label class="panel-check"><input type="checkbox" id="q-math"> math / type-in answer</label>
        <div id="mc-fields">
          <input class="panel-input" id="q-a" placeholder="choice A" />
          <input class="panel-input" id="q-b" placeholder="choice B" />
          <input class="panel-input" id="q-c" placeholder="choice C (optional)" />
          <input class="panel-input" id="q-d" placeholder="choice D (optional)" />
          <select class="panel-input" id="q-mc-ans">
            <option value="0">A is correct</option>
            <option value="1">B is correct</option>
            <option value="2">C is correct</option>
            <option value="3">D is correct</option>
          </select>
        </div>
        <div id="ti-fields" class="hidden">
          <input class="panel-input" id="q-ti-ans" placeholder="correct answer" />
        </div>
        <button class="panel-btn" id="q-save">save</button>
      </div>
      ${groupsHtml}
    `;

    this._on('back', () => this._renderContent());
    const mathCb = document.getElementById('q-math');
    mathCb.addEventListener('change', () => {
      document.getElementById('mc-fields').classList.toggle('hidden', mathCb.checked);
      document.getElementById('ti-fields').classList.toggle('hidden', !mathCb.checked);
    });
    this._on('q-save', async () => {
      const question   = document.getElementById('q-text').value.trim();
      if (!question) return;
      const chapterEl  = document.getElementById('q-chapter');
      const chapter_id = chapterEl?.value || null;
      this._lastChapter = chapter_id;
      let payload;
      if (mathCb.checked) {
        const answer = document.getElementById('q-ti-ans').value.trim();
        if (!answer) return;
        payload = { class_id: this.selectedClass.id, question, question_type: 'type_in', is_math: true, correct_answer: answer, chapter_id: chapter_id || null };
      } else {
        const choices = ['q-a','q-b','q-c','q-d']
          .map(id => document.getElementById(id).value.trim()).filter(Boolean);
        if (choices.length < 2) return;
        const idx = Math.min(parseInt(document.getElementById('q-mc-ans').value), choices.length - 1);
        payload = { class_id: this.selectedClass.id, question, question_type: 'multiple_choice', is_math: false, choices, correct_answer: choices[idx], chapter_id: chapter_id || null };
      }
      await DB.from('quiz_questions').insert(payload);
      this._renderQuiz();
    });
    this._panel.querySelectorAll('.del-btn').forEach(b =>
      b.addEventListener('click', async () => {
        await DB.from('quiz_questions').delete().eq('id', b.dataset.id);
        this._renderQuiz();
      })
    );
  },

  // ── Screen 3c: chapters ──────────────────────────────────────────────────
  async _renderChapters() {
    const { data: chs } = await DB.from('chapters')
      .select('*').eq('class_id', this.selectedClass.id).order('id');

    this._panel.innerHTML = `
      <button class="panel-back" id="back">← back</button>
      <h2 class="panel-title">chapters · ${this._e(this.selectedClass.name)}</h2>
      <div class="panel-form">
        <input id="ch-title" class="panel-input" placeholder="chapter title" />
        <textarea id="ch-content" class="panel-textarea tall" placeholder="paste chapter text here..."></textarea>
        <button class="panel-btn" id="ch-save">save</button>
      </div>
      <ul class="panel-list small">
        ${(chs || []).map(c => `
          <li class="panel-item row">
            <span>${this._e(c.title)}</span>
            <button class="del-btn" data-id="${c.id}">✕</button>
          </li>`).join('')}
      </ul>
    `;
    this._on('back', () => this._renderContent());
    this._on('ch-save', async () => {
      const title   = document.getElementById('ch-title').value.trim();
      const content = document.getElementById('ch-content').value.trim();
      if (!title || !content) return;
      await DB.from('chapters').insert({ class_id: this.selectedClass.id, title, content });
      this._renderChapters();
    });
    this._panel.querySelectorAll('.del-btn').forEach(b =>
      b.addEventListener('click', async () => {
        await DB.from('chapters').delete().eq('id', b.dataset.id);
        this._renderChapters();
      })
    );
  },

  // ── Manage classes ───────────────────────────────────────────────────────
  async _renderManageClasses() {
    this._panel.innerHTML = `
      <button class="panel-back" id="back">← back</button>
      <h2 class="panel-title">manage classes</h2>
      <div class="panel-form">
        <input id="new-class" class="panel-input" placeholder="e.g. MIS 430" />
        <button class="panel-btn" id="cls-save">add class</button>
      </div>
      <ul class="panel-list">
        ${this.classes.map(c => `
          <li class="panel-item row">
            <span>${this._e(c.name)}</span>
            <button class="del-btn" data-id="${c.id}">✕</button>
          </li>`).join('')}
      </ul>
    `;
    this._on('back', async () => { await this._loadClasses(); this._renderClasses(); });
    this._on('cls-save', async () => {
      const name = document.getElementById('new-class').value.trim();
      if (!name) return;
      await Api.post('/classes', { name });
      await this._loadClasses();
      this._renderManageClasses();
    });
    this._panel.querySelectorAll('.del-btn').forEach(b =>
      b.addEventListener('click', async () => {
        await Api.del('/classes/' + encodeURIComponent(b.dataset.id));
        await this._loadClasses();
        this._renderManageClasses();
      })
    );
  },
};
