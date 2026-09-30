// Sistema de alertas: 3 estilos bem diferentes, cada um com visual, som e
// comportamento próprios, mais notificação do sistema operacional.
//
//  alarme      → tela cheia vermelha, sirene em loop até você agir
//  importante  → janela grande no centro, carrilhão repetido
//  suave       → aviso grande no canto, som leve uma vez, some sozinho

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const TYPES = {
  alarme: { label: 'Alarme', emoji: '🚨', vibrate: [400, 150, 400, 150, 400, 150, 800] },
  importante: { label: 'Importante', emoji: '🔔', vibrate: [250, 120, 250, 120, 250] },
  suave: { label: 'Suave', emoji: '💬', vibrate: [120] },
};

const ICON_BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

let settings = { sound: true, volume: 0.8, system: true };
let handlers = { onDone() {}, onSnooze() {}, onOpen() {} };

export function init(h) { handlers = { ...handlers, ...h }; }
export function configure(s) {
  settings = { ...settings, ...s };
  if (master) master.gain.value = settings.volume;
}

/* ───────────── Som (Web Audio, sem arquivos) ───────────── */

let ctx = null;
let master = null;

// Navegadores só liberam áudio depois de um clique/tecla do usuário.
export function unlockAudio() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = settings.volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch {}
}
export const audioReady = () => !!ctx && ctx.state === 'running';

function note(freq, at, dur, { type = 'sine', gain = 0.25, glideTo } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master);
  o.start(at);
  o.stop(at + dur + 0.05);
}

const PATTERNS = {
  alarme: {
    every: 1500,
    play(t) {
      for (let i = 0; i < 6; i++) note(i % 2 ? 740 : 988, t + i * 0.14, 0.12, { type: 'square', gain: 0.2 });
      note(1320, t + 0.9, 0.45, { type: 'sawtooth', gain: 0.1, glideTo: 660 });
    },
  },
  importante: {
    every: 3500,
    play(t) {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, t + i * 0.15, 1.2, { type: 'triangle', gain: 0.3 }));
      note(1046.5, t + 0.9, 1.4, { gain: 0.12 });
    },
  },
  suave: {
    every: 0,
    play(t) {
      note(880, t, 1.4, { gain: 0.2 });
      note(1318.5, t + 0.22, 1.8, { gain: 0.16 });
    },
  },
};

let soundLoop = null;
let soundCap = null;

function playOnce(type) {
  if (!settings.sound) return;
  unlockAudio();
  if (!ctx) return;
  PATTERNS[type].play(ctx.currentTime + 0.05);
}

function startSound(type) {
  stopSound();
  playOnce(type);
  const every = PATTERNS[type].every;
  if (!every) return;
  soundLoop = setInterval(() => playOnce(type), every);
  // Evita tocar para sempre se a pessoa estiver longe do computador.
  soundCap = setTimeout(stopSound, 10 * 60 * 1000);
}

function stopSound() {
  clearInterval(soundLoop);
  clearTimeout(soundCap);
  soundLoop = soundCap = null;
}

/* ───────────── Título da aba piscando ───────────── */

const baseTitle = document.title;
let flashTimer = null;
function startTitleFlash(text) {
  stopTitleFlash();
  let on = false;
  flashTimer = setInterval(() => {
    on = !on;
    document.title = on ? `🔔 ${text}` : '⏰ LEMBRETE!';
  }, 900);
}
function stopTitleFlash() {
  clearInterval(flashTimer);
  flashTimer = null;
  document.title = baseTitle;
}

/* ───────────── Notificação do sistema (Windows/macOS/Android) ───────────── */

export const permission = () => ('Notification' in window ? Notification.permission : 'unsupported');

export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported';
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

const fmtTime = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

async function systemNotify(item) {
  if (!settings.system || permission() !== 'granted') return;
  const t = TYPES[item.alertType] || TYPES.importante;
  const title = `${t.emoji} ${item.title || 'Lembrete'}`;
  const opts = {
    body: (item.body ? item.body.slice(0, 180) + '\n' : '') + `${t.label} · ${fmtTime(item.dueAt)}`,
    tag: 'lembra-' + item.id,
    renotify: true,
    requireInteraction: item.alertType !== 'suave', // fica na tela até você clicar
    silent: false,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    vibrate: t.vibrate,
    data: { id: item.id },
    actions: [
      { action: 'done', title: '✓ Concluir' },
      { action: 'snooze', title: '⏰ Adiar 10 min' },
    ],
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return void (await reg.showNotification(title, opts));
  } catch {}
  try {
    const { actions, ...plain } = opts;
    const n = new Notification(title, plain);
    n.onclick = () => { window.focus(); n.close(); };
  } catch {}
}

async function closeSystemNotification(id) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const list = (await reg?.getNotifications({ tag: 'lembra-' + id })) || [];
    list.forEach((n) => n.close());
  } catch {}
}

/* ───────────── Fila de alertas na tela ───────────── */

const queue = [];
let current = null;
let clockTimer = null;

export function show(item) {
  const type = TYPES[item.alertType] ? item.alertType : 'importante';
  item = { ...item, alertType: type, dueAt: item.dueAt ?? Date.now() };
  navigator.vibrate?.(TYPES[type].vibrate);
  systemNotify(item);

  if (type === 'suave') return toast(item);
  if (current?.id === item.id || queue.some((q) => q.id === item.id)) return;
  queue.push(item);
  if (!current) next();
  else renderOverlay(); // atualiza o contador "+N na fila"
}

