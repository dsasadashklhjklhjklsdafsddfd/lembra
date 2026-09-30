import * as store from './store.js';
import * as alerts from './alerts.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const COLORS = ['default', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'pink', 'brown', 'gray'];
const REPEAT_LABEL = { none: '', daily: 'todo dia', weekdays: 'dias úteis', weekly: 'toda semana', monthly: 'todo mês' };

const ui = {
  view: safeGet('lembra:view') || 'board',
  query: '',
};

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

/* ───────────── Datas ───────────── */

const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dayDiff = (t) => Math.round((startOfDay(t) - startOfDay(Date.now())) / 86400000);
const hhmm = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function fmtWhen(t) {
  const diff = t - Date.now();
  if (diff > 0 && diff < 60 * 60 * 1000) return `em ${Math.max(1, Math.round(diff / 60000))} min`;
  const dd = dayDiff(t);
  if (dd === 0) return `Hoje ${hhmm(t)}`;
  if (dd === 1) return `Amanhã ${hhmm(t)}`;
  if (dd === -1) return `Ontem ${hhmm(t)}`;
  const opts = { day: 'numeric', month: 'short' };
  if (new Date(t).getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return `${new Date(t).toLocaleDateString('pt-BR', opts).replace('.', '')} ${hhmm(t)}`;
}
const fmtFull = (t) => new Date(t).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' });

function nextOccurrence(iso, repeat, now) {
  const d = new Date(iso);
  const step = () => {
    if (repeat === 'weekly') d.setDate(d.getDate() + 7);
    else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 1);
  };
  do step(); while (d.getTime() <= now || (repeat === 'weekdays' && (d.getDay() === 0 || d.getDay() === 6)));
  return d.toISOString();
}

/* ───────────── Filtro ───────────── */

