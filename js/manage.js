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
        this._ai = null;
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
        <li class="panel-item" id="go-ai">generate with AI</li>
      </ul>
    `;
    this._on('back',    () => this._renderClasses());
    this._on('go-fc',   () => this._renderFlashcards());
    this._on('go-quiz', () => this._renderQuiz());
    this._on('go-ch',   () => this._renderChapters());
    this._on('go-ai',   () => this._renderAi());
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

  // ── Screen 3d: generate study material with AI ───────────────────────────
  // Paste any text → choose how many of each → review/edit drafts → save into a chapter.
  async _renderAi() {
    const chapters = await this._loadChapters();
    const ai = this._ai ??= { text: '', mc: 5, typeIn: 0, cards: 10, drafts: null };

    this._panel.innerHTML = `
      <button class="panel-back" id="back">← back</button>
      <h2 class="panel-title">generate with AI · ${this._e(this.selectedClass.name)}</h2>
      <div class="panel-form">
        <textarea id="ai-text" class="panel-textarea tall" placeholder="paste notes, a chapter, slide text…">${this._e(ai.text)}</textarea>
        <small class="ai-count" id="ai-count"></small>
        <div class="ai-nums">
          <label>multiple choice<input type="number" class="panel-input" id="ai-mc" min="0" max="30" value="${ai.mc}"></label>
          <label>type-in<input type="number" class="panel-input" id="ai-typein" min="0" max="30" value="${ai.typeIn}"></label>
          <label>flashcards<input type="number" class="panel-input" id="ai-cards" min="0" max="30" value="${ai.cards}"></label>
        </div>
        <button class="panel-btn" id="ai-go">generate</button>
        <p class="ai-status" id="ai-status"></p>
      </div>
      <div id="ai-drafts"></div>
    `;
    this._on('back', () => this._renderContent());

    const text = document.getElementById('ai-text');
    const count = () => {
      document.getElementById('ai-count').textContent = `${text.value.length.toLocaleString()} / 60,000 characters`;
      ai.text = text.value;
    };
    text.addEventListener('input', count);
    count();

    this._on('ai-go', () => this._generate(chapters));
    if (ai.drafts) this._renderDrafts(chapters);
  },

  async _generate(chapters) {
    const ai = this._ai;
    const num = id => Math.max(0, Math.min(30, parseInt(document.getElementById(id).value, 10) || 0));
    ai.mc = num('ai-mc'); ai.typeIn = num('ai-typein'); ai.cards = num('ai-cards');

    const status = document.getElementById('ai-status');
    const btn = document.getElementById('ai-go');
    btn.disabled = true;
    btn.textContent = 'generating…';
    status.textContent = 'This can take up to a minute for long text.';
    status.className = 'ai-status';

    const res = await Api.send('POST', '/ai/generate', {
      text: ai.text, multipleChoice: ai.mc, typeIn: ai.typeIn, flashcards: ai.cards,
    });

    if (!document.getElementById('ai-go')) return; // left the screen while waiting
    btn.disabled = false;
    btn.textContent = 'generate again';
    if (!res.ok) {
      status.textContent = res.data?.detail ?? 'Something went wrong. Try again?';
      status.className = 'ai-status bad';
      return;
    }
    ai.drafts = res.data;
    const made = ai.drafts.questions.length + ai.drafts.flashcards.length;
    status.textContent = made ? 'Review and edit below, then save the ones you want.' : 'The AI didn\'t find enough to make anything. Try more text?';
    this._renderDrafts(chapters);
  },

  // Editable drafts. Nothing is saved until "save".
  _renderDrafts(chapters) {
    const ai = this._ai;
    const box = document.getElementById('ai-drafts');
    const e = s => this._e(s);
    const { questions, flashcards } = ai.drafts;
    if (!questions.length && !flashcards.length) { box.innerHTML = ''; return; }

    const letters = ['A', 'B', 'C', 'D'];
    const questionHtml = (q, i) => `
      <li class="panel-item ai-draft" data-q="${i}">
        <button class="del-btn ai-remove" title="remove">✕</button>
        <textarea class="panel-textarea ai-q">${e(q.question)}</textarea>
        ${q.type === 'multiple_choice'
          ? q.choices.map((c, j) => `
            <label class="ai-choice">
              <input type="radio" name="ai-correct-${i}" value="${j}" ${c === q.correctAnswer ? 'checked' : ''} title="correct answer">
              <span>${letters[j]}</span>
              <input class="panel-input ai-c" value="${e(c)}">
            </label>`).join('')
          : `<label class="ai-choice"><span>answer</span><input class="panel-input ai-a" value="${e(q.correctAnswer)}"></label>`}
        <small class="q-meta">${q.type === 'multiple_choice' ? 'multiple choice · pick the correct one' : 'type-in'}</small>
      </li>`;

    const cardHtml = (f, i) => `
      <li class="panel-item ai-draft" data-f="${i}">
        <button class="del-btn ai-remove" title="remove">✕</button>
        <input class="panel-input ai-term" value="${e(f.term)}">
        <textarea class="panel-textarea ai-def">${e(f.definition)}</textarea>
      </li>`;

    box.innerHTML = `
      ${questions.length ? `
        <div class="q-group">
          <div class="q-group-label">quiz questions <span class="q-count">${questions.length}</span></div>
          <ul class="panel-list">${questions.map(questionHtml).join('')}</ul>
        </div>` : ''}
      ${flashcards.length ? `
        <div class="q-group">
          <div class="q-group-label">flashcards <span class="q-count">${flashcards.length}</span></div>
          <ul class="panel-list">${flashcards.map(cardHtml).join('')}</ul>
        </div>` : ''}
      <div class="panel-form ai-save">
        <label class="ai-into">save into ${this._chapterSelect('ai-chapter', chapters) || '<span class="muted">(no chapters yet)</span>'}</label>
        <button class="panel-btn" id="ai-save">save ${questions.length + flashcards.length} items</button>
        <p class="ai-status" id="ai-save-status"></p>
      </div>
    `;

    box.querySelectorAll('.ai-remove').forEach(b => b.addEventListener('click', () => {
      this._collectDrafts();
      const li = b.closest('.ai-draft');
      if (li.dataset.q !== undefined) ai.drafts.questions.splice(+li.dataset.q, 1);
      else ai.drafts.flashcards.splice(+li.dataset.f, 1);
      this._renderDrafts(chapters);
    }));
    this._on('ai-save', () => this._saveDrafts(chapters));
  },

  // Reads any edits from the draft inputs back into this._ai.drafts.
  _collectDrafts() {
    const box = document.getElementById('ai-drafts');
    const { questions, flashcards } = this._ai.drafts;
    box.querySelectorAll('[data-q]').forEach(li => {
      const q = questions[+li.dataset.q];
      q.question = li.querySelector('.ai-q').value;
      if (q.type === 'multiple_choice') {
        q.choices = [...li.querySelectorAll('.ai-c')].map(i => i.value);
        const picked = li.querySelector('input[type=radio]:checked');
        q.correctAnswer = picked ? q.choices[+picked.value] : '';
      } else {
        q.correctAnswer = li.querySelector('.ai-a').value;
      }
    });
    box.querySelectorAll('[data-f]').forEach(li => {
      const f = flashcards[+li.dataset.f];
      f.term = li.querySelector('.ai-term').value;
      f.definition = li.querySelector('.ai-def').value;
    });
  },

  async _saveDrafts(chapters) {
    this._collectDrafts();
    const chapterId = document.getElementById('ai-chapter')?.value || null;
    this._lastChapter = chapterId;
    const status = document.getElementById('ai-save-status');
    status.textContent = 'saving…';
    status.className = 'ai-status';

    const res = await Api.send('POST', '/ai/save', {
      classId: this.selectedClass.id, chapterId,
      questions: this._ai.drafts.questions, flashcards: this._ai.drafts.flashcards,
    });
    if (!res.ok) {
      status.textContent = res.data?.detail ?? 'Couldn\'t save. Try again?';
      status.className = 'ai-status bad';
      return;
    }
    const where = chapterId ? chapters.find(c => String(c.id) === String(chapterId))?.title : 'No chapter';
    this._ai.drafts = null;
    this._renderDrafts(chapters);
    const top = document.getElementById('ai-status');
    top.textContent = `Saved ${res.data.questions} questions and ${res.data.flashcards} flashcards to ${where}.`;
    top.className = 'ai-status good';
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
