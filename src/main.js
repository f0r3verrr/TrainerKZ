const STORAGE_KEY = 'socent-exam-stats-v1';

/** @typedef {{ id: number; question: string; variants: string[] }} Q */

/** @type {Q[]} */
let bank = [];

/** @type {'home'|'quiz'|'summary'|'answers'} */
let phase = 'home';

/** @type {'full'|'mistakes'|'weak'|'sample'} */
let sessionKind = 'full';

let examMode = false;
let shuffleQuestions = true;
const SAMPLE_SIZE = 20;

/** @type {number[]} */
let poolIds = [];

/** @type {number[]} */
let order = [];

let idx = 0;

/** @type {Set<number>} */
let wrongThisRound = new Set();

/** @type {{ id: number; chosen: number; correctIndex: number }[]} */
let examLedger = [];

/** @type {{ chosen: number; ok: boolean } | null} */
let lastResult = null;

/** @type {{ q: Q; texts: string[]; correctIndex: number } | null} */
let currentDisplay = null;
let keydownAttached = false;
let answersFilter = '';

function shuffleOrder(length) {
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function shuffledVariants(variants) {
  const ord = shuffleOrder(variants.length);
  const texts = ord.map((i) => variants[i]);
  const correctIndex = ord.indexOf(0);
  return { texts, correctIndex };
}

function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function statsSnapshot() {
  const stats = loadStats();
  let attempts = 0;
  let errors = 0;
  let unresolved = 0;
  for (const value of Object.values(stats)) {
    attempts += Number(value.attempts || 0);
    errors += Number(value.errors || 0);
    if (value.lastOk === false) unresolved += 1;
  }
  return {
    attempts,
    errors,
    unresolved,
    successRate: attempts ? Math.round(((attempts - errors) / attempts) * 100) : 0,
  };
}

function saveStats(stats) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

/** @param {number} questionId @param {boolean} ok */
function recordAttempt(questionId, ok) {
  const stats = loadStats();
  const s = stats[questionId] || { errors: 0, attempts: 0, lastOk: true };
  s.attempts += 1;
  if (!ok) s.errors += 1;
  s.lastOk = ok;
  stats[questionId] = s;
  saveStats(stats);
}

function resetAllStats() {
  localStorage.removeItem(STORAGE_KEY);
}

function qById(id) {
  return bank.find((q) => q.id === id);
}

function gradeExamRound() {
  wrongThisRound = new Set();
  for (const row of examLedger) {
    if (row.chosen !== row.correctIndex) wrongThisRound.add(row.id);
  }
}

function loadCurrentQuestion() {
  if (idx >= order.length) {
    phase = 'summary';
    currentDisplay = null;
    return;
  }
  const q = qById(order[idx]);
  if (!q) return;
  const { texts, correctIndex } = shuffledVariants(q.variants);
  currentDisplay = { q, texts, correctIndex };
}

/** @param {'full'|'mistakes'|'weak'|'sample'} kind @param {number[]} [mistakeIds] */
function startSession(kind, mistakeIds) {
  sessionKind = kind;
  wrongThisRound = new Set();
  examLedger = [];
  lastResult = null;

  if (kind === 'full') {
    poolIds = bank.map((q) => q.id);
  } else if (kind === 'mistakes') {
    poolIds = [...(mistakeIds || [])];
  } else if (kind === 'weak') {
    const stats = loadStats();
    poolIds = bank.filter((q) => stats[q.id]?.lastOk === false).map((q) => q.id);
  } else if (kind === 'sample') {
    const all = shuffleArray(bank.map((q) => q.id));
    poolIds = all.slice(0, Math.min(SAMPLE_SIZE, all.length));
  }

  if (poolIds.length === 0) {
    window.alert(
      kind === 'weak'
        ? 'Пока нет вопросов с ошибками в статистике — пройдите тест хотя бы раз.'
        : 'Нет вопросов для этого режима.'
    );
    phase = 'home';
    render();
    return;
  }

  order = shuffleQuestions ? shuffleArray(poolIds) : [...poolIds];
  idx = 0;
  phase = 'quiz';
  loadCurrentQuestion();
  render();
}

/** @param {number} optionIndex */
function handlePick(optionIndex) {
  if (!currentDisplay) return;

  const { q, correctIndex } = currentDisplay;

  if (examMode) {
    const ok = optionIndex === correctIndex;
    examLedger.push({ id: q.id, chosen: optionIndex, correctIndex });
    recordAttempt(q.id, ok);
    idx += 1;
    if (idx >= order.length) {
      gradeExamRound();
      phase = 'summary';
      currentDisplay = null;
    } else {
      loadCurrentQuestion();
    }
    render();
    return;
  }

  const ok = optionIndex === correctIndex;
  lastResult = { chosen: optionIndex, ok };
  recordAttempt(q.id, ok);
  if (!ok) wrongThisRound.add(q.id);
  render();
}

function advanceAfterFeedback() {
  lastResult = null;
  idx += 1;
  if (idx >= order.length) {
    phase = 'summary';
    currentDisplay = null;
  } else {
    loadCurrentQuestion();
  }
  render();
}

function sessionTitle() {
  if (sessionKind === 'full') return 'Полный тест';
  if (sessionKind === 'mistakes') return 'Повтор ошибок';
  if (sessionKind === 'weak') return 'Проблемные вопросы';
  return `Случайная выборка (${poolIds.length})`;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHome() {
  const stats = loadStats();
  const aggregate = statsSnapshot();
  const weakCount = bank.filter((q) => stats[q.id]?.lastOk === false).length;
  const loaded = bank.length > 0;

  const root = document.getElementById('app');
  root.innerHTML = `
    <header class="site-header">
      <h1>Тренажёр: социальное предпринимательство</h1>
      <p class="sub">${loaded ? bank.length + ' вопросов' : 'Загрузка…'} · варианты перемешиваются автоматически</p>
      <div class="hero-stats">
        <span class="pill">Ошибочных тем: ${weakCount}</span>
        <span class="pill">Попыток: ${aggregate.attempts}</span>
        <span class="pill">Точность: ${aggregate.successRate}%</span>
        <span class="pill">Незакрытых ошибок: ${aggregate.unresolved}</span>
      </div>
    </header>
    <div class="card">
      <h2>Режим</h2>
      <div class="row-actions">
        <button class="primary" type="button" id="btn-full" ${loaded ? '' : 'disabled'}>Полный тест</button>
        <button class="secondary" type="button" id="btn-sample" ${loaded ? '' : 'disabled'}>${SAMPLE_SIZE} случайных</button>
        <button class="secondary" type="button" id="btn-weak" ${loaded ? '' : 'disabled'}>Проблемные (${weakCount})</button>
        <button class="secondary" type="button" id="btn-answers" ${loaded ? '' : 'disabled'}>Все ответы</button>
      </div>
      <fieldset class="home-options">
        <legend>Параметры</legend>
        <label class="check"><input type="checkbox" id="chk-shuffle" checked /> Перемешивать порядок вопросов</label>
        <label class="check"><input type="checkbox" id="chk-exam" /> Режим экзамена (без подсказок до конца раунда)</label>
      </fieldset>
      <div class="stats-panel">
        Прогресс хранится в вашем браузере. Вопросов с ошибками: <strong>${weakCount}</strong>
      </div>
      <div class="row-actions">
        <button class="secondary" type="button" id="btn-reset-stats" ${loaded ? '' : 'disabled'}>Сбросить статистику</button>
      </div>
    </div>
  `;

  if (!loaded) return;

  document.getElementById('btn-full').onclick = () => {
    shuffleQuestions = /** @type {HTMLInputElement} */ (document.getElementById('chk-shuffle')).checked;
    examMode = /** @type {HTMLInputElement} */ (document.getElementById('chk-exam')).checked;
    startSession('full');
  };
  document.getElementById('btn-sample').onclick = () => {
    shuffleQuestions = /** @type {HTMLInputElement} */ (document.getElementById('chk-shuffle')).checked;
    examMode = /** @type {HTMLInputElement} */ (document.getElementById('chk-exam')).checked;
    startSession('sample');
  };
  document.getElementById('btn-weak').onclick = () => {
    shuffleQuestions = /** @type {HTMLInputElement} */ (document.getElementById('chk-shuffle')).checked;
    examMode = /** @type {HTMLInputElement} */ (document.getElementById('chk-exam')).checked;
    startSession('weak');
  };
  document.getElementById('btn-reset-stats').onclick = () => {
    if (window.confirm('Сбросить всю статистику ошибок в этом браузере?')) {
      resetAllStats();
      render();
    }
  };
  document.getElementById('btn-answers').onclick = () => {
    phase = 'answers';
    answersFilter = '';
    render();
  };
}

function renderQuizScreen() {
  const root = document.getElementById('app');
  if (phase === 'summary' || !currentDisplay) {
    renderSummary();
    return;
  }

  const { q, texts, correctIndex } = currentDisplay;
  const total = order.length;
  const pos = idx + 1;
  const pct = Math.round((idx / total) * 100);

  const showFeedback = !examMode && lastResult !== null;
  const lr = lastResult;

  const buttons = texts
    .map((t, i) => {
      let cls = 'option';
      if (showFeedback && lr) {
        if (i === lr.chosen && !lr.ok) cls += ' is-wrong';
        if (i === correctIndex) cls += ' is-right';
      }
      return `<button type="button" class="${cls}" data-i="${i}" ${showFeedback ? 'disabled' : ''}>${escapeHtml(t)}</button>`;
    })
    .join('');

  let feedbackHtml = '';
  if (showFeedback && lr) {
    if (lr.ok) {
      feedbackHtml = `<div class="feedback good"><strong>Верно.</strong></div>`;
    } else {
      feedbackHtml = `<div class="feedback bad"><strong>Неверно.</strong>
        Правильный ответ: ${escapeHtml(texts[correctIndex])}</div>`;
    }
    feedbackHtml += `<div class="row-actions"><button type="button" class="primary" id="btn-next">Далее</button></div>`;
  }

  root.innerHTML = `
    <header class="site-header">
      <h1>${escapeHtml(sessionTitle())}</h1>
      <p class="sub">Вопрос ${pos} из ${total}${examMode ? ' · режим экзамена' : ''}</p>
      <p class="hint">Горячие клавиши: <kbd>1</kbd>-<kbd>5</kbd></p>
    </header>
    <div class="progress-bar"><span style="width:${pct}%"></span></div>
    <div class="card">
      <div class="question-meta">№ ${q.id}</div>
      <p class="question-text">${escapeHtml(q.question)}</p>
      <div class="options" id="opts">${buttons}</div>
      ${feedbackHtml}
    </div>
    <div class="row-actions">
      <button type="button" class="secondary" id="btn-abort">Выйти на главную</button>
    </div>
  `;

  document.getElementById('btn-abort').onclick = () => {
    const confirmed = window.confirm('Выйти на главную? Текущий раунд будет прерван.');
    if (!confirmed) return;
    phase = 'home';
    lastResult = null;
    render();
  };

  if (showFeedback) {
    document.getElementById('btn-next').onclick = () => advanceAfterFeedback();
    return;
  }

  document.getElementById('opts').querySelectorAll('button.option').forEach((btn) => {
    btn.onclick = () => handlePick(Number(/** @type {HTMLElement} */ (btn).dataset.i));
  });
}

function renderSummary() {
  const root = document.getElementById('app');
  const total = order.length;
  const wrongCount = wrongThisRound.size;
  const correctCount = total - wrongCount;
  const pct = total ? Math.round((correctCount / total) * 100) : 0;

  const mistakes = [...wrongThisRound].sort((a, b) => a - b);
  const mistakeItems = mistakes
    .map((id) => {
      const q = qById(id);
      const snippet = q ? escapeHtml(q.question.slice(0, 120)) + (q.question.length > 120 ? '…' : '') : String(id);
      return `<li>№${id}: ${snippet}</li>`;
    })
    .join('');

  const perfect = wrongCount === 0;
  const gradeText = pct >= 90 ? 'Отлично' : pct >= 75 ? 'Хорошо' : pct >= 60 ? 'Неплохо' : 'Нужно закрепить';

  root.innerHTML = `
    <header class="site-header">
      <h1>Итог раунда</h1>
      <p class="sub">${escapeHtml(sessionTitle())}</p>
    </header>
    <div class="card">
      <div class="score-big">${correctCount} / ${total}</div>
      <p>${pct}% верных ответов · <strong>${gradeText}</strong></p>
      ${perfect ? '<p><strong>В этом раунде без ошибок.</strong></p>' : `<p>Ошибок: ${wrongCount}</p>`}
      ${
        mistakes.length
          ? `<details class="soft" open><summary>Список вопросов с ошибками</summary><ul class="mistake-list">${mistakeItems}</ul></details>`
          : ''
      }
      <div class="row-actions">
        ${
          wrongCount
            ? `<button type="button" class="primary" id="btn-repeat-wrong">Повторить только ошибочные (${wrongCount})</button>`
            : ''
        }
        <button type="button" class="secondary" id="btn-new-full">Новый полный тест</button>
        <button type="button" class="secondary" id="btn-home">На главную</button>
      </div>
    </div>
  `;

  const btnWrong = document.getElementById('btn-repeat-wrong');
  if (btnWrong) {
    btnWrong.onclick = () => {
      examMode = false;
      lastResult = null;
      startSession('mistakes', mistakes);
    };
  }
  document.getElementById('btn-new-full').onclick = () => {
    examMode = false;
    lastResult = null;
    startSession('full');
  };
  document.getElementById('btn-home').onclick = () => {
    phase = 'home';
    lastResult = null;
    render();
  };
}

function renderAnswersScreen() {
  const root = document.getElementById('app');
  root.innerHTML = `
    <header class="site-header">
      <h1>Все вопросы и правильные ответы</h1>
      <p class="sub" id="answers-counter"></p>
    </header>
    <div class="card">
      <label class="search-wrap">
        <span>Поиск</span>
        <input id="answers-search" type="text" placeholder="Например: маркетинг, гранты, Шумпетер" value="${escapeHtml(
          answersFilter
        )}" />
      </label>
      <div class="row-actions">
        <button type="button" class="secondary" id="btn-expand-all">Раскрыть все</button>
        <button type="button" class="secondary" id="btn-collapse-all">Свернуть все</button>
        <button type="button" class="primary" id="btn-answers-home">На главную</button>
      </div>
    </div>
    <div class="answer-list" id="answers-list"></div>
  `;

  const search = /** @type {HTMLInputElement} */ (document.getElementById('answers-search'));
  const list = document.getElementById('answers-list');
  const counter = document.getElementById('answers-counter');

  function drawAnswersList() {
    const query = answersFilter.trim().toLowerCase();
    const filtered = query
      ? bank.filter((q) => q.question.toLowerCase().includes(query) || q.variants[0].toLowerCase().includes(query))
      : bank;

    counter.textContent = `Показано ${filtered.length} из ${bank.length}`;

    const items = filtered
      .map(
        (q) => `
        <details class="answer-item">
          <summary>
            <span class="num">№${q.id}</span>
            <span>${escapeHtml(q.question)}</span>
          </summary>
          <p class="answer-correct"><span class="answer-badge">Правильный ответ</span> <span class="answer-value">${escapeHtml(
            q.variants[0]
          )}</span></p>
        </details>`
      )
      .join('');

    list.innerHTML = items || '<div class="card"><p>Ничего не найдено.</p></div>';
  }

  drawAnswersList();
  search.focus();
  search.addEventListener('input', (evt) => {
    answersFilter = /** @type {HTMLInputElement} */ (evt.target).value;
    drawAnswersList();
  });

  document.getElementById('btn-answers-home').onclick = () => {
    phase = 'home';
    render();
  };

  document.getElementById('btn-expand-all').onclick = () => {
    root.querySelectorAll('details.answer-item').forEach((el) => {
      el.open = true;
    });
  };
  document.getElementById('btn-collapse-all').onclick = () => {
    root.querySelectorAll('details.answer-item').forEach((el) => {
      el.open = false;
    });
  };
}

function render() {
  if (phase === 'home') renderHome();
  else if (phase === 'quiz') renderQuizScreen();
  else if (phase === 'summary') renderSummary();
  else renderAnswersScreen();
}

async function init() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}questions.json`);
    if (!res.ok) throw new Error(String(res.status));
    const loaded = await res.json();
    if (!Array.isArray(loaded)) {
      throw new Error('Invalid questions payload');
    }
    bank = loaded
      .filter((q) => q && typeof q.id === 'number' && typeof q.question === 'string' && Array.isArray(q.variants))
      .map((q) => ({
        id: q.id,
        question: q.question.trim(),
        variants: q.variants.map((v) => String(v).trim()).filter(Boolean).slice(0, 5),
      }))
      .filter((q) => q.question && q.variants.length >= 2);
    if (bank.length === 0) {
      throw new Error('No valid questions in payload');
    }
  } catch (e) {
    document.getElementById('app').innerHTML = `
      <header class="site-header"><h1>Ошибка загрузки</h1></header>
      <div class="card"><p>Не удалось загрузить базу вопросов. Запустите <code>npm run parse</code> и <code>npm run dev</code>.</p></div>`;
    console.error(e);
    return;
  }
  render();
}

if (!keydownAttached) {
  window.addEventListener('keydown', (evt) => {
    if (phase !== 'quiz' || !currentDisplay) return;
    if (!/^[1-5]$/.test(evt.key)) return;
    if (!examMode && lastResult) return;
    const idxNum = Number(evt.key) - 1;
    if (idxNum >= currentDisplay.texts.length) return;
    evt.preventDefault();
    handlePick(idxNum);
  });
  keydownAttached = true;
}

init();
