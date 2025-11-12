// ---- State ----
const STORAGE_KEY = 'flashcards_pro_violet';
let state = {
  decks: [],
  selectedDeckId: null,
  page: 'home', // 'home' | 'library' | 'workspace'
  mode: 'manage', // 'manage' | 'study'
  studyQueue: [],
  studyIndex: 0,
  studyShowAnswer: false,
  stats: { streak: 0, studiedToday: 0, lastDate: null },

  // Новое: расписание недели (0=Пн ... 6=Вс)
  schedule: { weekly: [[], [], [], [], [], [], []] },

  // Текущая неделя для показа на главной (offset от "сегодня")
  uiWeekOffset: 0,
};

// ---- Utils ----
const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9);
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const load = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    Object.assign(state, JSON.parse(raw));
  } catch {}
};

// гарантируем структуру расписания
function ensureSchedule() {
  if (
    !state.schedule ||
    !Array.isArray(state.schedule.weekly) ||
    state.schedule.weekly.length !== 7
  ) {
    state.schedule = { weekly: [[], [], [], [], [], [], []] };
  }
}
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
const currentDeck = () =>
  state.decks.find((d) => d.id === state.selectedDeckId);

// ---- Page routing ----
function setPage(page) {
  state.page = page;
  document
    .querySelectorAll('.nav-item')
    .forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  document.getElementById('libraryPanel').style.display =
    page === 'library' ? 'block' : 'none';
  document.getElementById('homeSection').style.display =
    page === 'home' ? 'block' : 'none';
  document.getElementById('librarySection').style.display =
    page === 'library' ? 'block' : 'none';
  document.getElementById('workspaceSection').style.display =
    page === 'workspace' ? 'block' : 'none';

  const pageTitle = document.getElementById('pageTitle');
  const switcher = document.getElementById('workspaceSwitch');
  if (page === 'workspace') {
    pageTitle.textContent = currentDeck()
      ? currentDeck().title
      : 'Рабочее место';
    switcher.style.display = 'flex';
  } else {
    pageTitle.textContent = page === 'library' ? 'Библиотека' : 'Главная';
    switcher.style.display = 'none';
  }
  if (page === 'workspace') {
    updateWorkspaceVisibility();
  }

  if (page === 'home') {
    renderHomeCalendar();
  }
  if (page === 'library') renderLibrary();
  if (page === 'workspace') {
    renderHeader();
    syncDeckColorPicker();
    renderCards();
    renderWorkspaceScheduleBox();
    renderTopicPanel();
    if (state.mode === 'study') renderStudy();
  }
  updateWorkspaceVisibility();
  save();
}
function syncDeckColorPicker() {
  const box = document.getElementById('deckColorBox');
  const input = document.getElementById('deckColorPicker');
  const deck = currentDeck();
  if (!box || !input) return;
  if (!deck) {
    box.style.display = 'none';
    return;
  }
  box.style.display = 'flex';
  input.value = getDeckColor(deck);
}

