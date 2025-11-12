const STORAGE_KEY = 'flashcards_pro_violet';

const DEFAULT_SCHEDULE = {
  days: {
    mon: true,
    tue: true,
    wed: true,
    thu: true,
    fri: true,
    sat: false,
    sun: false,
  },
  enforce: false,
};

let state = {
  decks: [],
  selectedDeckId: null,
  mode: 'manage',
  studyQueue: [],
  studyIndex: 0,
  studyShowAnswer: false,
  stats: { streak: 0, studiedToday: 0, lastDate: null },
  schedule: DEFAULT_SCHEDULE,
};

// --- storage
const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9);
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const load = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    Object.assign(state, JSON.parse(raw));
    state.schedule = state.schedule || DEFAULT_SCHEDULE;
    state.schedule.days = Object.assign(
      {
        mon: false,
        tue: false,
        wed: false,
        thu: false,
        fri: false,
        sat: false,
        sun: false,
      },
      state.schedule.days || {}
    );
    if (typeof state.schedule.enforce !== 'boolean')
      state.schedule.enforce = false;
  } catch (e) {}
};

function showToast(msg) {
  const box = document.createElement('div');
  box.className = 'toast';
  box.textContent = msg;
  document.getElementById('toastContainer').appendChild(box);
  setTimeout(() => box.classList.add('show'), 10);
  setTimeout(() => {
    box.classList.remove('show');
    setTimeout(() => box.remove(), 300);
  }, 2500);
}

// --- scheduling helpers
function jsDayToKey(d) {
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][d];
}
function isAllowedToday() {
  const key = jsDayToKey(new Date().getDay());
  return !!state.schedule?.days?.[key];
}
function nextAllowedDate() {
  const today = new Date();
  for (let i = 1; i <= 7; i++) {
    const dt = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + i
    );
    const key = jsDayToKey(dt.getDay());
    if (state.schedule?.days?.[key]) return dt;
  }
  return null;
}
function fmtDate(d) {
  const w = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d.getDay()];
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${w}, ${dd}.${mm}`;
}

// --- SM2-ish interval
function nextInterval(card, knew) {
  if (knew) {
    card.reps = (card.reps || 0) + 1;
    if (card.reps === 1) card.interval = 1;
    else if (card.reps === 2) card.interval = 3;
    else card.interval = Math.round(card.interval * 2.2);
  } else {
    card.reps = 0;
    card.lapses = (card.lapses || 0) + 1;
    card.interval = 1;
  }
  card.due = Date.now() + card.interval * 24 * 60 * 60 * 1000;
}

function currentDeck() {
  return state.decks.find((d) => d.id === state.selectedDeckId);
}

function formatExamBadge(deck) {
  if (!deck.examDate) return '';
  const exam = new Date(deck.examDate);
  const today = new Date();
  exam.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((exam - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return ' · экзамен прошёл';
  if (diffDays === 0) return ' · экзамен сегодня';
  if (diffDays === 1) return ' · экзамен завтра';
  return ` · экзамен через ${diffDays} дн.`;
}

function highlight(text, q) {
  if (!q) return text;
  const r = new RegExp(
    `(${q.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')})`,
    'gi'
  );
  return text.replace(
    r,
    '<mark style="background:rgba(168,85,247,0.4);color:#fff;border-radius:3px;">$1</mark>'
  );
}

// --- options editor
function refreshOptionsEditorVisibility() {
  const select = document.getElementById('cardTypeSelect');
  const editor = document.getElementById('optionsEditor');
  editor.style.display = select.value === 'single' ? 'block' : 'none';
}
function clearOptionsEditor() {
  const list = document.getElementById('optionsList');
  if (list) list.innerHTML = '';
}
function addOptionRow(option = null) {
  const list = document.getElementById('optionsList');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'option-row';
  row.dataset.id = option?.id || uid('opt');

  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.className = 'input option-text';
  textInput.placeholder = 'Текст варианта';
  textInput.value = option?.text || '';

  const label = document.createElement('label');
  label.style.fontSize = '11px';
  label.style.color = 'var(--text-muted)';
  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = 'correctOptionEditor';
  radio.checked = !!option?.correct;
  label.appendChild(radio);
  label.appendChild(document.createTextNode(' Правильный'));

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn btn-secondary';
  removeBtn.style.padding = '4px 8px';
  removeBtn.textContent = '×';
  removeBtn.onclick = () => row.remove();

  row.appendChild(textInput);
  row.appendChild(label);
  row.appendChild(removeBtn);
  list.appendChild(row);
}