function matches(it, q) {
  if (!q) return true;
  const hay = [it.title, it.body, ...(it.labels || []), ...(it.checklist || []).map((c) => c.text)].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w.replace(/^#/, '')));
}

/* ───────────── Pedaços de UI ───────────── */

const ICONS = {
  pin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 3a1 1 0 0 1 .7 1.7L15 6.4v4.2l2.7 2.7a1 1 0 0 1-.7 1.7h-4v5a1 1 0 0 1-2 0v-5H7a1 1 0 0 1-.7-1.7L9 10.6V6.4L7.3 4.7A1 1 0 0 1 8 3h8z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7l2 2 3-3M4 16l2 2 3-3M13 8h7M13 17h7"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
};

function reminderChip(it) {
  if (!it.remindAt) return '';
  const t = Date.parse(it.remindAt);
  const late = t < Date.now() && !it.done;
  const rep = it.repeat && it.repeat !== 'none' ? ' <span class="rep" title="Repete ' + REPEAT_LABEL[it.repeat] + '">↻</span>' : '';
  return `<span class="chip rem t-${it.alertType} ${late ? 'is-late' : ''}" title="${esc(alerts.TYPES[it.alertType]?.label)} · ${esc(fmtFull(t))}"><i class="tdot"></i>${esc(fmtWhen(t))}${rep}</span>`;
}

function card(it) {
  const checks = it.checklist || [];
  const doneCount = checks.filter((c) => c.done).length;
  const preview = checks.slice(0, 6).map((c) => `
      <li class="${c.done ? 'is-checked' : ''}">
        <button class="cbox" data-act="check" data-check="${c.id}" aria-pressed="${c.done}" aria-label="Marcar ${esc(c.text)}">${c.done ? ICONS.check : ''}</button>
        <span>${esc(c.text)}</span>
      </li>`).join('');
  const labels = (it.labels || []).map((l) => `<span class="chip label" data-act="label" data-label="${esc(l)}">#${esc(l)}</span>`).join('');
  return `
    <article class="card c-${esc(it.color || 'default')} ${it.done ? 'is-done' : ''}" draggable="true" data-id="${it.id}" tabindex="0">
      <button class="card-done" data-act="toggle-done" aria-label="${it.done ? 'Reabrir' : 'Concluir'}" title="${it.done ? 'Reabrir' : 'Concluir'}">${ICONS.check}</button>
      ${it.pinned ? `<span class="card-pin" title="Fixada">${ICONS.pin}</span>` : ''}
      ${it.title ? `<h4 class="card-title">${esc(it.title)}</h4>` : ''}
      ${it.body ? `<p class="card-body">${esc(it.body)}</p>` : ''}
      ${preview ? `<ul class="card-checks">${preview}</ul>${checks.length > 6 ? `<div class="more">+${checks.length - 6} itens</div>` : ''}` : ''}
      ${it.remindAt || checks.length || labels ? `
      <footer class="card-meta">
        ${reminderChip(it)}
        ${checks.length ? `<span class="chip ${doneCount === checks.length ? 'is-ok' : ''}">${ICONS.list}${doneCount}/${checks.length}</span>` : ''}
        ${labels}
      </footer>` : ''}
    </article>`;
}

function renderBoard(s, items) {
  const cols = s.columns.map((c) => {
    const list = items.filter((i) => i.columnId === c.id).sort((a, b) => a.order - b.order);
    return `
      <section class="col" data-col="${c.id}">
        <header class="col-head">
          <input class="col-title" data-col="${c.id}" value="${esc(c.title)}" aria-label="Nome da lista" spellcheck="false">
          <span class="col-count">${list.length}</span>
          ${s.columns.length > 1 ? `<button class="icon-btn sm" data-act="del-col" data-col="${c.id}" title="Excluir lista" aria-label="Excluir lista">${ICONS.x}</button>` : ''}
        </header>
        <div class="col-list" data-col="${c.id}">
          ${list.map(card).join('') || (ui.query ? '' : '<div class="col-empty">Solte cartões aqui</div>')}
        </div>
        <form class="quick-add" data-col="${c.id}">
          <input name="title" placeholder="+ Adicionar cartão" autocomplete="off" aria-label="Adicionar cartão em ${esc(c.title)}">
        </form>
      </section>`;
  }).join('');
  return `<div class="board">${cols}
    <form class="col col-new" id="col-new">
      <input name="title" placeholder="+ Nova lista" autocomplete="off" aria-label="Nova lista">
    </form></div>`;
}

function renderNotes(items) {
  const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);
  const pinned = sorted.filter((i) => i.pinned);
  const rest = sorted.filter((i) => !i.pinned);
  const grid = (arr) => `<div class="masonry">${arr.map(card).join('')}</div>`;
  return `
    <div class="notes">
      <button class="composer" data-act="new">Criar uma nota…<span>${ICONS.plus}</span></button>
      ${pinned.length ? `<h5 class="section-label">Fixadas</h5>${grid(pinned)}` : ''}
      ${pinned.length && rest.length ? '<h5 class="section-label">Outras</h5>' : ''}
      ${rest.length ? grid(rest) : ''}
      ${!items.length ? emptyState() : ''}
    </div>`;
}