// ---- HOME: Week calendar ----
const wdNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
function startOfISOWeek(d) {
  // Пн-начало
  const dt = new Date(d);
  const day = (dt.getDay() + 6) % 7; // 0..6 (Пн=0)
  dt.setDate(dt.getDate() - day);
  dt.setHours(0, 0, 0, 0);
  return dt;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function fmtDate(d) {
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 168, g: 85, b: 247 }; // fallback accent
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}
function withAlpha(hex, a) {
  const { r, g, b } = hexToRgb(hex || '#a855f7');
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
function getDeckColor(deck) {
  return deck?.color || '#a855f7';
}

function renderHomeCalendar() {
  ensureSchedule();
  const weekGrid = document.getElementById('weekGrid');
  const weekLabel = document.getElementById('weekLabel');
  weekGrid.innerHTML = '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const base = startOfISOWeek(new Date()); // начало текущей недели (Пн)
  const start = addDays(base, state.uiWeekOffset * 7);
  const end = addDays(start, 6);
  weekLabel.textContent = `${fmtDate(start)} — ${fmtDate(end)}`;

  for (let i = 0; i < 7; i++) {
    const dayDate = addDays(start, i);
    const isoIndex = i; // 0=Пн..6=Вс
    const isToday = dayDate.getTime() === today.getTime();

    const cell = document.createElement('div');
    cell.className = 'day-cell' + (isToday ? ' today' : '');
    cell.innerHTML = `
      <div class="day-head">
        <div class="day-name">${wdNames[i]}</div>
        <div class="day-date">${fmtDate(dayDate)}</div>
      </div>
      <div class="day-list" id="dayList_${i}"></div>
    `;
    weekGrid.appendChild(cell);

    // элементы расписания
    const list = document.getElementById(`dayList_${i}`);
    const items = state.schedule.weekly[isoIndex] || [];

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'muted small';
      empty.textContent = '—';
      list.appendChild(empty);
    } else {
      items.forEach((it) => {
        const deck = state.decks.find((d) => d.id === it.deckId);
        const pill = document.createElement('div');
        pill.className = 'pill';
        pill.title = deck
          ? deck.title + (it.topic ? ` • ${it.topic}` : '')
          : it.topic || '';
        pill.innerHTML = `📘 ${deck ? deck.title : 'Колода?'} ${
          it.topic ? `<span style="opacity:.8">• ${it.topic}</span>` : ''
        }`;

        // подкраска по цвету колоды
        if (deck) {
          const col = getDeckColor(deck);
          pill.style.borderColor = withAlpha(col, 0.55);
          pill.style.background = withAlpha(col, 0.15);
          pill.onmouseenter = () =>
            (pill.style.boxShadow = `0 0 8px ${withAlpha(col, 0.35)}`);
          pill.onmouseleave = () => (pill.style.boxShadow = ``);
        }

        pill.onclick = () => {
          if (deck) {
            state.selectedDeckId = deck.id;
            setPage('workspace');
            const topicSel = document.getElementById('topicFilter');
            if (topicSel) topicSel.value = it.topic || '';
            renderTopicPanel();
            state.mode = 'study';
            startStudy();
            updateWorkspaceVisibility();
            showToast(
              `Учим «${deck.title}» ${it.topic ? '• ' + it.topic : ''}`
            );
          } else {
            showToast('Колода не найдена (удалена?)');
          }
        };
        list.appendChild(pill);
      });
    }
  }
}

function addScheduleItem(weekdayIndex, deckId, topic) {
  // helper для тебя (можно вызывать из консоли): 0=Пн..6=Вс
  ensureSchedule();
  const arr =
    state.schedule.weekly[weekdayIndex] ||
    (state.schedule.weekly[weekdayIndex] = []);
  arr.push({ deckId, topic: (topic || '').trim() || undefined });
  save();
  if (state.page === 'home') renderHomeCalendar();
}