// --- images
function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
function setFieldImage(which, dataURL) {
  const field = document.getElementById(
    which === 'front' ? 'frontField' : 'backField'
  );
  const thumb = document.getElementById(
    which === 'front' ? 'frontThumb' : 'backThumb'
  );
  const img = thumb.querySelector('img');
  if (dataURL) {
    field.dataset.img = dataURL;
    img.src = dataURL;
    thumb.style.display = 'block';
  } else {
    field.dataset.img = '';
    img.src = '';
    thumb.style.display = 'none';
  }
}
function getFormImages() {
  const front = document.getElementById('frontField').dataset.img || null;
  const back = document.getElementById('backField').dataset.img || null;
  return {
    frontImg: front && front.startsWith('data:') ? front : null,
    backImg: back && back.startsWith('data:') ? back : null,
  };
}
function clearFormImagesInline() {
  setFieldImage('front', null);
  setFieldImage('back', null);
  document.getElementById('frontImgFile').value = '';
  document.getElementById('backImgFile').value = '';
}

// --- topics
function getDeckTopics(deck) {
  const set = new Set();
  (deck.cards || []).forEach((c) => {
    const t = (c.topic || '').trim();
    if (t) set.add(t);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
}
function renderTopicFilter() {
  const deck = currentDeck();
  const sel = document.getElementById('topicFilter');
  const dl = document.getElementById('topicsDatalist');
  if (!sel || !dl) return;

  const cur = sel.value;
  sel.innerHTML = `<option value="">Все темы</option>`;
  if (deck) {
    getDeckTopics(deck).forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      sel.appendChild(opt);
    });
  }
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;

  dl.innerHTML = '';
  if (deck) {
    getDeckTopics(deck).forEach((t) => {
      const o = document.createElement('option');
      o.value = t;
      dl.appendChild(o);
    });
  }
}

// --- render
function renderDeckList() {
  const list = document.querySelector('.deck-list');
  list.innerHTML = '';
  if (!state.decks.length) {
    list.innerHTML = "<div class='deck-item'>Нет колод</div>";
    return;
  }
  state.decks.forEach((d) => {
    const li = document.createElement('li');
    li.className =
      'deck-item' + (d.id === state.selectedDeckId ? ' active' : '');
    li.innerHTML = `
      <div class="deck-item-title">${d.title}</div>
      <div class="deck-item-desc">${d.description || 'Без описания'} · ${
      d.cards.length
    } шт.${formatExamBadge(d)}</div>`;
    li.onclick = () => {
      state.selectedDeckId = d.id;
      state.mode = 'manage';
      save();
      renderAll();
    };
    list.appendChild(li);
  });
}

function renderHeader() {
  const deck = currentDeck();
  const titleEl = document.querySelector('.deck-title');
  const examInfoEl = document.getElementById('deckExamInfo');

  if (deck) {
    titleEl.textContent = deck.title;
    if (deck.examDate) {
      const badge = formatExamBadge(deck);
      examInfoEl.textContent =
        'Экзамен: ' + deck.examDate + badge.replace(' ·', ' ·');
    } else examInfoEl.textContent = '';
  } else {
    titleEl.textContent = 'Учебные карточки';
    if (examInfoEl) examInfoEl.textContent = '';
  }

  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.classList.remove('active');
    if (
      (btn.textContent.includes('Ред') && state.mode === 'manage') ||
      (btn.textContent.includes('Уч') && state.mode === 'study')
    )
      btn.classList.add('active');
  });

  // расписание hint
  if (examInfoEl) {
    const dash = examInfoEl.textContent ? ' · ' : '';
    const next = !isAllowedToday() ? nextAllowedDate() : null;
    const hint = isAllowedToday()
      ? 'по плану'
      : 'вне плана' + (next ? `, далее: ${fmtDate(next)}` : '');
    examInfoEl.textContent += dash + `расписание: ${hint}`;
  }
}