function renderAgenda(items) {
  const now = Date.now();
  const upcoming = items.filter((i) => i.remindAt && !i.done).sort((a, b) => Date.parse(a.remindAt) - Date.parse(b.remindAt));
  const groups = [
    ['Atrasados', (t) => t < now],
    ['Hoje', (t) => dayDiff(t) === 0],
    ['Amanhã', (t) => dayDiff(t) === 1],
    ['Próximos 7 dias', (t) => dayDiff(t) <= 7],
    ['Mais tarde', () => true],
  ];
  const used = new Set();
  const html = groups.map(([label, test]) => {
    const rows = upcoming.filter((i) => !used.has(i.id) && test(Date.parse(i.remindAt)));
    rows.forEach((r) => used.add(r.id));
    if (!rows.length) return '';
    return `<h5 class="section-label ${label === 'Atrasados' ? 'is-late' : ''}">${label}<span>${rows.length}</span></h5>
      <div class="ag-list">${rows.map((it) => {
        const t = Date.parse(it.remindAt);
        return `
        <div class="ag-row t-${it.alertType}" data-id="${it.id}" tabindex="0">
          <time class="ag-time" datetime="${it.remindAt}">${hhmm(t)}<small>${new Date(t).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')}</small></time>
          <div class="ag-main">
            <b>${esc(it.title || 'Sem título')}</b>
            ${it.body ? `<span>${esc(it.body)}</span>` : ''}
          </div>
          <span class="badge t-${it.alertType}">${esc(alerts.TYPES[it.alertType]?.label)}${it.repeat !== 'none' ? ' · ' + REPEAT_LABEL[it.repeat] : ''}</span>
          <div class="ag-acts">
            <button class="ghost sm" data-act="snooze" data-min="10">+10 min</button>
            <button class="ghost sm" data-act="snooze" data-min="60">+1 h</button>
            <button class="icon-btn sm" data-act="toggle-done" title="Concluir" aria-label="Concluir">${ICONS.check}</button>
          </div>
        </div>`;
      }).join('')}</div>`;
  }).join('');
  return `<div class="agenda">${html || emptyState('Nenhum lembrete agendado', 'Abra um cartão e escolha data, hora e o tipo de alerta.')}</div>`;
}

function emptyState(title = ui.query ? 'Nada encontrado' : 'Tudo limpo por aqui', sub = ui.query ? 'Tente outra busca.' : 'Crie seu primeiro lembrete no botão “Novo”.') {
  return `<div class="empty"><div class="empty-icon">${ICONS.clock}</div><b>${title}</b><span>${sub}</span></div>`;
}

/* ───────────── Render principal ───────────── */

function render() {
  const s = store.getState();
  const view = $('#view');

  // Preserva o que a pessoa estiver digitando num campo de adição rápida.
  const active = document.activeElement;
  const keep = active && view.contains(active) && active.matches('.quick-add input, #col-new input')
    ? { sel: active.closest('.quick-add') ? `.quick-add[data-col="${active.closest('.quick-add').dataset.col}"] input` : '#col-new input', value: active.value }
    : null;

  $$('.views button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === ui.view)));
  const items = s.items.filter((i) => matches(i, ui.query));
  view.dataset.view = ui.view;
  view.innerHTML = ui.view === 'notes' ? renderNotes(items) : ui.view === 'agenda' ? renderAgenda(items) : renderBoard(s, items);

  if (keep) {
    const el = $(keep.sel, view);
    if (el) { el.value = keep.value; el.focus(); }
  }
  updateNotifStatus();
}

store.subscribe(render);

/* ───────────── Eventos da área principal ───────────── */

$$('.views button').forEach((b) =>
  b.addEventListener('click', () => {
    ui.view = b.dataset.view;
    safeSet('lembra:view', ui.view);
    render();
  })
);

$('#search').addEventListener('input', (e) => { ui.query = e.target.value.trim(); render(); });

$('#view').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  const host = e.target.closest('[data-id]');
  const id = host?.dataset.id;
  if (btn) {
    const act = btn.dataset.act;
    if (act === 'new') return openEditor(null);
    if (act === 'toggle-done' && id) return store.setDone(id, !store.getItem(id).done);
    if (act === 'snooze' && id) return snooze(id, Number(btn.dataset.min));
    if (act === 'label') {
      e.stopPropagation();
      $('#search').value = '#' + btn.dataset.label;
      ui.query = btn.dataset.label;
      return render();
    }
    if (act === 'check' && id) {
      const it = store.getItem(id);
      return store.updateItem(id, { checklist: it.checklist.map((c) => (c.id === btn.dataset.check ? { ...c, done: !c.done } : c)) });
    }
    if (act === 'del-col') {
      const col = store.getState().columns.find((c) => c.id === btn.dataset.col);
      const n = store.getState().items.filter((i) => i.columnId === col.id).length;
      if (!n || confirm(`Excluir a lista “${col.title}”? Os ${n} cartões vão para a primeira lista.`)) store.deleteColumn(col.id);
      return;
    }
  }
  if (id && !e.target.closest('input, form')) openEditor(id);
});

$('#view').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('.card, .ag-row')) openEditor(e.target.dataset.id);
});