// ---- LIBRARY ----
function formatExamBadge(deck) {
  if (!deck.examDate) return '';
  const exam = new Date(deck.examDate),
    today = new Date();
  exam.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((exam - today) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'экзамен прошёл';
  if (diff === 0) return 'экзамен сегодня';
  if (diff === 1) return 'экзамен завтра';
  return `экзамен через ${diff} дн.`;
}
function renderLibrary() {
  const grid = document.getElementById('libraryGrid');
  const empty = document.getElementById('libraryEmpty');
  const q = (document.getElementById('libSearch')?.value || '').toLowerCase();
  grid.innerHTML = '';
  let decks = state.decks;
  if (q)
    decks = decks.filter(
      (d) =>
        (d.title || '').toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q)
    );
  if (!decks.length) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  decks.forEach((d) => {
    const card = document.createElement('div');
    card.className = 'deck-card';
    const deckColor = getDeckColor(d);
    card.style.borderColor = withAlpha(deckColor, 0.35);
    card.style.boxShadow = `0 0 12px ${withAlpha(deckColor, 0.12)}`;
    card.innerHTML = `
  <div class="title" style="color:${deckColor}">${d.title}</div>
  <div class="desc">${d.description || 'Без описания'}</div>
  <div class="row" style="gap:6px;margin-top:4px">
    <span class="badge">${d.cards?.length || 0} карточек</span>
    ${d.examDate ? `<span class="badge">${formatExamBadge(d)}</span>` : ``}
    <span class="badge" style="border-color:${withAlpha(
      deckColor,
      0.5
    )};background:${withAlpha(deckColor, 0.12)}">цвет</span>
  </div>
  <div class="row" style="margin-top:8px">
    <button class="btn" data-open="workspace">Открыть</button>
    <button class="btn btn-secondary" data-del="1">Удалить</button>
  </div>
`;
    card.querySelector('[data-open]').onclick = () => {
      state.selectedDeckId = d.id;
      state.mode = 'manage';
      state.studyShowAnswer = false;
      setPage('workspace');
    };
    card.querySelector('[data-del]').onclick = () => {
      if (confirm(`Удалить колоду «${d.title}»?`)) {
        state.decks = state.decks.filter((x) => x.id !== d.id);
        if (state.selectedDeckId === d.id) state.selectedDeckId = null;
        save();
        renderLibrary();
      }
    };
    grid.appendChild(card);
  });
}

// ---- WORKSPACE (прежний) ----
function highlight(text, q) {
  if (!q) return text;
  const r = new RegExp(
    `(${q.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')})`,
    'gi'
  );
  return text.replace(
    r,
    '<mark style="background:rgba(168,85,247,.4);color:#fff;border-radius:3px;">$1</mark>'
  );
}
function refreshOptionsEditorVisibility() {
  const select = document.getElementById('cardTypeSelect');
  document.getElementById('optionsEditor').style.display =
    select.value === 'single' ? 'block' : 'none';
}
function clearOptionsEditor() {
  const list = document.getElementById('optionsList');
  if (list) list.innerHTML = '';
}
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
  row.append(textInput, label, removeBtn);
  list.appendChild(row);
}

function updateWorkspaceVisibility() {
  const editor = document.getElementById('cardEditor');
  const table = document.getElementById('cardTable');
  const study = document.getElementById('studySection');
  const sched = document.getElementById('wsScheduleBox');
  const topics = document.getElementById('topicPanel');

  if (!editor || !table || !study) return;

  if (state.mode === 'study') {
    editor.style.display = 'none';
    table.style.display = 'none';
    study.style.display = 'block';
    if (sched) sched.style.display = 'none';
    if (topics) topics.style.display = 'none';
  } else {
    editor.style.display = 'block';
    table.style.display = 'block';
    study.style.display = 'none';
    if (sched) sched.style.display = 'block';
    if (topics) topics.style.display = ''; // даст работать media-queries
  }
}

