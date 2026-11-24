import '@fontsource-variable/host-grotesk';
import '@fontsource-variable/newsreader/opsz-italic.css';
import { contact } from '../site';

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const wide = matchMedia('(min-width: 900px)');
const images = import.meta.glob<string>('./img/*.webp', { eager: true, query: '?url', import: 'default' });
const clamp = (n: number) => Math.min(1, Math.max(0, n));

// ── Film ────────────────────────────────────────────────────────────────
const film = $<HTMLDivElement>('#film');
const loop = $<HTMLVideoElement>('#loop');
const toggle = $<HTMLButtonElement>('#toggle');
const watch = $<HTMLButtonElement>('#watch');
const player = $<HTMLDialogElement>('#player');
const full = $<HTMLVideoElement>('#full');
let wantsPlay = !calm.matches;

const syncLoop = () => {
  toggle.textContent = wantsPlay ? 'Pause' : 'Play';
  if (wantsPlay && !player.open) void loop.play().catch(() => {});
  else loop.pause();
};
toggle.addEventListener('click', () => {
  wantsPlay = !wantsPlay;
  syncLoop();
});
film.addEventListener('click', (e) => {
  if (e.target === toggle) return;
  player.showModal();
  syncLoop();
  full.currentTime = 0;
  void full.play().catch(() => {});
});
player.addEventListener('close', () => {
  full.pause();
  syncLoop();
});
player.addEventListener('click', (e) => e.target === player && player.close());
syncLoop();

// The "Watch demo" button trails the cursor over the film.
if (matchMedia('(hover: hover) and (pointer: fine)').matches && !calm.matches) {
  film.addEventListener('pointermove', (e) => {
    const r = film.getBoundingClientRect();
    const k = r.width / film.offsetWidth; // the film is scaled while scrolling
    watch.style.translate = `${(e.clientX - r.left - r.width / 2) / k}px ${(e.clientY - r.top - r.height / 2) / k}px`;
  });
  film.addEventListener('pointerleave', () => (watch.style.translate = '0 0'));
}

// ── Photo-filled letters ────────────────────────────────────────────────
const letters = [...document.querySelectorAll<HTMLElement>('.o')].map((o) =>
  o.dataset.o!.split(',').map((name) => {
    const img = document.createElement('img');
    img.src = images[`./img/sq-${name}.webp`];
    img.alt = '';
    o.append(img);
    return img;
  }),
);

// ── Expanding panels ────────────────────────────────────────────────────
const panels = [...document.querySelectorAll<HTMLElement>('.panel')];
const openPanel = (target: HTMLElement) =>
  panels.forEach((p) => {
    p.classList.toggle('open', p === target);
    p.querySelector('button')!.setAttribute('aria-expanded', String(p === target));
  });
panels.forEach((p) => {
  p.addEventListener('click', () => openPanel(p));
  p.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && wide.matches && openPanel(p));
});

// ── Device wall ─────────────────────────────────────────────────────────
const names = ['iPhone', 'Mac', 'Windows', 'Android'];
const rows = Array.from({ length: 5 }, (_, r) => {
  const row = document.createElement('div');
  for (let i = 0; i < 16; i++) {
    const s = document.createElement('span');
    s.textContent = names[(i + r) % names.length];
    row.append(s);
  }
  $('#rows').append(row);
  return row;
});

// ── Scroll-driven motion ────────────────────────────────────────────────
const how = $<HTMLElement>('.how');
const track = $<HTMLDivElement>('#track');
const space = $<HTMLElement>('.film-space');
const cloud = $<HTMLElement>('.cloud');
const devices = $<HTMLElement>('.devices');
let travel = 0;

function measure() {
  const pinned = wide.matches && !calm.matches;
  how.classList.toggle('pinned', pinned);
  track.style.transform = '';
  travel = pinned ? Math.max(0, track.scrollWidth - innerWidth) : 0;
  how.style.height = pinned ? `${innerHeight + travel}px` : '';
  // Pinned, the page scroll moves it; otherwise it is its own scroller and needs keyboard focus.
  if (pinned) track.removeAttribute('tabindex');
  else track.tabIndex = 0;
  update();
}

let queued = false;
function update() {
  queued = false;
  const vh = innerHeight;
  if (!calm.matches) {
    const f = space.getBoundingClientRect();
    film.style.setProperty('--grow', String(clamp((vh * 0.62 - f.top) / (vh * 0.62))));
    const d = devices.getBoundingClientRect();
    const shift = (vh - d.top) / (vh + d.height);
    rows.forEach((row, i) => (row.style.transform = `translateX(${i % 2 ? -36 + i * 1.7 + shift * 22 : -6 - i * 2.3 - shift * 22}%)`));
  }
  const c = cloud.getBoundingClientRect();
  const step = clamp((vh * 0.8 - c.top) / (vh * 1.1));
  letters.forEach((set, l) => {
    const on = Math.min(set.length - 1, Math.floor(clamp(step + l * 0.12) * set.length));
    set.forEach((img, i) => img.classList.toggle('on', i === on));
  });
  if (travel) track.style.transform = `translateX(${-clamp(-how.getBoundingClientRect().top / travel) * travel}px)`;
}
addEventListener('scroll', () => {
  if (!queued) requestAnimationFrame(update);
  queued = true;
}, { passive: true });
addEventListener('resize', measure);
addEventListener('load', measure);
wide.addEventListener('change', measure);
void document.fonts.ready.then(measure);
measure();

// ── Join code and contact ───────────────────────────────────────────────
const code = $<HTMLInputElement>('#code');
code.addEventListener('input', () => {
  code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

const entries: [string, string][] = [];
if (contact.email) entries.push([contact.email, `mailto:${contact.email}`]);
if (contact.phone) entries.push([contact.phone, `tel:${contact.phone.replace(/[^+\d]/g, '')}`]);
for (const [label, url] of [['Instagram', contact.instagram], ['LinkedIn', contact.linkedin], ['GitHub', contact.github], ['X', contact.x]]) {
  if (url.startsWith('https://')) entries.push([label, url]);
}
if (entries.length) {
  $('#contact-list').replaceChildren(
    ...entries.map(([label, href]) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = href;
      a.textContent = label;
      li.append(a);
      return li;
    }),
  );
}