export function dismiss(id) {
  const qi = queue.findIndex((q) => q.id === id);
  if (qi >= 0) queue.splice(qi, 1);
  document.querySelectorAll(`.toast[data-id="${CSS.escape(id)}"]`).forEach(closeToast);
  closeSystemNotification(id);
  if (current?.id === id) next();
}

function next() {
  current = queue.shift() || null;
  renderOverlay();
}

function lateText(item) {
  const late = Date.now() - item.dueAt;
  if (late < 90 * 1000) return '';
  const min = Math.round(late / 60000);
  return min < 60 ? `atrasado ${min} min` : `atrasado ${Math.round(min / 60)} h`;
}

function actionsTpl() {
  return `
    <div class="al-actions">
      <button class="pill pill-xl" data-act="done" autofocus>✓ Concluir</button>
      <div class="al-snooze" role="group" aria-label="Adiar">
        <span>Adiar</span>
        <button data-act="snooze" data-min="5">5 min</button>
        <button data-act="snooze" data-min="10">10 min</button>
        <button data-act="snooze" data-min="30">30 min</button>
        <button data-act="snooze" data-min="60">1 h</button>
      </div>
      <button class="al-dismiss" data-act="dismiss">Dispensar</button>
    </div>`;
}

function renderOverlay() {
  const layer = document.getElementById('alert-layer');
  clearInterval(clockTimer);
  if (!current) {
    layer.className = '';
    layer.innerHTML = '';
    document.body.classList.remove('has-alert');
    stopSound();
    stopTitleFlash();
    return;
  }
  const it = current;
  const t = TYPES[it.alertType];
  const late = lateText(it);
  const more = queue.length ? `<div class="al-more">+${queue.length} ${queue.length > 1 ? 'lembretes' : 'lembrete'} na fila</div>` : '';
  const kicker = `<div class="al-kicker"><span class="al-bell">${ICON_BELL}</span>${t.label.toUpperCase()} · ${fmtTime(it.dueAt)}${late ? ` · <em>${late}</em>` : ''}</div>`;
  const body = it.body ? `<p class="al-body">${esc(it.body)}</p>` : '';

  const wasSame = layer.dataset.id === it.id;
  layer.dataset.id = it.id;
  layer.className = `on t-${it.alertType}`;
  layer.innerHTML =
    it.alertType === 'alarme'
      ? `<div class="al al-alarme" role="alertdialog" aria-modal="true" aria-labelledby="al-title">
           <div class="al-pulse" aria-hidden="true"></div>
           <div class="al-inner">
             ${kicker}
             <h1 id="al-title" class="al-title">${esc(it.title || 'Lembrete')}</h1>
             ${body}
             <div class="al-clock" data-clock></div>
             ${actionsTpl()}
             ${more}
           </div>
         </div>`
      : `<div class="al al-importante" role="alertdialog" aria-modal="true" aria-labelledby="al-title">
           <div class="al-card">
             <div class="al-ring" aria-hidden="true">${ICON_BELL}</div>
             ${kicker}
             <h1 id="al-title" class="al-title">${esc(it.title || 'Lembrete')}</h1>
             ${body}
             ${actionsTpl()}
             ${more}
           </div>
         </div>`;

  document.body.classList.add('has-alert');
  const clock = layer.querySelector('[data-clock]');
  if (clock) {
    const tick = () => (clock.textContent = new Date().toLocaleTimeString('pt-BR'));
    tick();
    clockTimer = setInterval(tick, 1000);
  }
  layer.querySelector('[data-act="done"]')?.focus();
  if (!wasSame) {
    startSound(it.alertType);
    startTitleFlash(it.title || 'Lembrete');
  }
}

function act(item, action, min) {
  if (!item) return;
  closeSystemNotification(item.id);
  if (action === 'done') handlers.onDone(item.id);
  if (action === 'snooze') handlers.onSnooze(item.id, min);
  if (action === 'open') handlers.onOpen(item.id);
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('#alert-layer [data-act]');
  if (!btn || !current) return;
  const item = current;
  current = null; // evita que um dismiss() disparado pelo handler pule o próximo da fila
  act(item, btn.dataset.act, Number(btn.dataset.min));
  next();
});

document.addEventListener('keydown', (e) => {
  if (!current || e.key !== 'Escape') return;
  e.preventDefault();
  next(); // Esc = dispensar
});

/* ───────────── Toasts (suave) ───────────── */

function toast(item) {
  playOnce('suave');
  const host = document.getElementById('toasts');
  host.querySelectorAll(`.toast[data-id="${CSS.escape(item.id)}"]`).forEach((n) => n.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.dataset.id = item.id;
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <div class="toast-icon">${ICON_BELL}</div>
    <div class="toast-main">
      <div class="toast-kicker">Lembrete · ${fmtTime(item.dueAt)}</div>
      <b class="toast-title">${esc(item.title || 'Lembrete')}</b>
      ${item.body ? `<p>${esc(item.body)}</p>` : ''}
      <div class="toast-acts">
        <button data-act="done">✓ Concluir</button>
        <button data-act="snooze" data-min="10">+10 min</button>
      </div>
    </div>
    <button class="toast-x" data-act="dismiss" aria-label="Fechar">×</button>
    <div class="toast-bar"></div>`;
  host.prepend(el);
  const timer = setTimeout(() => closeToast(el), 45000);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    clearTimeout(timer);
    act(item, b.dataset.act, Number(b.dataset.min));
    closeToast(el);
  });
}

function closeToast(el) {
  el.classList.add('is-leaving');
  setTimeout(() => el.remove(), 300);
}