function renderHeader() {
  const deck = currentDeck();
  const titleEl = document.getElementById('pageTitle');
  const examInfoEl = document.getElementById('deckExamInfo');
  titleEl.textContent = deck ? deck.title : 'Рабочее место';
  examInfoEl.textContent = deck?.examDate
    ? 'Экзамен: ' + deck.examDate + ' · ' + formatExamBadge(deck)
    : '';

  // акцент цветом
  if (deck) {
    titleEl.style.color = getDeckColor(deck);
    titleEl.classList.add('accented');
  } else {
    titleEl.style.color = '';
    titleEl.classList.remove('accented');
  }

  document
    .querySelectorAll('.mode-btn')
    .forEach((btn) =>
      btn.classList.toggle('active', btn.dataset.mode === state.mode)
    );
}

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
      const o = document.createElement('option');
      o.value = t;
      o.textContent = t;
      sel.appendChild(o);
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
function renderCards() {
  const deck = currentDeck();
  const tbody = document.querySelector('tbody');
  const empty = document.querySelector('.empty-state');
  tbody.innerHTML = '';
  if (!deck) {
    empty.style.display = 'block';
    empty.textContent = 'Сначала выбери колоду (Библиотека → Открыть)';
    return;
  }
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const topicFilter = (
    document.getElementById('topicFilter')?.value || ''
  ).trim();
  const cards = deck.cards.filter((c) => {
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
      : '<span style="color:var(--text-muted)">—</span>';
    const backCell = c.back?.trim()
      ? highlight(c.back, q)
      : c.backImg
      ? '🖼️ Фото'
      : '<span style="color:var(--text-muted)">—</span>';
    const typeLabel =
      (c.type === 'single' ? ' (тест)' : '') +
      (c.frontImg || c.backImg ? ' 📷' : '');
    tr.innerHTML = `
      <td>${frontCell}</td>
      <td>${backCell}${typeLabel}</td>
      <td>${c.topic || '<span style="color:var(--text-muted)">—</span>'}</td>
      <td>${c.interval || 0} дн.</td>
      <td>
        <button class="btn btn-secondary" style="padding:4px 8px" onclick="editCard('${
          c.id
        }')">Изм.</button>
        <button class="btn btn-secondary" style="padding:4px 8px;color:#f87171;border-color:#f87171" onclick="deleteCard('${
          c.id
        }')">✕</button>
      </td>`;
    tbody.appendChild(tr);
  });
  renderTopicFilter();
}
window.editCard = function (id) {
  const deck = currentDeck();
  if (!deck) return;
  const c = deck.cards.find((x) => x.id === id);
  if (!c) return;
  document.getElementById('cardTopicInput').value = c.topic || '';
  document.getElementById('cardFrontInput').value = c.front || '';
  document.getElementById('cardBackInput').value = c.back || '';
  document.getElementById('cardTypeSelect').value = c.type || 'basic';
  setFieldImage('front', c.frontImg || null);
  setFieldImage('back', c.backImg || null);
  document.getElementById('frontImgFile').value = '';
  document.getElementById('backImgFile').value = '';
  refreshOptionsEditorVisibility();
  clearOptionsEditor();
  if (c.type === 'single' && Array.isArray(c.options))
    c.options.forEach((opt) => addOptionRow(opt));
  const form = document.querySelector('.card-form');
  form.dataset.edit = id;
  document.getElementById('saveCardBtn').textContent = 'Сохранить изменения';
  document.getElementById('cancelEditBtn').style.display = 'inline-block';
};
window.deleteCard = function (id) {
  const deck = currentDeck();
  if (!deck) return;
  deck.cards = deck.cards.filter((c) => c.id !== id);
  save();
  renderCards();
  renderTopicFilter();
  renderTopicPanel();
  showToast('🗑️ Удалено');
};
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
function saveCard() {
  const deck = currentDeck();
  if (!deck) {
    showToast('Сначала выбери колоду в Библиотеке');
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
      const t = (textInput.value || '').trim();
      if (!t) return;
      options.push({
        id: row.dataset.id || uid('opt'),
        text: t,
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
  renderWorkspaceScheduleBox();
  renderTopicPanel();
  showToast('💾 Сохранено');
  clearFormImagesInline();
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

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
    item.append(input, span);
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
  const setSide = (showAnswer) => {
    const sideText = showAnswer ? card.back || '' : card.front || '';
    txt.innerHTML = sideText ? marked.parse(sideText) : '';
    const old = document.getElementById('studyDynamicImg');
    if (old) old.remove();
    const imgToShow = showAnswer ? card.backImg || null : card.frontImg || null;
    if (imgToShow) {
      const img = document.createElement('img');
      img.id = 'studyDynamicImg';
      img.className = 'study-img';
      img.src = imgToShow;
      txt.parentElement.appendChild(img);
    }
    MathJax.typesetPromise();
  };
  if (isTest) {
    // Для single choice НИКОГДА не показываем "ответную сторону"
    lbl.textContent = 'Тест (один правильный ответ)';
    setSide(false); // всегда фронт (вопрос)
    renderOptionsForStudy(card);

    // Кнопка "Проверить"
    btns.innerHTML = '<button class="btn" id="btnCheck">Проверить</button>';
    document.getElementById('btnCheck').onclick = checkTest;

    return; // выходим, дальше обычный (не-тестовый) код не выполняется
  } else {
    // старый код для обычных карточек (оставь как был)
    optionsContainer.innerHTML = '';
    lbl.textContent = state.studyShowAnswer ? 'Ответ' : 'Вопрос';
    setSide(state.studyShowAnswer);
    btns.innerHTML = state.studyShowAnswer
      ? '<button class="btn btn-secondary" id="btnBack">← Назад</button><button class="btn" id="btnKnow">Знал</button><button class="btn btn-secondary" id="btnDont">Не знал</button>'
      : '<button class="btn" id="btnShow">Показать ответ</button>';
    if (!state.studyShowAnswer)
      document.getElementById('btnShow').onclick = showAns;
    else {
      document.getElementById('btnBack').onclick = backToQuestion;
      document.getElementById('btnKnow').onclick = () => rate(true);
      document.getElementById('btnDont').onclick = () => rate(false);
    }
  }
}

function startStudy() {
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
  state.studyQueue = shuffleArray(due.length ? due : base);

  state.studyIndex = 0;
  state.studyShowAnswer = false;
  state.mode = 'study';
  document.getElementById('studySection').style.display = 'block';
  renderHeader();
  renderStudy();
  save();
  updateWorkspaceVisibility();
}
function showAns() {
  state.studyShowAnswer = true;
  renderStudy();
}
function resetTestSelections() {
  const c = document.getElementById('optionsContainer');
  if (!c) return;
  c.querySelectorAll('.option-item').forEach((item) => {
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
  const items = [...container.querySelectorAll('.option-item')];

  const selectedIds = items
    .filter((i) => i.querySelector('input').checked)
    .map((i) => i.dataset.id);

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

  // НИКАКИХ state.studyShowAnswer и renderStudy()
  // Просто меняем кнопки на "Знал / Не знал"
  const lbl = document.querySelector('.study-label');
  const btns = document.querySelector('.study-actions');
  if (lbl) lbl.textContent = 'Проверка';

  btns.innerHTML =
    '<button class="btn" id="btnKnow">Знал</button>' +
    '<button class="btn btn-secondary" id="btnDont">Не знал</button>';

  document.getElementById('btnKnow').onclick = () => rate(true);
  document.getElementById('btnDont').onclick = () => rate(false);
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
  renderHeader();
  renderStudy();
}

// ---- Export/Import ----
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
        if (state.page === 'library') renderLibrary();
        showToast('📦 Импортировано');
      }
    } catch {
      showToast('Ошибка импорта');
    }
  };
  r.readAsText(file);
}
// --- Schedule helpers/UI for Workspace (ГЛОБАЛЬНО) ---
function ensureScheduleIds() {
  if (!state.schedule || !Array.isArray(state.schedule.weekly)) return;
  state.schedule.weekly.forEach((arr, d) => {
    if (!Array.isArray(arr)) state.schedule.weekly[d] = [];
    state.schedule.weekly[d].forEach((it) => {
      if (!it.id) it.id = uid('sch');
    });
  });
}

function getDeckTopicsSafe() {
  const deck = currentDeck();
  return deck ? getDeckTopics(deck) : [];
}

function renderWorkspaceScheduleBox() {
  const box = document.getElementById('wsScheduleBox');
  const deck = currentDeck();
  if (!box) return;

  if (!deck || state.mode === 'study') {
    // ← добавили проверку режима
    box.style.display = 'none';
    return;
  }
  box.style.display = 'block';

  const dl = document.getElementById('topicsDatalist');
  if (dl) {
    dl.innerHTML = '';
    getDeckTopicsSafe().forEach((t) => {
      const o = document.createElement('option');
      o.value = t;
      dl.appendChild(o);
    });
  }

  renderScheduleListForDeck(deck.id);
}
function renderTopicPanel() {
  const panel = document.getElementById('topicList');
  if (!panel) return;
  const deck = currentDeck();
  panel.innerHTML = '';

  if (!deck) {
    panel.innerHTML = `<div class="muted">Сначала выбери колоду</div>`;
    return;
  }

  const current = (document.getElementById('topicFilter')?.value || '').trim();
  const col = getDeckColor(deck);

  // «Все темы»
  const all = document.createElement('div');
  const allActive = current === '';
  all.className = 'topic-pill' + (allActive ? ' active' : '');
  all.textContent = 'Все темы';
  all.style.border = `1px solid ${withAlpha(col, 0.45)}`;
  all.style.background = allActive
    ? withAlpha(col, 0.55)
    : withAlpha(col, 0.15);
  if (allActive) all.style.color = '#fff';
  all.onmouseenter = () => {
    all.style.background = withAlpha(col, allActive ? 0.6 : 0.25);
  };
  all.onmouseleave = () => {
    all.style.background = withAlpha(col, allActive ? 0.55 : 0.15);
  };
  all.onclick = () => applyTopicFilter('');
  panel.appendChild(all);

  // Конкретные темы
  getDeckTopics(deck).forEach((t) => {
    const active = t === current;
    const pill = document.createElement('div');
    pill.className = 'topic-pill' + (active ? ' active' : '');
    pill.textContent = t;
    pill.title = t;
    pill.style.border = `1px solid ${withAlpha(col, 0.45)}`;
    pill.style.background = active
      ? withAlpha(col, 0.55)
      : withAlpha(col, 0.15);
    if (active) pill.style.color = '#fff';
    pill.onmouseenter = () => {
      pill.style.background = withAlpha(col, active ? 0.6 : 0.25);
    };
    pill.onmouseleave = () => {
      pill.style.background = withAlpha(col, active ? 0.55 : 0.15);
    };
    pill.onclick = () => applyTopicFilter(t);
    panel.appendChild(pill);
  });
}

// Применить фильтр темы из плашки
function applyTopicFilter(topic) {
  const sel = document.getElementById('topicFilter');
  if (sel) sel.value = topic || '';
  renderCards(); // обновим таблицу
  renderTopicPanel(); // подсветим активную плашку
  if (state.page === 'workspace' && state.mode === 'study') {
    startStudy(); // учим только выбранную тему
  }
}
function renderScheduleListForDeck(deckId) {
  const wrap = document.getElementById('scheduleList');
  if (!wrap) return;
  const wdNamesFull = [
    'Понедельник',
    'Вторник',
    'Среда',
    'Четверг',
    'Пятница',
    'Суббота',
    'Воскресенье',
  ];

  const rows = [];
  (state.schedule.weekly || []).forEach((arr, weekday) => {
    (arr || []).forEach((it) => {
      if (it.deckId === deckId) rows.push({ weekday, item: it });
    });
  });

  if (!rows.length) {
    wrap.innerHTML = `<div class="muted">Пока нет запланированных занятий для этой колоды.</div>`;
    return;
  }

  rows.sort((a, b) => a.weekday - b.weekday);
  wrap.innerHTML = '';
  rows.forEach(({ weekday, item }) => {
    const row = document.createElement('div');
    row.className = 'ws-sched-item';
    row.innerHTML = `
      <div class="left">
        <span class="ws-day">${wdNamesFull[weekday]}</span>
        ${item.topic ? `<span class="ws-topic">• ${item.topic}</span>` : ''}
      </div>
      <button class="btn btn-secondary" style="padding:4px 10px" data-del="${
        item.id
      }">Удалить</button>
    `;
    row.querySelector('[data-del]').onclick = () =>
      removeScheduleItemById(item.id);
    wrap.appendChild(row);

    const col = getDeckColor(currentDeck());
    row.style.borderColor = withAlpha(col, 0.4);
    row.style.background = withAlpha(col, 0.1);
  });
}

function removeScheduleItemById(id) {
  let removed = false;
  (state.schedule.weekly || []).forEach((arr, i) => {
    if (!Array.isArray(arr)) return;
    const before = arr.length;
    state.schedule.weekly[i] = arr.filter((it) => it.id !== id);
    if (state.schedule.weekly[i].length !== before) removed = true;
  });
  if (removed) {
    save();
    showToast('🗑️ Удалено из расписания');
    renderWorkspaceScheduleBox();
    if (state.page === 'home') renderHomeCalendar();
  }
}

// ---- DOM Ready ----
document.addEventListener('DOMContentLoaded', () => {
  load();
  ensureSchedule();
  ensureScheduleIds();

  // Сайдбар навигация
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.onclick = () => setPage(b.dataset.page);
  });

  // Главная: неделя навигация
  document.getElementById('prevWeek').onclick = () => {
    state.uiWeekOffset -= 1;
    renderHomeCalendar();
    save();
  };
  document.getElementById('nextWeek').onclick = () => {
    state.uiWeekOffset += 1;
    renderHomeCalendar();
    save();
  };
  document.getElementById('openScheduleGuide').onclick = () => {
    showToast(
      'Открой «Рабочее место» → «Расписание для колоды», выбери день и тему, нажми «+ Добавить».'
    );
  };

  // Кнопки на главной
  document.querySelectorAll('[data-goto]').forEach((b) => {
    b.onclick = () => setPage(b.getAttribute('data-goto'));
  });

  // Создание колоды
  document.getElementById('createDeckBtn').onclick = () => {
    const titleInput = document.getElementById('deckTitleInput');
    const descInput = document.getElementById('deckDescInput');
    const examInput = document.getElementById('deckExamInput');
    const colorInput = document.getElementById('deckColorInput');

    const title = titleInput.value.trim();
    const desc = descInput.value.trim();
    const examDate = examInput.value;
    const color = (colorInput?.value || '#a855f7').trim();

    if (!title) {
      showToast('Введите название колоды');
      return;
    }
    if (
      state.decks.some((d) => d.title.toLowerCase() === title.toLowerCase())
    ) {
      showToast('Колода с таким названием уже есть');
      return;
    }

    const newDeck = {
      id: uid('deck'),
      title,
      description: desc,
      cards: [],
      examDate: examDate || null,
      color,
    };

    state.decks.push(newDeck);
    state.selectedDeckId = newDeck.id;

    titleInput.value = '';
    descInput.value = '';
    examInput.value = '';
    if (colorInput) colorInput.value = color;

    save();
    renderLibrary();
    showToast('✨ Колода создана');
  };

  // Workspace: расписание — добавить элемент
  const addBtn = document.getElementById('scheduleAddBtn');
  if (addBtn)
    addBtn.onclick = () => {
      const deck = currentDeck();
      if (!deck) {
        showToast('Сначала выбери колоду');
        return;
      }

      const wdSel = document.getElementById('scheduleWeekday');
      const topicInp = document.getElementById('scheduleTopic');
      const weekday = parseInt(wdSel.value, 10);
      const topic = (topicInp.value || '').trim();

      ensureSchedule();
      ensureScheduleIds();

      // проверим дубль (та же колода, тот же день, та же тема)
      const arr =
        state.schedule.weekly[weekday] || (state.schedule.weekly[weekday] = []);
      const isDuplicate = arr.some(
        (it) => it.deckId === deck.id && (it.topic || '') === (topic || '')
      );
      if (isDuplicate) {
        showToast('Уже есть такой пункт в расписании');
        return;
      }

      const item = {
        id: uid('sch'),
        deckId: deck.id,
        topic: topic || undefined,
      };
      arr.push(item);
      save();

      showToast('✅ Добавлено в расписание');
      renderWorkspaceScheduleBox();
      if (state.page === 'home') renderHomeCalendar();
    };

  // Поиск в библиотеке
  document.getElementById('libSearch').oninput = renderLibrary;

  // Экспорт/Импорт
  document.getElementById('exportBtn').onclick = exportData;
  document.getElementById('importBtn').onclick = () => {
    const f = document.createElement('input');
    f.type = 'file';
    f.accept = '.json';
    f.onchange = (e) => importData(e.target.files[0]);
    f.click();
  };
});