function renderCards() {
  const deck = currentDeck();
  const tbody = document.querySelector('tbody');
  const empty = document.querySelector('.empty-state');
  tbody.innerHTML = '';

  if (!deck) {
    empty.style.display = 'block';
    empty.textContent = 'Сначала создай и выбери колоду';
    return;
  }

  const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const topicFilter = (
    document.getElementById('topicFilter')?.value || ''
  ).trim();

  let cards = deck.cards.filter((c) => {
    const f = (c.front || '').toLowerCase();
    const b = (c.back || '').toLowerCase();
    const okSearch = !q || f.includes(q) || b.includes(q);
    const okTopic = !topicFilter || (c.topic || '') === topicFilter;
    return okSearch && okTopic;
  });

  if (!cards.length) {
    empty.style.display = 'block';
    empty.textContent = 'Нет карточек или нет совпадений';
    renderTopicFilter();
    return;
  }
  empty.style.display = 'none';

  cards.forEach((c) => {
    const tr = document.createElement('tr');

    const frontCell = c.front?.trim()
      ? highlight(c.front, q)
      : c.frontImg
      ? '🖼️ Фото'
      : "<span style='color:var(--text-muted)'>—</span>";
    const backCell = c.back?.trim()
      ? highlight(c.back, q)
      : c.backImg
      ? '🖼️ Фото'
      : "<span style='color:var(--text-muted)'>—</span>";
    const typeLabel =
      (c.type === 'single' ? ' (тест)' : '') +
      (c.frontImg || c.backImg ? ' 📷' : '');

    tr.innerHTML = `
      <td>${frontCell}</td>
      <td>${backCell}${typeLabel}</td>
      <td>${c.topic || '<span style="color:var(--text-muted)">—</span>'}</td>
      <td>${c.interval || 0} дн.</td>
      <td>
        <button class="btn-secondary btn" style="padding:4px 8px;" onclick="editCard('${
          c.id
        }')">Изм.</button>
        <button class="btn-secondary btn" style="padding:4px 8px;color:#f87171;border-color:#f87171;" onclick="deleteCard('${
          c.id
        }')">✕</button>
      </td>`;
    tbody.appendChild(tr);
  });

  renderTopicFilter();
}

// --- study
function renderOptionsForStudy(card) {
  const container = document.getElementById('optionsContainer');
  container.innerHTML = '';
  if (!card.options || !card.options.length) return;
  card.options.forEach((opt) => {
    const item = document.createElement('label');
    item.className = 'option-item';
    item.dataset.id = opt.id;
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'studyOption';
    const span = document.createElement('span');
    span.textContent = opt.text;
    item.appendChild(input);
    item.appendChild(span);
    container.appendChild(item);
  });
}

