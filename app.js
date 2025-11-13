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

  // расписание недели (0=Пн ... 6=Вс)
  schedule: { weekly: [[], [], [], [], [], [], []] },

  // Текущая неделя для показа на главной (offset от "сегодня")
  uiWeekOffset: 0,
};

// --- Image Editor state ---
// Глобальное состояние мини-фотошопа
const imgEditor = {
  overlay: null,
  canvas: null,
  ctx: null,
  side: null, // 'front' | 'back'
  tool: 'brush', // 'brush' | 'rect' | 'circle' | 'text'
  color: '#ffffff',
  size: 5,
  drawing: false,
  startX: 0,
  startY: 0,
  savedImageData: null, // для прямоугольника / круга
};

// ---- Utils ----
const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9);

const save = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('localStorage save error', e);
  }
};

const load = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    Object.assign(state, parsed || {});
  } catch (e) {
    console.error('localStorage load error', e);
  }
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

function ensureScheduleIds() {
  if (!state.schedule || !Array.isArray(state.schedule.weekly)) return;
  state.schedule.weekly.forEach((arr, d) => {
    if (!Array.isArray(arr)) state.schedule.weekly[d] = [];
    state.schedule.weekly[d].forEach((it) => {
      if (!it.id) it.id = uid('sch');
    });
  });
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
  state.decks.find((d) => d.id === state.selectedDeckId) || null;

// ---- Color helpers ----
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

// ---- Dates / Home calendar ----
const wdNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function startOfISOWeek(d) {
  const dt = new Date(d);
  const day = (dt.getDay() + 6) % 7; // Пн = 0
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

// ---- Markdown / Math fallback ----
function renderMarkdown(text) {
  if (!text) return '';
  if (window.marked && typeof window.marked.parse === 'function') {
    return window.marked.parse(text);
  }
  // простой fallback: экранируем и переносы строк
  const esc = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return esc.replace(/\n/g, '<br>');
}

function typesetMath() {
  try {
    if (window.MathJax && MathJax.typesetPromise) {
      MathJax.typesetPromise();
    }
  } catch (e) {
    // просто молча игнорируем
  }
}

// ---- HOME: Week calendar ----
function renderHomeCalendar() {
  ensureSchedule();
  const weekGrid = document.getElementById('weekGrid');
  const weekLabel = document.getElementById('weekLabel');
  if (!weekGrid || !weekLabel) return;

  weekGrid.innerHTML = '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const base = startOfISOWeek(new Date());
  const start = addDays(base, state.uiWeekOffset * 7);
  const end = addDays(start, 6);
  weekLabel.textContent = `${fmtDate(start)} — ${fmtDate(end)}`;

  for (let i = 0; i < 7; i++) {
    const dayDate = addDays(start, i);
    const isoIndex = i;
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
  ensureSchedule();
  const arr =
    state.schedule.weekly[weekdayIndex] ||
    (state.schedule.weekly[weekdayIndex] = []);
  arr.push({
    id: uid('sch'),
    deckId,
    topic: (topic || '').trim() || undefined,
  });
  save();
  if (state.page === 'home') renderHomeCalendar();
}

// ---- LIBRARY ----
function formatExamBadge(deck) {
  if (!deck.examDate) return '';
  const exam = new Date(deck.examDate);
  const today = new Date();
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
  if (!grid || !empty) return;

  const q = (document.getElementById('libSearch')?.value || '').toLowerCase();
  grid.innerHTML = '';
  let decks = state.decks || [];
  if (q) {
    decks = decks.filter(
      (d) =>
        (d.title || '').toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q)
    );
  }
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
      <div class="row-between" style="align-items:flex-start; gap:8px;">
        <div class="title" style="color:${deckColor}">${d.title}</div>
        <div class="deck-menu">
          <button class="icon-btn deck-menu-toggle" title="Меню">⋮</button>
          <div class="deck-menu-popup">
            <button type="button" data-action="color">Изменить цвет</button>
            <button type="button" data-action="export">Экспорт колоды</button>
            <button type="button" data-action="import">Импорт в колоду</button>
          </div>
        </div>
      </div>

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

    // Открыть колоду
    card.querySelector('[data-open]').onclick = () => {
      state.selectedDeckId = d.id;
      state.mode = 'manage';
      state.studyShowAnswer = false;

      const topicSel = document.getElementById('topicFilter');
      if (topicSel) topicSel.value = '';

      setPage('workspace');
    };

    // Удалить колоду
    card.querySelector('[data-del]').onclick = () => {
      if (confirm(`Удалить колоду «${d.title}»?`)) {
        state.decks = state.decks.filter((x) => x.id !== d.id);
        if (state.selectedDeckId === d.id) state.selectedDeckId = null;
        save();
        renderLibrary();
      }
    };

    // Меню "три точки"
    const menuToggle = card.querySelector('.deck-menu-toggle');
    const menuPopup = card.querySelector('.deck-menu-popup');

    if (menuToggle && menuPopup) {
      menuToggle.onclick = (e) => {
        e.stopPropagation();
        // закрываем другие открытые меню
        document
          .querySelectorAll('.deck-menu-popup.open')
          .forEach((m) => m !== menuPopup && m.classList.remove('open'));
        menuPopup.classList.toggle('open');
      };

      // Клик по действиям
      menuPopup.onclick = (e) => {
        e.stopPropagation();
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        menuPopup.classList.remove('open');

        if (action === 'color') {
          // Открываем эту колоду и color-picker
          state.selectedDeckId = d.id;
          state.mode = 'manage';
          setPage('workspace');
          const picker = document.getElementById('deckColorPicker');
          if (picker) picker.click();
        }

        if (action === 'export') {
          exportDeck(d.id);
        }

        if (action === 'import') {
          importIntoDeck(d.id);
        }
      };
    }

    grid.appendChild(card);
  });
}