$('#view').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const input = form.querySelector('input');
  const title = input.value.trim();
  if (!title) return;
  input.value = '';
  if (form.id === 'col-new') store.addColumn(title);
  else store.addItem({ title, columnId: form.dataset.col });
  // O render recria o formulário; devolve o foco para continuar digitando.
  requestAnimationFrame(() => $(form.id === 'col-new' ? '#col-new input' : `.quick-add[data-col="${form.dataset.col}"] input`)?.focus());
});

$('#view').addEventListener('change', (e) => {
  if (e.target.matches('.col-title')) store.renameColumn(e.target.dataset.col, e.target.value);
});
$('#view').addEventListener('keydown', (e) => {
  if (e.target.matches('.col-title') && e.key === 'Enter') e.target.blur();
});

/* Arrastar e soltar (quadro) */

let dragId = null;
const placeholder = document.createElement('div');
placeholder.className = 'drop-ph';

$('#view').addEventListener('dragstart', (e) => {
  const c = e.target.closest?.('.card');
  if (!c || ui.view !== 'board') return e.preventDefault();
  dragId = c.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
  placeholder.style.height = c.offsetHeight + 'px';
  requestAnimationFrame(() => c.classList.add('is-dragging'));
});

$('#view').addEventListener('dragover', (e) => {
  const list = e.target.closest('.col-list');
  if (!list || !dragId) return;
  e.preventDefault();
  const cards = $$('.card:not(.is-dragging)', list);
  const after = cards.find((c) => e.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2);
  if (after) list.insertBefore(placeholder, after);
  else list.appendChild(placeholder);
  $$('.col').forEach((c) => c.classList.toggle('is-over', c.contains(list)));
});

$('#view').addEventListener('drop', (e) => {
  const list = e.target.closest('.col-list');
  if (!list || !dragId) return;
  e.preventDefault();
  const index = [...list.children].filter((n) => n === placeholder || (n.classList.contains('card') && n.dataset.id !== dragId)).indexOf(placeholder);
  const id = dragId;
  dragId = null;
  placeholder.remove();
  store.moveItem(id, list.dataset.col, index);
});

$('#view').addEventListener('dragend', () => {
  dragId = null;
  placeholder.remove();
  $$('.is-dragging, .is-over').forEach((n) => n.classList.remove('is-dragging', 'is-over'));
});

/* ───────────── Editor ───────────── */

const editor = $('#editor');
const form = $('#editor-form');
let draft = null;