function renderStudy() {
  const deck = currentDeck();
  const lbl = document.querySelector('.study-label');
  const txt = document.querySelector('.study-text');
  const btns = document.querySelector('.study-actions');
  const optionsContainer = document.getElementById('optionsContainer');

  if (!deck || !state.studyQueue.length) {
    lbl.textContent = 'Вопрос';
    txt.textContent = 'Выбери колоду и нажми «Учить».';
    optionsContainer.innerHTML = '';
    btns.innerHTML = '';
    return;
  }

  const card = state.studyQueue[state.studyIndex];
  if (!card) {
    lbl.textContent = 'Готово';
    txt.textContent = 'Все карточки повторены ✅';
    optionsContainer.innerHTML = '';
    btns.innerHTML = '';
    return;
  }

  const isTest = card.type === 'single' && card.options?.length;

  if (isTest) {
    if (!state.studyShowAnswer) {
      lbl.textContent = 'Тест (один правильный ответ)';
      const sideText = state.studyShowAnswer
        ? card.back || ''
        : card.front || '';
      txt.innerHTML = sideText ? marked.parse(sideText) : '';
      MathJax.typesetPromise();

      const old = document.getElementById('studyDynamicImg');
      if (old) old.remove();
      const imgToShow = state.studyShowAnswer
        ? card.backImg || null
        : card.frontImg || null;
      if (imgToShow) {
        const img = document.createElement('img');
        img.id = 'studyDynamicImg';
        img.className = 'study-img';
        img.src = imgToShow;
        txt.parentElement.appendChild(img);
      }

      renderOptionsForStudy(card);
      btns.innerHTML =
        '<button class="btn" onclick="checkTest()">Проверить</button>';
    } else {
      lbl.textContent = 'Проверка';
      const sideText = state.studyShowAnswer
        ? card.back || ''
        : card.front || '';
      txt.innerHTML = sideText ? marked.parse(sideText) : '';
      MathJax.typesetPromise();

      const old = document.getElementById('studyDynamicImg');
      if (old) old.remove();
      const imgToShow = state.studyShowAnswer
        ? card.backImg || null
        : card.frontImg || null;
      if (imgToShow) {
        const img = document.createElement('img');
        img.id = 'studyDynamicImg';
        img.className = 'study-img';
        img.src = imgToShow;
        txt.parentElement.appendChild(img);
      }

      MathJax.typesetPromise();
      btns.innerHTML =
        '<button class="btn" onclick="rate(true)">Знал</button>' +
        '<button class="btn btn-secondary" onclick="rate(false)">Не знал</button>';
    }
  } else {
    optionsContainer.innerHTML = '';
    lbl.textContent = state.studyShowAnswer ? 'Ответ' : 'Вопрос';
    const sideText = state.studyShowAnswer ? card.back || '' : card.front || '';
    txt.innerHTML = sideText ? marked.parse(sideText) : '';
    MathJax.typesetPromise();

    txt.innerHTML = marked.parse(
      state.studyShowAnswer ? card.back : card.front
    );

    const old = document.getElementById('studyDynamicImg');
    if (old) old.remove();
    const imgToShow = state.studyShowAnswer
      ? card.backImg || null
      : card.frontImg || null;
    if (imgToShow) {
      const img = document.createElement('img');
      img.id = 'studyDynamicImg';
      img.className = 'study-img';
      img.src = imgToShow;
      txt.parentElement.appendChild(img);
    }

    MathJax.typesetPromise();
    btns.innerHTML = state.studyShowAnswer
      ? '<button class="btn btn-secondary" onclick="backToQuestion()">← Назад</button>' +
        '<button class="btn" onclick="rate(true)">Знал</button>' +
        '<button class="btn btn-secondary" onclick="rate(false)">Не знал</button>'
      : '<button class="btn" onclick="showAns()">Показать ответ</button>';
  }
}

function startStudy() {
  // расписание
  const allowed = isAllowedToday();
  if (!allowed) {
    const next = nextAllowedDate();
    if (state.schedule?.enforce) {
      showToast(
        'Сегодня не по плану. Ближайшее занятие: ' +
          (next ? fmtDate(next) : '—')
      );
      return;
    } else {
      showToast('Сегодня не отмечен в расписании (можно всё равно учиться).');
    }
  }

  const deck = currentDeck();
  if (!deck || !deck.cards.length) {
    showToast('Нет карточек');
    return;
  }

  const topicFilter = (
    document.getElementById('topicFilter')?.value || ''
  ).trim();
  const base = deck.cards.filter(
    (c) => !topicFilter || (c.topic || '') === topicFilter
  );
  const due = base.filter((c) => !c.due || c.due <= Date.now());

  if (!due.length && !base.length) {
    showToast('В этой теме нет карточек');
    return;
  }
  if (!due.length) {
    showToast('На сегодня нет карточек в этой теме, повторим все из темы');
  }

  state.studyQueue = due.length ? due : base;
  state.studyIndex = 0;
  state.studyShowAnswer = false;
  state.mode = 'study';
  save();
  renderAll();
}

function showAns() {
  state.studyShowAnswer = true;
  renderStudy();
}

function resetTestSelections() {
  const container = document.getElementById('optionsContainer');
  if (!container) return;
  container.querySelectorAll('.option-item').forEach((item) => {
    item.classList.remove('opt-correct', 'opt-incorrect', 'opt-missed');
    const input = item.querySelector('input');
    if (input) {
      input.checked = false;
      input.disabled = false;
    }
  });
}
function backToQuestion() {
  state.studyShowAnswer = false;
  resetTestSelections();
  renderStudy();
}