// ---- WORKSPACE ----
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
  const editor = document.getElementById('optionsEditor');
  if (!select || !editor) return;
  editor.style.display = select.value === 'single' ? 'block' : 'none';
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
  if (!field || !thumb) return;
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
  const frontField = document.getElementById('frontField');
  const backField = document.getElementById('backField');
  const front = frontField?.dataset.img || null;
  const back = backField?.dataset.img || null;
  return {
    frontImg: front && front.startsWith('data:') ? front : null,
    backImg: back && back.startsWith('data:') ? back : null,
  };
}

function clearFormImagesInline() {
  setFieldImage('front', null);
  setFieldImage('back', null);
  const f1 = document.getElementById('frontImgFile');
  const f2 = document.getElementById('backImgFile');
  if (f1) f1.value = '';
  if (f2) f2.value = '';
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
  const topics = document.getElementById('topicPanel'); // может не быть

  if (!editor || !table || !study) return;

  if (state.page !== 'workspace') {
    editor.style.display = 'none';
    table.style.display = 'none';
    study.style.display = 'none';
    if (sched) sched.style.display = 'none';
    if (topics) topics.style.display = 'none';
    return;
  }

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
    if (topics) topics.style.display = '';
  }
}

function renderHeader() {
  const deck = currentDeck();
  const titleEl = document.getElementById('pageTitle');
  const examInfoEl = document.getElementById('deckExamInfo');
  const colorBox = document.getElementById('deckColorBox');
  const colorInput = document.getElementById('deckColorPicker');
  const backBtn = document.getElementById('backToLibraryBtn');
  const workspaceSwitch = document.getElementById('workspaceSwitch');

  if (!titleEl || !examInfoEl) return;

  if (state.page === 'workspace') {
    titleEl.textContent = deck ? deck.title : 'Рабочее место';
    examInfoEl.textContent =
      deck && deck.examDate
        ? 'Экзамен: ' + deck.examDate + ' · ' + formatExamBadge(deck)
        : '';

    if (deck) {
      const col = getDeckColor(deck);
      titleEl.style.color = col;
      titleEl.classList.add('accented');
      if (colorBox) colorBox.style.display = 'flex';
      if (colorInput) colorInput.value = col;
    } else {
      titleEl.style.color = '';
      titleEl.classList.remove('accented');
      if (colorBox) colorBox.style.display = 'none';
    }

    if (backBtn) backBtn.style.display = 'inline-flex';
    if (workspaceSwitch) workspaceSwitch.style.display = 'flex';
  } else {
    titleEl.textContent = state.page === 'library' ? 'Библиотека' : 'Главная';
    examInfoEl.textContent = '';
    titleEl.style.color = '';
    titleEl.classList.remove('accented');

    if (colorBox) colorBox.style.display = 'none';
    if (backBtn) backBtn.style.display = 'none';
    if (workspaceSwitch) workspaceSwitch.style.display = 'none';
  }

  document
    .querySelectorAll('.mode-btn')
    .forEach((btn) =>
      btn.classList.toggle('active', btn.dataset.mode === state.mode)
    );
}