function fillColumns(selected) {
  form.columnId.innerHTML = store.getState().columns.map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.title)}</option>`).join('');
}

function renderSwatches() {
  $('#ed-colors').innerHTML = COLORS.map((c) =>
    `<button type="button" class="swatch c-${c} ${draft.color === c ? 'is-on' : ''}" data-color="${c}" aria-label="Cor ${c}" aria-pressed="${draft.color === c}"></button>`
  ).join('');
  editor.className = `sheet c-${draft.color}`;
}

function renderChecklist() {
  $('#ed-checklist').innerHTML = draft.checklist.map((c) => `
    <div class="ed-check ${c.done ? 'is-checked' : ''}" data-check="${c.id}">
      <button type="button" class="cbox" data-cact="toggle" aria-pressed="${c.done}">${c.done ? ICONS.check : ''}</button>
      <input value="${esc(c.text)}" data-cact="text" placeholder="Item da lista" aria-label="Item da lista">
      <button type="button" class="icon-btn sm" data-cact="remove" aria-label="Remover item">${ICONS.x}</button>
    </div>`).join('');
}

function openEditor(id, preset = {}) {
  const s = store.getState();
  const it = id ? store.getItem(id) : null;
  draft = it
    ? structuredClone(it)
    : { id: null, title: '', body: '', color: 'default', checklist: [], labels: [], pinned: false, remindAt: null, alertType: 'importante', repeat: 'none', columnId: s.columns[0].id, ...preset };
  form.title.value = draft.title;
  form.body.value = draft.body;
  form.remindAt.value = draft.remindAt ? toLocalInput(new Date(draft.remindAt)) : '';
  form.repeat.value = draft.repeat;
  form.labels.value = draft.labels.join(', ');
  $$('input[name="alertType"]', form).forEach((r) => (r.checked = r.value === draft.alertType));
  $('#ed-pin').setAttribute('aria-pressed', String(!!draft.pinned));
  $('#ed-delete').hidden = !id;
  $('#ed-heading').textContent = id ? 'Editar' : 'Novo lembrete';
  fillColumns(draft.columnId);
  renderSwatches();
  renderChecklist();
  syncReminderUI();
  editor.showModal();
  requestAnimationFrame(() => (id ? form.body : form.title).focus());
}

function syncReminderUI() {
  $('#ed-reminder').classList.toggle('is-off', !form.remindAt.value);
}

function readForm() {
  return {
    title: form.title.value.trim(),
    body: form.body.value.trim(),
    color: draft.color,
    pinned: draft.pinned,
    checklist: draft.checklist.filter((c) => c.text.trim()),
    labels: form.labels.value.split(',').map((l) => l.trim().replace(/^#/, '')).filter(Boolean),
    remindAt: form.remindAt.value ? new Date(form.remindAt.value).toISOString() : null,
    repeat: form.remindAt.value ? form.repeat.value : 'none',
    alertType: $('input[name="alertType"]:checked', form)?.value || 'importante',
    columnId: form.columnId.value,
  };
}

function saveEditor() {
  const data = readForm();
  if (!draft.id) {
    if (data.title || data.body || data.checklist.length) store.addItem(data);
  } else {
    const prev = store.getItem(draft.id);
    if (!prev) return;
    const { columnId, ...patch } = data;
    // Datas do input têm precisão de minuto; só rearma se a pessoa mudou algo.
    const sameMinute = prev.remindAt && data.remindAt && toLocalInput(new Date(prev.remindAt)) === toLocalInput(new Date(data.remindAt));
    if (sameMinute) patch.remindAt = prev.remindAt;
    if (patch.remindAt !== prev.remindAt) patch.fired = false;
    store.updateItem(draft.id, patch);
    if (columnId !== prev.columnId) store.moveItem(draft.id, columnId);
  }
  editor.close();
}

form.addEventListener('submit', (e) => { e.preventDefault(); saveEditor(); });
form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEditor(); } });
$('#ed-cancel').addEventListener('click', () => editor.close());
editor.addEventListener('click', (e) => { if (e.target === editor) editor.close(); }); // clique fora fecha
$('#ed-delete').addEventListener('click', () => {
  if (draft.id && confirm('Excluir este lembrete?')) {
    alerts.dismiss(draft.id);
    store.deleteItem(draft.id);
    editor.close();
  }
});
$('#ed-pin').addEventListener('click', (e) => {
  draft.pinned = !draft.pinned;
  e.currentTarget.setAttribute('aria-pressed', String(draft.pinned));
});
$('#ed-colors').addEventListener('click', (e) => {
  const b = e.target.closest('[data-color]');
  if (b) { draft.color = b.dataset.color; renderSwatches(); }
});
$('#ed-add-check').addEventListener('click', () => {
  draft.checklist.push({ id: store.uid(), text: '', done: false });
  renderChecklist();
  $('#ed-checklist .ed-check:last-child input').focus();
});
$('#ed-checklist').addEventListener('input', (e) => {
  const row = e.target.closest('[data-check]');
  const c = draft.checklist.find((x) => x.id === row?.dataset.check);
  if (c && e.target.dataset.cact === 'text') c.text = e.target.value;
});
$('#ed-checklist').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset.cact === 'text') { e.preventDefault(); $('#ed-add-check').click(); }
});
$('#ed-checklist').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cact]');
  const row = e.target.closest('[data-check]');
  if (!b || !row) return;
  const idx = draft.checklist.findIndex((x) => x.id === row.dataset.check);
  if (b.dataset.cact === 'toggle') draft.checklist[idx].done = !draft.checklist[idx].done;
  else if (b.dataset.cact === 'remove') draft.checklist.splice(idx, 1);
  else return;
  renderChecklist();
});

$('#ed-presets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-preset]');
  if (!b) return;
  const d = new Date();
  d.setSeconds(0, 0);
  const p = b.dataset.preset;
  if (p === 'clear') form.remindAt.value = '';
  else {
    if (p === '10m') d.setMinutes(d.getMinutes() + 10);
    if (p === '1h') d.setHours(d.getHours() + 1);
    if (p === 'today18') { d.setHours(18, 0); if (d <= new Date()) d.setDate(d.getDate() + 1); }
    if (p === 'tomorrow9') { d.setDate(d.getDate() + 1); d.setHours(9, 0); }
    form.remindAt.value = toLocalInput(d);
  }
  syncReminderUI();
});
form.remindAt.addEventListener('input', syncReminderUI);

$('#ed-preview').addEventListener('click', () => {
  alerts.unlockAudio();
  const type = $('input[name="alertType"]:checked', form)?.value || 'importante';
  alerts.show({ id: 'preview-' + type, title: form.title.value.trim() || 'Teste de lembrete', body: form.body.value.trim() || 'É assim que este lembrete vai aparecer.', alertType: type, preview: true });
});

/* ───────────── Ações dos lembretes ───────────── */

function snooze(id, min) {
  if (!store.getItem(id)) return;
  store.updateItem(id, { remindAt: new Date(Date.now() + (min || 10) * 60000).toISOString(), fired: false, done: false });
  alerts.dismiss(id);
  toastInfo(`Adiado por ${min >= 60 ? min / 60 + ' h' : min + ' min'}`);
}

function markDone(id) {
  if (!store.getItem(id)) return;
  store.setDone(id, true);
  store.updateItem(id, { fired: true });
  alerts.dismiss(id);
}

alerts.init({
  onDone: markDone,
  onSnooze: snooze,
  onOpen: (id) => store.getItem(id) && openEditor(id),
});

function toastInfo(text) {
  const el = $('#snack');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(toastInfo.t);
  toastInfo.t = setTimeout(() => el.classList.remove('on'), 2200);
}

/* ───────────── Agendador ───────────── */

// Só uma aba dispara os alertas (evita alerta duplicado com várias abas abertas).
let isLeader = !('locks' in navigator);
navigator.locks?.request('lembra-scheduler', () => { isLeader = true; return new Promise(() => {}); });

function tick() {
  if (!isLeader) return;
  const now = Date.now();
  const due = store.getState().items.filter((i) => i.remindAt && !i.fired && !i.done && Date.parse(i.remindAt) <= now);
  for (const it of due) {
    const dueAt = Date.parse(it.remindAt);
    const repeating = it.repeat && it.repeat !== 'none';
    store.updateItem(it.id, repeating ? { remindAt: nextOccurrence(it.remindAt, it.repeat, now) } : { fired: true });
    alerts.show({ ...it, dueAt });
  }
}

// Timer num Web Worker: abas em segundo plano são muito menos "estranguladas" assim.
function startTicker(fn) {
  try {
    const src = 'setInterval(() => postMessage(0), 1000)';
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = fn;
  } catch {
    setInterval(fn, 1000);
  }
}
startTicker(tick);

// Atualiza "em 5 min", "Hoje 14:30" etc.
setInterval(() => { if (!document.hidden && !dragId) render(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

/* ───────────── Notificações / ajustes ───────────── */

const settingsDlg = $('#settings');

function updateNotifStatus() {
  const p = alerts.permission();
  const st = store.getState().settings;
  const needs = p === 'default' || p === 'denied' || !alerts.audioReady();
  $('#btn-settings').classList.toggle('needs', needs);
  const banner = $('#banner');
  banner.hidden = !(p === 'default' && !safeGet('lembra:banner-closed'));
  if (!settingsDlg.open) return;
  const label = { granted: 'Ativadas', denied: 'Bloqueadas no navegador', default: 'Ainda não permitidas', unsupported: 'Não suportadas neste navegador' }[p];
  $('#st-perm').textContent = label;
  $('#st-perm').dataset.state = p;
  $('#st-enable').hidden = p !== 'default';
  $('#st-denied').hidden = p !== 'denied';
  $('#st-audio').textContent = alerts.audioReady() ? 'Liberado' : 'Clique em qualquer lugar para liberar';
  $('#st-sound').checked = st.sound;
  $('#st-system').checked = st.system;
  $('#st-volume').value = Math.round(st.volume * 100);
}

async function enableNotifications() {
  alerts.unlockAudio();
  const p = await alerts.requestPermission();
  if (p === 'granted') {
    toastInfo('Notificações ativadas ✓');
    alerts.show({ id: 'preview-welcome', title: 'Tudo pronto!', body: 'Os lembretes vão aparecer assim, mesmo com o navegador minimizado.', alertType: 'suave' });
  }
  updateNotifStatus();
}

$('#btn-settings').addEventListener('click', () => { settingsDlg.showModal(); updateNotifStatus(); });
$('#st-close').addEventListener('click', () => settingsDlg.close());
settingsDlg.addEventListener('click', (e) => { if (e.target === settingsDlg) settingsDlg.close(); });
$('#st-enable').addEventListener('click', enableNotifications);
$('#banner-enable').addEventListener('click', enableNotifications);
$('#banner-close').addEventListener('click', () => { safeSet('lembra:banner-closed', '1'); updateNotifStatus(); });
$('#st-sound').addEventListener('change', (e) => store.updateSettings({ sound: e.target.checked }));
$('#st-system').addEventListener('change', (e) => store.updateSettings({ system: e.target.checked }));
$('#st-volume').addEventListener('change', (e) => store.updateSettings({ volume: Number(e.target.value) / 100 }));
$$('[data-test]').forEach((b) =>
  b.addEventListener('click', () => {
    alerts.unlockAudio();
    const type = b.dataset.test;
    settingsDlg.close();
    alerts.show({ id: 'preview-' + type, title: { alarme: 'Reunião com o cliente AGORA', importante: 'Pagar o boleto hoje', suave: 'Hora de beber água' }[type], body: 'Este é um teste do alerta “' + alerts.TYPES[type].label + '”.', alertType: type, preview: true });
  })
);
$('#st-test-delay').addEventListener('click', () => {
  alerts.unlockAudio();
  const it = store.addItem({ title: 'Teste em 10 segundos', body: 'Minimize o navegador para ver a notificação do sistema.', alertType: 'alarme', remindAt: new Date(Date.now() + 10000).toISOString(), color: 'red', labels: ['teste'] });
  settingsDlg.close();
  toastInfo('Alarme de teste em 10 s — pode minimizar a janela');
  return it;
});

$('#st-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(store.getState(), null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `lembra-backup-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
});
$('#st-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (confirm('Substituir todos os dados atuais pelo backup?')) { store.replaceAll(data); toastInfo('Backup importado'); }
  } catch { alert('Arquivo inválido.'); }
  e.target.value = '';
});