const deckColorPicker = document.getElementById('deckColorPicker');
if (deckColorPicker) {
  deckColorPicker.addEventListener('input', (e) => {
    const deck = currentDeck();
    if (!deck) return;
    deck.color = e.target.value || '#a855f7';
    save();
    renderHeader();
    renderLibrary();
    renderHomeCalendar();
    renderTopicPanel();
    renderWorkspaceScheduleBox();
  });
}

// Workspace: переключатель режимов
document.querySelectorAll('.mode-btn').forEach((btn) => {
  btn.onclick = () => {
    state.mode = btn.dataset.mode;
    if (state.mode === 'study') startStudy();
    else {
      renderHeader();
      renderCards();
    }
    updateWorkspaceVisibility();
    document
      .querySelectorAll('.mode-btn')
      .forEach((b) => b.classList.toggle('active', b === btn));
    save();
  };
});

// --- Schedule helpers/UI for Workspace ---

// Workspace: изображения
document.getElementById('frontImgBtn').onclick = () =>
  document.getElementById('frontImgFile').click();
document.getElementById('backImgBtn').onclick = () =>
  document.getElementById('backImgFile').click();
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
document.getElementById('backImgFile').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  if (!f.type.startsWith('image/')) {
    showToast('Нужен файл-изображение');
    return;
  }
  setFieldImage('back', await readFileAsDataURL(f));
});
document.querySelectorAll('.thumb .x').forEach((x) => {
  x.addEventListener('click', () => {
    const t = x.dataset.target;
    setFieldImage(t, null);
    document.getElementById(
      t === 'front' ? 'frontImgFile' : 'backImgFile'
    ).value = '';
  });
});