function getDeckTopics(deck) {
  const set = new Set();
  (deck?.cards || []).forEach((c) => {
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
  const tbody = document.querySelector('#cardTable tbody');
  const empty = document.querySelector('#cardTable .empty-state');
  if (!tbody || !empty) return;
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

  const cards = (deck.cards || []).filter((c) => {
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
  const f1 = document.getElementById('frontImgFile');
  const f2 = document.getElementById('backImgFile');
  if (f1) f1.value = '';
  if (f2) f2.value = '';
  refreshOptionsEditorVisibility();
  clearOptionsEditor();
  if (c.type === 'single' && Array.isArray(c.options)) {
    c.options.forEach((opt) => addOptionRow(opt));
  }
  const form = document.querySelector('.card-form');
  if (form) {
    form.dataset.edit = id;
  }
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
  if (form) delete form.dataset.edit;
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
  const editId = form?.dataset.edit;
  if (editId) {
    const c = deck.cards.find((x) => x.id === editId);
    if (c) {
      Object.assign(c, {
        front,
        back,
        type,
        options: type === 'single' ? options : [],
        frontImg,
        backImg,
        topic,
      });
    }
    if (form) delete form.dataset.edit;
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
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderOptionsForStudy(card) {
  const container = document.getElementById('optionsContainer');
  if (!container) return;
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
  if (!lbl || !txt || !btns || !optionsContainer) return;

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
    txt.innerHTML = renderMarkdown(sideText);
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
    typesetMath();
  };

  if (isTest) {
    // single choice — никогда не показываем "ответную сторону"
    lbl.textContent = 'Тест (один правильный ответ)';
    setSide(false);
    renderOptionsForStudy(card);

    btns.innerHTML = '<button class="btn" id="btnCheck">Проверить</button>';
    document.getElementById('btnCheck').onclick = checkTest;
    return;
  } else {
    optionsContainer.innerHTML = '';
    lbl.textContent = state.studyShowAnswer ? 'Ответ' : 'Вопрос';
    setSide(state.studyShowAnswer);
    btns.innerHTML = state.studyShowAnswer
      ? '<button class="btn btn-secondary" id="btnBack">← Назад</button><button class="btn" id="btnKnow">Знал</button><button class="btn btn-secondary" id="btnDont">Не знал</button>'
      : '<button class="btn" id="btnShow">Показать ответ</button>';

    if (!state.studyShowAnswer) {
      document.getElementById('btnShow').onclick = showAns;
    } else {
      document.getElementById('btnBack').onclick = backToQuestion;
      document.getElementById('btnKnow').onclick = () => rate(true);
      document.getElementById('btnDont').onclick = () => rate(false);
    }
  }
}

function startStudy() {
  const deck = currentDeck();
  if (!deck) {
    showToast('Сначала выбери колоду в Библиотеке');
    return;
  }
  if (!deck.cards || !deck.cards.length) {
    showToast('В этой колоде пока нет карточек');
    return;
  }

  const topicSel = document.getElementById('topicFilter');
  let topicFilter = (topicSel?.value || '').trim();

  let base = deck.cards;

  if (topicFilter) {
    const byTopic = deck.cards.filter((c) => (c.topic || '') === topicFilter);
    if (byTopic.length) {
      base = byTopic;
    } else {
      if (topicSel) topicSel.value = '';
      topicFilter = '';
      showToast('В этой теме нет карточек — учим всю колоду');
      base = deck.cards;
    }
  }

  const now = Date.now();
  const due = base.filter((c) => !c.due || c.due <= now);
  const pool = due.length ? due : base;
  if (!pool.length) {
    showToast('В этой колоде нет карточек для повторения');
    return;
  }

  state.studyQueue = shuffleArray(pool);
  state.studyIndex = 0;
  state.studyShowAnswer = false;
  state.mode = 'study';

  const studySection = document.getElementById('studySection');
  if (studySection) studySection.style.display = 'block';

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
  if (!container) return;
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
// ---- Export/Import одной колоды ----
function exportDeck(deckId) {
  const deck = state.decks.find((d) => d.id === deckId);
  if (!deck) {
    showToast('Колода не найдена');
    return;
  }
  const safeTitle = (deck.title || 'deck').replace(/[^a-z0-9_\-а-яё]/gi, '_');
  const blob = new Blob([JSON.stringify(deck, null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `deck_${safeTitle}.json`;
  a.click();
}

function importIntoDeck(deckId) {
  const deck = state.decks.find((d) => d.id === deckId);
  if (!deck) {
    showToast('Колода не найдена');
    return;
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);

        // ожидаем либо объект с cards, либо массив карточек
        let cards = [];
        if (Array.isArray(parsed)) {
          cards = parsed;
        } else if (parsed && Array.isArray(parsed.cards)) {
          cards = parsed.cards;
        } else {
          showToast('Неподходящий формат JSON');
          return;
        }

        const prepared = cards.map((c) => ({
          id: c.id || uid('card'),
          front: c.front || '',
          back: c.back || '',
          type: c.type || 'basic',
          options: Array.isArray(c.options) ? c.options : [],
          frontImg: c.frontImg || null,
          backImg: c.backImg || null,
          topic: c.topic || '',
          createdAt: c.createdAt || Date.now(),
          interval: c.interval || 0,
          reps: c.reps || 0,
          due: c.due || Date.now(),
        }));

        if (!Array.isArray(deck.cards)) deck.cards = [];
        deck.cards.push(...prepared);

        save();
        showToast(`📥 Импортировано карточек: ${prepared.length}`);

        // если эта колода сейчас открыта — обновим таблицу
        if (state.selectedDeckId === deckId && state.page === 'workspace') {
          renderCards();
          renderWorkspaceScheduleBox();
          renderTopicPanel();
        }
      } catch (err) {
        console.error(err);
        showToast('Ошибка импорта');
      }
    };
    r.readAsText(file);
  };
  input.click();
}

// ---- Schedule helpers for Workspace ----
function getDeckTopicsSafe() {
  const deck = currentDeck();
  return deck ? getDeckTopics(deck) : [];
}

function renderWorkspaceScheduleBox() {
  const box = document.getElementById('wsScheduleBox');
  const deck = currentDeck();
  if (!box) return;

  if (!deck || state.mode === 'study' || state.page !== 'workspace') {
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

function applyTopicFilter(topic) {
  const sel = document.getElementById('topicFilter');
  if (sel) sel.value = topic || '';
  renderCards();
  renderTopicPanel();
  if (state.page === 'workspace' && state.mode === 'study') {
    startStudy();
  }
}

// ---- Page routing ----
function setPage(page) {
  state.page = page;

  const homeSection = document.getElementById('homeSection');
  const librarySection = document.getElementById('librarySection');
  const workspaceSection = document.getElementById('workspaceSection');
  const libraryPanel = document.getElementById('libraryPanel');

  if (homeSection)
    homeSection.style.display = page === 'home' ? 'block' : 'none';
  if (librarySection)
    librarySection.style.display = page === 'library' ? 'block' : 'none';
  if (workspaceSection)
    workspaceSection.style.display = page === 'workspace' ? 'block' : 'none';
  if (libraryPanel)
    libraryPanel.style.display = page === 'library' ? 'block' : 'none';

  if (page === 'home') renderHomeCalendar();
  if (page === 'library') renderLibrary();
  if (page === 'workspace') {
    renderCards();
    renderWorkspaceScheduleBox();
    renderTopicPanel();
    if (state.mode === 'study') renderStudy();
  }

  renderHeader();
  updateWorkspaceVisibility();
  save();
}

// ---- DOM Ready ----
// ---- DOM Ready ----

// ---- DOM Ready ----
// ---- DOM Ready ----
document.addEventListener('DOMContentLoaded', () => {
  load();
  ensureSchedule();
  ensureScheduleIds();

  // ---------- Навигация сайдбара ----------
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.onclick = () => setPage(b.dataset.page);
  });

  // ---------- Главная: неделя навигация ----------
  const prevWeekBtn = document.getElementById('prevWeek');
  const nextWeekBtn = document.getElementById('nextWeek');
  if (prevWeekBtn)
    prevWeekBtn.onclick = () => {
      state.uiWeekOffset -= 1;
      renderHomeCalendar();
      save();
    };
  if (nextWeekBtn)
    nextWeekBtn.onclick = () => {
      state.uiWeekOffset += 1;
      renderHomeCalendar();
      save();
    };

  const scheduleGuideBtn = document.getElementById('openScheduleGuide');
  if (scheduleGuideBtn)
    scheduleGuideBtn.onclick = () => {
      showToast(
        'Открой «Библиотека → выбери колоду → Рабочее место», блок «Расписание для колоды», выбери день и тему, нажми «+ Добавить».'
      );
    };

  // Кнопки "перейти" на главной
  document.querySelectorAll('[data-goto]').forEach((b) => {
    b.onclick = () => setPage(b.getAttribute('data-goto'));
  });

  // ---------- Создание колоды ----------
  const createDeckBtn = document.getElementById('createDeckBtn');
  if (createDeckBtn)
    createDeckBtn.onclick = () => {
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
        state.decks.some(
          (d) => (d.title || '').toLowerCase() === title.toLowerCase()
        )
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

  // ---------- Расписание в workspace ----------
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

  // ---------- Поиск в библиотеке ----------
  const libSearch = document.getElementById('libSearch');
  if (libSearch) libSearch.oninput = renderLibrary;

  // ---------- Экспорт / Импорт ВСЕХ данных (кнопки в сайдбаре) ----------
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');

  if (exportBtn && typeof exportData === 'function') {
    exportBtn.onclick = exportData;
  }

  if (importBtn) {
    importBtn.onclick = () => {
      const f = document.createElement('input');
      f.type = 'file';
      f.accept = '.json';
      f.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (typeof importData === 'function') {
          importData(file);
        } else {
          showToast('Импорт пока не реализован в этом билде');
        }
      };
      f.click();
    };
  }

  // ---------- Кнопка "Назад в библиотеку" ----------
  const backToLibraryBtn = document.getElementById('backToLibraryBtn');
  if (backToLibraryBtn)
    backToLibraryBtn.onclick = () => {
      setPage('library');
    };

  // ---------- Цвет колоды (только в рабочем месте) ----------
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

  // ---------- Работа с изображениями (загрузка + авто-фотошоп) ----------
  const frontImgBtn = document.getElementById('frontImgBtn');
  const backImgBtn = document.getElementById('backImgBtn');
  const frontImgFile = document.getElementById('frontImgFile');
  const backImgFile = document.getElementById('backImgFile');

  if (frontImgBtn && frontImgFile)
    frontImgBtn.onclick = () => frontImgFile.click();
  if (backImgBtn && backImgFile) backImgBtn.onclick = () => backImgFile.click();

  if (frontImgFile)
    frontImgFile.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      if (!f.type.startsWith('image/')) {
        showToast('Нужен файл-изображение');
        return;
      }
      const dataUrl = await readFileAsDataURL(f);

      // 1) сразу кладём в форму
      setFieldImage('front', dataUrl);
      // 2) сразу открываем фотошоп с этой картинкой
      openImageEditor('front');
    });

  if (backImgFile)
    backImgFile.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      if (!f.type.startsWith('image/')) {
        showToast('Нужен файл-изображение');
        return;
      }
      const dataUrl = await readFileAsDataURL(f);

      setFieldImage('back', dataUrl);
      openImageEditor('back');
    });

  document.querySelectorAll('.thumb .x').forEach((x) => {
    x.addEventListener('click', () => {
      const t = x.dataset.target;
      setFieldImage(t, null);
      const input =
        t === 'front'
          ? document.getElementById('frontImgFile')
          : document.getElementById('backImgFile');
      if (input) input.value = '';
    });
  });

  // ---------- ИНИЦИАЛИЗАЦИЯ МИНИ-ФОТОШОПА ----------
  function initImageEditor() {
    const overlay = document.getElementById('imgEditorOverlay');
    const canvas = document.getElementById('imgEditorCanvas');
    if (!overlay || !canvas) return;

    imgEditor.overlay = overlay;
    imgEditor.canvas = canvas;
    imgEditor.ctx = canvas.getContext('2d');

    const closeBtn = document.getElementById('imgEditorCloseBtn');
    const saveBtn = document.getElementById('imgEditorSaveBtn');
    const clearBtn = document.getElementById('imgEditorClearBtn');
    const colorInp = document.getElementById('imgEditorColor');
    const sizeInp = document.getElementById('imgEditorSize');

    if (closeBtn)
      closeBtn.onclick = () => {
        overlay.style.display = 'none';
        imgEditor.side = null;
      };

    if (saveBtn)
      saveBtn.onclick = () => {
        const dataUrl = imgEditor.canvas.toDataURL('image/png');
        if (imgEditor.side === 'front') {
          setFieldImage('front', dataUrl);
        } else if (imgEditor.side === 'back') {
          setFieldImage('back', dataUrl);
        }
        save();
        overlay.style.display = 'none';
        imgEditor.side = null;
        showToast('🖼️ Изображение сохранено в карточку');
      };

    if (clearBtn)
      clearBtn.onclick = () => {
        const { ctx, canvas } = imgEditor;
        ctx.fillStyle = '#0b1120';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      };

    if (colorInp)
      colorInp.oninput = (e) => {
        imgEditor.color = e.target.value || '#ffffff';
      };

    if (sizeInp)
      sizeInp.oninput = (e) => {
        imgEditor.size = parseInt(e.target.value, 10) || 5;
      };

    // выбор инструмента
    document.querySelectorAll('.img-tool-btn').forEach((btn) => {
      btn.onclick = () => {
        const tool = btn.dataset.tool;
        imgEditor.tool = tool;
        document
          .querySelectorAll('.img-tool-btn')
          .forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });

    const c = canvas;
    const getPos = (ev) => {
      const rect = c.getBoundingClientRect();
      const sx = c.width / rect.width;
      const sy = c.height / rect.height;

      if (ev.touches && ev.touches[0]) {
        return {
          x: (ev.touches[0].clientX - rect.left) * sx,
          y: (ev.touches[0].clientY - rect.top) * sy,
        };
      }
      return {
        x: (ev.clientX - rect.left) * sx,
        y: (ev.clientY - rect.top) * sy,
      };
    };

    const startDraw = (ev) => {
      ev.preventDefault();
      const { x, y } = getPos(ev);
      const ctx = imgEditor.ctx;

      if (imgEditor.tool === 'text') {
        const text = prompt('Введите текст:');
        if (text) {
          ctx.fillStyle = imgEditor.color;
          ctx.font = `${Math.max(
            imgEditor.size * 4,
            12
          )}px system-ui, sans-serif`;
          ctx.fillText(text, x, y);
        }
        return;
      }

      imgEditor.drawing = true;
      imgEditor.startX = x;
      imgEditor.startY = y;

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (imgEditor.tool === 'brush') {
        ctx.beginPath();
        ctx.moveTo(x, y);
      } else if (imgEditor.tool === 'rect' || imgEditor.tool === 'circle') {
        imgEditor.savedImageData = ctx.getImageData(0, 0, c.width, c.height);
      }
    };

    const moveDraw = (ev) => {
      if (!imgEditor.drawing) return;
      ev.preventDefault();
      const { x, y } = getPos(ev);
      const ctx = imgEditor.ctx;

      ctx.strokeStyle = imgEditor.color;
      ctx.lineWidth = imgEditor.size;

      if (imgEditor.tool === 'brush') {
        ctx.lineTo(x, y);
        ctx.stroke();
      } else if (imgEditor.tool === 'rect') {
        ctx.putImageData(imgEditor.savedImageData, 0, 0);
        const w = x - imgEditor.startX;
        const h = y - imgEditor.startY;
        ctx.strokeRect(imgEditor.startX, imgEditor.startY, w, h);
      } else if (imgEditor.tool === 'circle') {
        ctx.putImageData(imgEditor.savedImageData, 0, 0);
        const dx = x - imgEditor.startX;
        const dy = y - imgEditor.startY;
        const r = Math.sqrt(dx * dx + dy * dy);
        ctx.beginPath();
        ctx.arc(imgEditor.startX, imgEditor.startY, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    };

    const endDraw = (ev) => {
      if (!imgEditor.drawing) return;
      ev.preventDefault();
      imgEditor.drawing = false;
    };

    c.addEventListener('mousedown', startDraw);
    c.addEventListener('mousemove', moveDraw);
    c.addEventListener('mouseup', endDraw);
    c.addEventListener('mouseleave', endDraw);

    c.addEventListener('touchstart', startDraw, { passive: false });
    c.addEventListener('touchmove', moveDraw, { passive: false });
    c.addEventListener('touchend', endDraw, { passive: false });

    // Закрытие по клику в фон
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.style.display = 'none';
        imgEditor.side = null;
      }
    });
  }

  function openImageEditor(side) {
    const overlay = document.getElementById('imgEditorOverlay');
    const canvas = document.getElementById('imgEditorCanvas');
    if (!overlay || !canvas || !imgEditor.ctx) return;

    imgEditor.side = side;
    overlay.style.display = 'flex';

    const ctx = imgEditor.ctx;
    const w = canvas.width;
    const h = canvas.height;

    // фон
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, w, h);

    // если есть изображение в карточке — подгружаем
    const fieldId = side === 'front' ? 'frontField' : 'backField';
    const field = document.getElementById(fieldId);
    const dataUrl = field?.dataset.img || null;

    if (dataUrl) {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(w / img.width, h / img.height);
        const iw = img.width * ratio;
        const ih = img.height * ratio;
        const ox = (w - iw) / 2;
        const oy = (h - ih) / 2;
        ctx.fillStyle = '#0b1120';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, ox, oy, iw, ih);
      };
      img.src = dataUrl;
    }
  }

  // ---------- Форма карточки ----------
  const cardTypeSelect = document.getElementById('cardTypeSelect');
  if (cardTypeSelect)
    cardTypeSelect.addEventListener('change', refreshOptionsEditorVisibility);

  const addOptionBtn = document.getElementById('addOptionBtn');
  if (addOptionBtn)
    addOptionBtn.addEventListener('click', () => addOptionRow());

  const saveCardBtn = document.getElementById('saveCardBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  if (saveCardBtn) saveCardBtn.addEventListener('click', saveCard);
  if (cancelEditBtn) cancelEditBtn.addEventListener('click', cancelEdit);

  // ---------- Поиск / фильтр ----------
  const searchEl = document.getElementById('searchInput');
  if (searchEl) searchEl.addEventListener('input', renderCards);
  const topicSel = document.getElementById('topicFilter');
  if (topicSel)
    topicSel.addEventListener('change', () => {
      renderCards();
      renderTopicPanel();
      if (state.mode === 'study') startStudy();
    });

  // ---------- Переключатель режимов (Редактировать / Учить) ----------
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.onclick = () => {
      state.mode = btn.dataset.mode;
      if (state.mode === 'study') startStudy();
      else {
        renderHeader();
        renderCards();
        renderWorkspaceScheduleBox();
      }
      updateWorkspaceVisibility();
      document
        .querySelectorAll('.mode-btn')
        .forEach((b) => b.classList.toggle('active', b === btn));
      save();
    };
  });

  // ---------- Закрытие меню колод по клику вне ----------
  document.addEventListener('click', (e) => {
    if (e.target.closest('.deck-menu')) return;
    document
      .querySelectorAll('.deck-menu-popup.open')
      .forEach((m) => m.classList.remove('open'));
  });

  // ---------- Горячие клавиши ----------
  document.addEventListener('keydown', (e) => {
    if (state.page === 'workspace' && state.mode === 'study') {
      const card = state.studyQueue[state.studyIndex];

      if (e.code === 'Space') {
        e.preventDefault();
        if (card && card.type === 'single' && card.options?.length) {
          return;
        }
        if (!state.studyShowAnswer) showAns();
      }

      if (e.key === '1') rate(true);
      if (e.key === '2') rate(false);
    }
    if (e.ctrlKey && e.key === 'Enter') saveCard();
  });

  // ---------- Первый показ ----------
  setPage(state.page || 'home');

  // ---------- Инициализация редактора изображений ----------
  initImageEditor();

  // Кнопки ✏️ для открытия редактора вручную
  const frontEditBtn = document.getElementById('frontEditBtn');
  if (frontEditBtn)
    frontEditBtn.onclick = () => {
      openImageEditor('front');
    };

  const backEditBtn = document.getElementById('backEditBtn');
  if (backEditBtn)
    backEditBtn.onclick = () => {
      openImageEditor('back');
    };

  // helper для консоли
  window.addScheduleItem = addScheduleItem;
});