store.subscribe((s) => alerts.configure(s.settings));
alerts.configure(store.getState().settings);

// Primeiro clique/tecla libera o áudio (regra dos navegadores).
const unlock = () => { alerts.unlockAudio(); updateNotifStatus(); };
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('keydown', unlock, { capture: true });

/* ───────────── Atalhos ───────────── */

$('#btn-new').addEventListener('click', () => openEditor(null));
document.addEventListener('keydown', (e) => {
  if (editor.open || settingsDlg.open || document.body.classList.contains('has-alert')) return;
  if (e.target.matches('input, textarea, select, [contenteditable]')) return;
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openEditor(null); }
  if (e.key === '/') { e.preventDefault(); $('#search').focus(); }
});

/* ───────────── Service worker (notificações com botões) ───────────── */

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW não registrado', err));
  navigator.serviceWorker.addEventListener('message', (e) => handleNotifAction(e.data));
}

function handleNotifAction(msg) {
  if (!msg || msg.type !== 'notif-action' || !msg.id) return;
  if (msg.action === 'done') markDone(msg.id);
  else if (msg.action === 'snooze') snooze(msg.id, 10);
  // 'open': a janela já foi focada e o alerta grande está na tela.
}

// Quando a notificação abre uma janela nova, a ação vem na URL.
const params = new URLSearchParams(location.search);
if (params.get('notif')) {
  handleNotifAction({ type: 'notif-action', id: params.get('notif'), action: params.get('action') });
  history.replaceState(null, '', location.pathname);
}

// Pede ao navegador para não apagar os dados sozinho quando faltar espaço.
navigator.storage?.persist?.().catch(() => {});

render();
tick();