function checkTest() {
  const card = state.studyQueue[state.studyIndex];
  if (!card || !card.options?.length) return;
  const container = document.getElementById('optionsContainer');
  const items = Array.from(container.querySelectorAll('.option-item'));
  const selectedIds = items
    .filter((it) => it.querySelector('input').checked)
    .map((it) => it.dataset.id);
  if (!selectedIds.length) {
    showToast('Выбери вариант');
    return;
  }
  const correctIds = card.options.filter((o) => o.correct).map((o) => o.id);

  items.forEach((item) => {
    const input = item.querySelector('input');
    const id = item.dataset.id;
    const isCorrect = correctIds.includes(id);
    item.classList.remove('opt-correct', 'opt-incorrect', 'opt-missed');
    input.disabled = true;
    if (isCorrect && input.checked) item.classList.add('opt-correct');
    else if (!isCorrect && input.checked) item.classList.add('opt-incorrect');
    else if (isCorrect && !input.checked) item.classList.add('opt-missed');
  });

  state.studyShowAnswer = true;
  renderStudy();
}

function rate(knew) {
  const card = state.studyQueue[state.studyIndex];
  if (!card) return;
  nextInterval(card, knew);
  state.stats.studiedToday = (state.stats.studiedToday || 0) + 1;
  const today = new Date().toDateString();
  if (state.stats.lastDate !== today) {
    state.stats.streak =
      state.stats.lastDate === null ? 1 : (state.stats.streak || 0) + 1;
    state.stats.lastDate = today;
  }
  state.studyIndex++;
  state.studyShowAnswer = false;
  save();
  renderAll();
}