// Workspace: форма карточки
document
  .getElementById('cardTypeSelect')
  .addEventListener('change', refreshOptionsEditorVisibility);
document
  .getElementById('addOptionBtn')
  .addEventListener('click', () => addOptionRow());
document.getElementById('saveCardBtn').addEventListener('click', saveCard);
document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);

// Workspace: поиск/фильтр
const searchEl = document.getElementById('searchInput');
if (searchEl) searchEl.addEventListener('input', renderCards);
const topicSel = document.getElementById('topicFilter');
if (topicSel)
  topicSel.addEventListener('change', () => {
    renderCards();
    renderTopicPanel();
    if (state.mode === 'study') startStudy();
  });

// Горячие клавиши
document.addEventListener('keydown', (e) => {
  if (state.page === 'workspace' && state.mode === 'study') {
    const card = state.studyQueue[state.studyIndex];

    if (e.code === 'Space') {
      e.preventDefault();
      // Для тестовых карточек – игнорируем пробел
      if (card && card.type === 'single' && card.options?.length) {
        return;
      }
      if (!state.studyShowAnswer) showAns();
    }

    if (e.key === '1') rate(true);
    if (e.key === '2') rate(false);
    // ...
  }
  if (e.ctrlKey && e.key === 'Enter') saveCard();
});


// Первый показ
setPage(state.page || 'home');

// Экспорт helper в окно (чтобы легко заполнять расписание вручную)
window.addScheduleItem = addScheduleItem;
