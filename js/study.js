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
    const data = await Api.get('/classes').catch(() => []);
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

  // Notebooks drawn in classoptions.png, left to right. left/width are % of the image width.
  _notebooks: [
    { label: 'MIS 405', left: 3,  width: 29 },
    { label: 'MIS 430', left: 36, width: 29 },
    { label: 'FI 302',  left: 70, width: 28 },
  ],

  // Tools drawn in studyoptions.png, left to right.
  _tools: [
    { key: 'book',       label: 'Book',       left: 2,  width: 31 },
    { key: 'flashcards', label: 'Flashcards', left: 34, width: 32 },
    { key: 'quiz',       label: 'Quiz',       left: 69, width: 29 },
  ],

  // "MIS 405", "mis405" and "Mis-405" all match each other.
  _norm(s) { return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''); },

  _renderClasses() {
    const byName = new Map(this.classes.map(c => [this._norm(c.name), c]));
    const drawn = new Set(this._notebooks.map(n => this._norm(n.label)));
    const extras = this.classes.filter(c => !drawn.has(this._norm(c.name)));

    this._panel.classList.add('art');
    this._panel.innerHTML = `
      <div class="art-wrap">
        <img src="assets/studytools/classoptions.png" alt="class notebooks" draggable="false">
        ${this._notebooks.map(n => {
          const c = byName.get(this._norm(n.label));
          return c
            ? `<button class="art-hotspot" style="left:${n.left}%;width:${n.width}%"
                 data-id="${this._e(c.id)}" data-name="${this._e(c.name)}" title="${this._e(c.name)}"></button>`
            : `<button class="art-hotspot missing" style="left:${n.left}%;width:${n.width}%" disabled
                 title="Add ${this._e(n.label)} in Manage to use this notebook"><span>add in Manage</span></button>`;
        }).join('')}
      </div>
      ${extras.length ? `
        <ul class="panel-list art-extras">
          ${extras.map(c => `
            <li class="panel-item" data-id="${this._e(c.id)}" data-name="${this._e(c.name)}">${this._e(c.name)}</li>`).join('')}
        </ul>` : ''}
    `;
    this._panel.querySelectorAll('[data-id]').forEach(el =>
      el.addEventListener('click', () => {
        this.selectedClass = { id: el.dataset.id, name: el.dataset.name };
        this._renderOptions();
      })
    );
  },

  _renderOptions() {
    this._panel.classList.add('art');
    this._panel.innerHTML = `
      <div class="art-header">
        <button class="panel-back" id="study-back">← back</button>
        <h2 class="panel-title">${this._e(this.selectedClass.name)}</h2>
      </div>
      <div class="art-wrap">
        <img src="assets/studytools/studyoptions.png" alt="study tools" draggable="false">
        ${this._tools.map(t => `
          <button class="art-hotspot" style="left:${t.left}%;width:${t.width}%"
            id="opt-${t.key}" title="${t.label}"></button>`).join('')}
      </div>
    `;
    document.getElementById('study-back').addEventListener('click', () => this._renderClasses());
    document.getElementById('opt-quiz').addEventListener('click', () => this._renderQuizChapters());
    // Book and flashcards will be wired up in a later step
  },

  // ── Quiz: pick a chapter ───────────────────────────────────────────────────
  async _renderQuizChapters() {
    this._panel.classList.remove('art');
    this._panel.innerHTML = '<p class="muted">loading…</p>';

    let chapters, points;
    try {
      [chapters, { points }] = await Promise.all([
        Api.get('/quiz/chapters?classId=' + encodeURIComponent(this.selectedClass.id)),
        Api.get('/quiz/points'),
      ]);
    } catch {
      this._panel.innerHTML = `
        <button class="panel-back" id="quiz-back">← back</button>
        <p class="quiz-msg">Couldn't load the quiz — check the server window for details.</p>`;
      document.getElementById('quiz-back').addEventListener('click', () => this._renderOptions());
      return;
    }
    this.points = points;

    const badge = c => {
      if (c.recentPercent === null) return '<span class="score-badge new">not tried yet</span>';
      const level = c.recentPercent >= 80 ? 'good' : c.recentPercent >= 60 ? 'ok' : 'weak';
      return `<span class="score-badge ${level}" title="% correct on your last ${c.recentAnswered} answers (up to 30)">${c.recentPercent}%</span>`;
    };

    this._panel.innerHTML = `
      <div class="quiz-top">
        <button class="panel-back" id="quiz-back">← back</button>
        <span class="points-pill">⭐ ${points} pts</span>
      </div>
      <h2 class="panel-title">quiz · ${this._e(this.selectedClass.name)}</h2>
      <p class="quiz-hint">pick a chapter · % is your last 30 answers</p>
      <ul class="panel-list">
        ${chapters.length ? chapters.map((c, i) => `
          <li class="panel-item row ${c.questionCount ? '' : 'muted'}" data-index="${i}">
            <span>${this._e(c.title)}<br><small class="q-meta">${c.questionCount} question${c.questionCount === 1 ? '' : 's'}</small></span>
            ${badge(c)}
          </li>`).join('')
        : '<li class="panel-item muted">No chapters yet — add some in Manage</li>'}
      </ul>
    `;
    document.getElementById('quiz-back').addEventListener('click', () => this._renderOptions());
    this._panel.querySelectorAll('.panel-item[data-index]:not(.muted)').forEach(el =>
      el.addEventListener('click', () => this._startQuiz(chapters[el.dataset.index]))
    );
  },

  // ── Quiz: answer questions ─────────────────────────────────────────────────
  async _startQuiz(chapter) {
    this._panel.innerHTML = '<p class="muted">loading…</p>';
    const params = new URLSearchParams({ classId: this.selectedClass.id, chapterId: chapter.chapterId ?? 'none' });
    const questions = await Api.get('/quiz/questions?' + params).catch(() => []);
    this._quiz = { chapter, questions, index: 0 };
    this._renderQuestion();
  },

  _renderQuestion() {
    const { chapter, questions, index } = this._quiz;
    const q = questions[index];

    const top = `
      <div class="quiz-top">
        <button class="panel-back" id="quiz-back">← chapters</button>
        <span class="points-pill" id="points-pill">⭐ ${this.points} pts</span>
      </div>
      <h2 class="panel-title">${this._e(chapter.title)}</h2>`;

    if (!q) {
      this._panel.innerHTML = `${top}
        <p class="quiz-msg">${questions.length ? "You've gone through every question in this chapter ✨" : 'No questions in this chapter yet.'}</p>
        ${questions.length ? '<button class="panel-btn" id="quiz-again">go again</button>' : ''}`;
      document.getElementById('quiz-back').addEventListener('click', () => this._renderQuizChapters());
      document.getElementById('quiz-again')?.addEventListener('click', () => this._startQuiz(chapter));
      return;
    }

    this._panel.innerHTML = `${top}
      <p class="quiz-question">${this._e(q.question)}</p>
      ${q.isTypeIn
        ? `<div class="panel-form">
             <input class="panel-input" id="quiz-input" placeholder="your answer" autocomplete="off">
             <button class="panel-btn" id="quiz-submit">check</button>
           </div>`
        : `<ul class="panel-list">
             ${q.choices.map((c, i) => `<li class="panel-item quiz-choice" data-index="${i}">${this._e(c)}</li>`).join('')}
           </ul>`}
      <div id="quiz-feedback"></div>
    `;
    document.getElementById('quiz-back').addEventListener('click', () => this._renderQuizChapters());

    if (q.isTypeIn) {
      const input = document.getElementById('quiz-input');
      input.focus();
      const submit = () => input.value.trim() && this._submitAnswer(q, input.value);
      document.getElementById('quiz-submit').addEventListener('click', submit);
      input.addEventListener('keydown', e => {
        if (e.key !== 'Escape') e.stopPropagation(); // typing "e" or "h" shouldn't trigger game keys
        if (e.key === 'Enter') submit();
      });
    } else {
      this._panel.querySelectorAll('.quiz-choice').forEach(el =>
        el.addEventListener('click', () => this._submitAnswer(q, q.choices[el.dataset.index], el))
      );
    }
  },

  async _submitAnswer(q, answer, choiceEl) {
    if (this._quiz.answered === q) return; // ignore double clicks
    this._quiz.answered = q;
    this._panel.querySelectorAll('.quiz-choice, #quiz-input, #quiz-submit').forEach(el => {
      el.classList.add('locked');
      el.disabled = true;
    });

    const feedback = document.getElementById('quiz-feedback');
    let result;
    try {
      result = await Api.post('/quiz/answers', { questionId: q.id, answer });
    } catch {
      feedback.innerHTML = '<p class="quiz-msg">Couldn\'t check that answer. Try again?</p>';
      this._quiz.answered = null;
      return;
    }

    this.points = result.totalPoints;
    document.getElementById('points-pill').textContent = `⭐ ${result.totalPoints} pts`;

    // Highlight the right choice (and the wrong pick, if any).
    this._panel.querySelectorAll('.quiz-choice').forEach(el => {
      if (q.choices[el.dataset.index] === result.correctAnswer) el.classList.add('right');
    });
    if (choiceEl && !result.correct) choiceEl.classList.add('wrong');

    feedback.innerHTML = `
      <p class="quiz-result ${result.correct ? 'right' : 'wrong'}">
        ${result.correct
          ? `✓ correct! +${result.pointsEarned} pts`
          : `✗ the answer was <b>${this._e(result.correctAnswer)}</b>`}
      </p>
      <button class="panel-btn" id="quiz-next">next →</button>`;
    const next = document.getElementById('quiz-next');
    next.focus();
    next.addEventListener('click', () => { this._quiz.index++; this._renderQuestion(); });
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
