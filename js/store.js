// Camada de dados. Hoje salva no localStorage; a API (getState/addItem/updateItem/...)
// foi pensada para ser trocada por um adaptador Supabase depois sem mexer na UI.

const KEY = 'lembra:v1';
const DEFAULT_SETTINGS = { sound: true, volume: 0.8, system: true };
const listeners = new Set();

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

const defaultColumns = () => [
  { id: 'todo', title: 'A fazer' },
  { id: 'doing', title: 'Fazendo' },
  { id: 'done', title: 'Feito' },
];

function normItem(i) {
  return {
    title: '', body: '', color: 'default', checklist: [], labels: [], pinned: false,
    remindAt: null, alertType: 'importante', repeat: 'none', fired: false, done: false,
    columnId: null, order: 0, createdAt: Date.now(), updatedAt: Date.now(),
    ...i,
    id: i.id || uid(),
  };
}

function normalize(s) {
  return {
    columns: Array.isArray(s.columns) && s.columns.length ? s.columns : defaultColumns(),
    items: Array.isArray(s.items) ? s.items.map(normItem) : [],
    settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) },
  };
}

function seed() {
  const now = new Date();
  const future = (h, m, addDays = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + addDays);
    d.setHours(h, m, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return d.toISOString();
  };
  const check = (arr) => arr.map(([text, done]) => ({ id: uid(), text, done: !!done }));
  const raw = [
    { title: 'Bem-vindo ao Lembra 👋', body: 'Crie notas e cartões, arraste entre as listas e defina lembretes.\nClique no sino lá em cima para ativar as notificações e testar os 3 tipos de alerta.', color: 'teal', columnId: 'todo', pinned: true, labels: ['dica'] },
    { title: 'Pagar conta de luz', body: 'Vence dia 10. Código de barras no e-mail.', color: 'yellow', columnId: 'todo', remindAt: future(9, 0, 1), alertType: 'alarme', labels: ['casa', 'contas'] },
    { title: 'Mercado', color: 'green', columnId: 'todo', checklist: check([['Café', 1], ['Pão'], ['Frutas'], ['Detergente']]), labels: ['casa'] },
    { title: 'Revisar proposta do cliente', body: 'Enviar até sexta com o orçamento atualizado.', color: 'blue', columnId: 'doing', remindAt: future(18, 0), alertType: 'importante', labels: ['trabalho'] },
    { title: 'Beber água', color: 'default', columnId: 'doing', remindAt: future((now.getHours() + 2) % 24, 0), alertType: 'suave', repeat: 'daily', labels: ['saúde'] },
    { title: 'Organizar a mesa', columnId: 'done', done: true },
  ];
  const order = {};
  const items = raw.map((r, i) => normItem({ ...r, order: (order[r.columnId] = (order[r.columnId] ?? -1) + 1), createdAt: Date.now() - i * 1000 }));
  return { columns: defaultColumns(), items, settings: { ...DEFAULT_SETTINGS } };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { console.warn('Dados inválidos, recomeçando', e); }
  return seed();
}

let state = load();
try { if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, JSON.stringify(state)); } catch {}

function commit(next) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { console.error('Falha ao salvar', e); }
  listeners.forEach((fn) => fn(state));
}

// Sincroniza entre abas abertas.
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  try { state = normalize(JSON.parse(e.newValue)); listeners.forEach((fn) => fn(state)); } catch {}
});

export const getState = () => state;
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const getItem = (id) => state.items.find((i) => i.id === id);
export const doneColumnId = () => state.columns.find((c) => c.id === 'done')?.id ?? null;

const colExists = (id) => state.columns.some((c) => c.id === id);
const nextOrder = (colId) => {
  const orders = state.items.filter((i) => i.columnId === colId).map((i) => i.order);
  return orders.length ? Math.max(...orders) + 1 : 0;
};

export function addItem(data) {
  const columnId = colExists(data.columnId) ? data.columnId : state.columns[0].id;
  const item = normItem({ ...data, id: null, columnId, order: nextOrder(columnId), done: columnId === doneColumnId(), createdAt: Date.now(), updatedAt: Date.now() });
  commit({ ...state, items: [...state.items, item] });
  return item;
}

export function updateItem(id, patch) {
  commit({ ...state, items: state.items.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: Date.now() } : i)) });
}

export function deleteItem(id) {
  commit({ ...state, items: state.items.filter((i) => i.id !== id) });
}

export function moveItem(id, colId, index = Infinity) {
  const item = getItem(id);
  if (!item || !colExists(colId)) return;
  const siblings = state.items.filter((i) => i.columnId === colId && i.id !== id).sort((a, b) => a.order - b.order);
  siblings.splice(Math.max(0, Math.min(index, siblings.length)), 0, item);
  const orderOf = new Map(siblings.map((s, i) => [s.id, i]));
  const doneCol = doneColumnId();
  commit({
    ...state,
    items: state.items.map((i) => {
      if (i.id === id) return { ...i, columnId: colId, order: orderOf.get(id), done: doneCol ? colId === doneCol : i.done, updatedAt: Date.now() };
      return orderOf.has(i.id) ? { ...i, order: orderOf.get(i.id) } : i;
    }),
  });
}

export function setDone(id, done) {
  const doneCol = doneColumnId();
  if (!doneCol) return updateItem(id, { done });
  if (done) return moveItem(id, doneCol, 0);
  const back = state.columns.find((c) => c.id !== doneCol);
  moveItem(id, back.id);
}

export function addColumn(title) {
  const col = { id: uid(), title: title.trim() || 'Nova lista' };
  commit({ ...state, columns: [...state.columns, col] });
}

export function renameColumn(id, title) {
  commit({ ...state, columns: state.columns.map((c) => (c.id === id ? { ...c, title: title.trim() || c.title } : c)) });
}

export function deleteColumn(id) {
  if (state.columns.length <= 1) return;
  const columns = state.columns.filter((c) => c.id !== id);
  const target = columns[0].id;
  let order = nextOrder(target);
  commit({ ...state, columns, items: state.items.map((i) => (i.columnId === id ? { ...i, columnId: target, order: order++ } : i)) });
}

export function updateSettings(patch) {
  commit({ ...state, settings: { ...state.settings, ...patch } });
}

export function replaceAll(data) {
  commit(normalize(data));
}