// --- export/import
function exportData() {
  const blob = new Blob([JSON.stringify(state.decks, null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'flashcards.json';
  a.click();
}
function importData(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const imported = JSON.parse(r.result);
      if (Array.isArray(imported)) {
        imported.forEach((deck) => {
          if (!state.decks.find((d) => d.title === deck.title))
            state.decks.push(deck);
        });
        save();
        renderAll();
        showToast('📦 Импортировано');
      }
    } catch (e) {
      showToast('Ошибка импорта');
    }
  };
  r.readAsText(file);
}

// --- CRUD cards
function editCard(id) {
  const deck = currentDeck();
  if (!deck) return;
  const c = deck.cards.find((x) => x.id === id);
  if (!c) return;
  document.getElementById('cardTopicInput').value = c.topic || '';
  document.getElementById('cardFrontInput').value = c.front;
  document.getElementById('cardBackInput').value = c.back;
  document.getElementById('cardTypeSelect').value = c.type || 'basic';
  setFieldImage('front', c.frontImg || null);
  setFieldImage('back', c.backImg || null);
  document.getElementById('frontImgFile').value = '';
  document.getElementById('backImgFile').value = '';

  refreshOptionsEditorVisibility();
  clearOptionsEditor();
  if (c.type === 'single' && Array.isArray(c.options)) {
    c.options.forEach((opt) => addOptionRow(opt));
  }
  const form = document.querySelector('.card-form');
  form.dataset.edit = id;
  document.getElementById('saveCardBtn').textContent = 'Сохранить изменения';
  document.getElementById('cancelEditBtn').style.display = 'inline-block';
}

function cancelEdit() {
  const form = document.querySelector('.card-form');
  delete form.dataset.edit;
  document.getElementById('cardFrontInput').value = '';
  document.getElementById('cardBackInput').value = '';
  document.getElementById('cardTopicInput').value = '';
  document.getElementById('cardTypeSelect').value = 'basic';
  clearOptionsEditor();
  refreshOptionsEditorVisibility();
  document.getElementById('saveCardBtn').textContent = 'Сохранить';
  document.getElementById('cancelEditBtn').style.display = 'none';
  showToast('❌ Редактирование отменено');
  clearFormImagesInline();
}

function deleteCard(id) {
  const deck = currentDeck();
  if (!deck) return;
  deck.cards = deck.cards.filter((c) => c.id !== id);
  save();
  renderCards();
  showToast('🗑️ Удалено');
}

function saveCard() {
  const deck = currentDeck();
  if (!deck) {
    showToast('Сначала создай колоду');
    return;
  }

  const { frontImg, backImg } = getFormImages();
  const front = document.getElementById('cardFrontInput').value.trim();
  const back = document.getElementById('cardBackInput').value.trim();
  const type = document.getElementById('cardTypeSelect').value;
  const topic = document.getElementById('cardTopicInput').value.trim();

  const frontOK = !!front || !!frontImg;
  const backOK = !!back || !!backImg;
  if (!frontOK || !backOK) {
    showToast('Нужен текст или фото на каждой стороне');
    return;
  }

  let options = [];
  if (type === 'single') {
    const rows = Array.from(
      document.querySelectorAll('#optionsList .option-row')
    );
    if (rows.length < 2) {
      showToast('Для теста нужно минимум 2 варианта');
      return;
    }
    rows.forEach((row) => {
      const textInput = row.querySelector('.option-text');
      const radio = row.querySelector("input[type='radio']");
      const text = textInput.value.trim();
      if (!text) return;
      options.push({
        id: row.dataset.id || uid('opt'),
        text,
        correct: radio.checked,
      });
    });
    if (!options.some((o) => o.correct)) {
      showToast('Отметь правильный вариант');
      return;
    }
  }

  const form = document.querySelector('.card-form');
  const editId = form.dataset.edit;
  if (editId) {
    const c = deck.cards.find((x) => x.id === editId);
    Object.assign(c, {
      front,
      back,
      type,
      options: type === 'single' ? options : [],
      frontImg,
      backImg,
      topic,
    });
    delete form.dataset.edit;
  } else {
    deck.cards.push({
      id: uid('card'),
      front,
      back,
      type,
      options: type === 'single' ? options : [],
      frontImg,
      backImg,
      topic,
      createdAt: Date.now(),
      interval: 0,
      reps: 0,
      due: Date.now(),
    });
  }

  document.getElementById('cardFrontInput').value = '';
  document.getElementById('cardBackInput').value = '';
  document.getElementById('cardTypeSelect').value = 'basic';
  document.getElementById('cardTopicInput').value = '';
  clearOptionsEditor();
  refreshOptionsEditorVisibility();
  document.getElementById('saveCardBtn').textContent = 'Сохранить';
  document.getElementById('cancelEditBtn').style.display = 'none';

  save();
  renderCards();
  showToast('💾 Сохранено');
  clearFormImagesInline();
}

// --- render all
function renderAll() {
  renderDeckList();
  renderHeader();
  renderCards();
  if (state.mode === 'study') renderStudy();

  const manage = document.getElementById('manageSection');
  const study = document.getElementById('studySection');
  if (manage && study) {
    manage.style.display = state.mode === 'manage' ? 'block' : 'none';
    study.style.display = state.mode === 'study' ? 'block' : 'none';
  }
}

// --- DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  load();
  renderAll();
  refreshOptionsEditorVisibility();

  // create deck
  document.getElementById('createDeckBtn').addEventListener('click', () => {
    const titleInput = document.getElementById('deckTitleInput');
    const descInput = document.getElementById('deckDescInput');
    const examInput = document.getElementById('deckExamInput');

    const title = titleInput.value.trim();
    const desc = descInput.value.trim();
    const examDate = examInput.value;

    if (!title) {
      showToast('Введите название колоды');
      return;
    }
    const exists = state.decks.some(
      (d) => d.title.toLowerCase() === title.toLowerCase()
    );
    if (exists) {
      showToast('Колода с таким названием уже есть');
      return;
    }

    const newDeck = {
      id: uid('deck'),
      title,
      description: desc,
      cards: [],
      examDate: examDate || null,
    };
    state.decks.push(newDeck);
    state.selectedDeckId = newDeck.id;

    titleInput.value = '';
    descInput.value = '';
    examInput.value = '';
    save();
    renderAll();
    showToast('✨ Колода создана');
  });

  // image buttons
  document
    .getElementById('frontImgBtn')
    .addEventListener('click', () =>
      document.getElementById('frontImgFile').click()
    );
  document
    .getElementById('backImgBtn')
    .addEventListener('click', () =>
      document.getElementById('backImgFile').click()
    );

  document
    .getElementById('frontImgFile')
    .addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      if (!f.type.startsWith('image/')) {
        showToast('Нужен файл-изображение');
        return;
      }
      setFieldImage('front', await readFileAsDataURL(f));
    });
  document
    .getElementById('backImgFile')
    .addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      if (!f.type.startsWith('image/')) {
        showToast('Нужен файл-изображение');
        return;
      }
      setFieldImage('back', await readFileAsDataURL(f));
    });

  // thumbs close
  document.querySelectorAll('.thumb .x').forEach((x) => {
    x.addEventListener('click', () => {
      const t = x.dataset.target; // 'front' | 'back'
      setFieldImage(t, null);
      document.getElementById(
        t === 'front' ? 'frontImgFile' : 'backImgFile'
      ).value = '';
    });
  });

  // card form
  document.getElementById('saveCardBtn').addEventListener('click', saveCard);
  document
    .getElementById('cancelEditBtn')
    .addEventListener('click', cancelEdit);
  document
    .getElementById('cardTypeSelect')
    .addEventListener('change', refreshOptionsEditorVisibility);
  document
    .getElementById('addOptionBtn')
    .addEventListener('click', () => addOptionRow());

  // mode buttons
  const modeBtns = document.querySelectorAll('.mode-btn');
  modeBtns[0].onclick = () => {
    state.mode = 'manage';
    renderAll();
  };
  modeBtns[1].onclick = startStudy;

  // search
  const searchEl = document.getElementById('searchInput');
  if (searchEl) searchEl.addEventListener('input', renderCards);

  // topic filter
  const topicSel = document.getElementById('topicFilter');
  if (topicSel) {
    topicSel.addEventListener('change', () => {
      renderCards();
      if (state.mode === 'study') startStudy();
    });
  }

  // export/import
  document.getElementById('exportBtn').onclick = exportData;
  document.getElementById('importBtn').onclick = () => {
    const f = document.createElement('input');
    f.type = 'file';
    f.accept = '.json';
    f.onchange = (e) => importData(e.target.files[0]);
    f.click();
  };

  // schedule UI
  function applyScheduleToUI() {
    const d = state.schedule.days || {};
    document.getElementById('schMon').checked = !!d.mon;
    document.getElementById('schTue').checked = !!d.tue;
    document.getElementById('schWed').checked = !!d.wed;
    document.getElementById('schThu').checked = !!d.thu;
    document.getElementById('schFri').checked = !!d.fri;
    document.getElementById('schSat').checked = !!d.sat;
    document.getElementById('schSun').checked = !!d.sun;
    document.getElementById('schEnforce').checked = !!state.schedule.enforce;
  }
  function wireScheduleHandlers() {
    const map = [
      ['schMon', 'mon'],
      ['schTue', 'tue'],
      ['schWed', 'wed'],
      ['schThu', 'thu'],
      ['schFri', 'fri'],
      ['schSat', 'sat'],
      ['schSun', 'sun'],
    ];
    map.forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (el)
        el.addEventListener('change', () => {
          state.schedule.days[key] = el.checked;
          save();
        });
    });
    const enf = document.getElementById('schEnforce');
    if (enf)
      enf.addEventListener('change', () => {
        state.schedule.enforce = enf.checked;
        save();
      });
  }
  applyScheduleToUI();
  wireScheduleHandlers();

  // keyboard
  document.addEventListener('keydown', (e) => {
    if (state.mode === 'study') {
      if (e.code === 'Space') {
        e.preventDefault();
        if (!state.studyShowAnswer) showAns();
      }
      if (e.key === '1') rate(true);
      if (e.key === '2') rate(false);
      if (
        state.studyShowAnswer &&
        (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'b')
      ) {
        e.preventDefault();
        backToQuestion();
      }
    }
    if (e.ctrlKey && e.key === 'Enter') saveCard();
  });
});

// expose for inline buttons in table
window.editCard = editCard;
window.deleteCard = deleteCard;
window.checkTest = checkTest;
window.rate = rate;
window.showAns = showAns;
window.backToQuestion = backToQuestion;
window.startStudy = startStudy;
