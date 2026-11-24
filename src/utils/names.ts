const ADJECTIVES = [
  'Blue', 'Swift', 'Golden', 'Silent', 'Cosmic', 'Lucky', 'Neon', 'Crimson',
  'Sunny', 'Misty', 'Electric', 'Velvet', 'Brave', 'Mellow', 'Wild', 'Frosty',
  'Jolly', 'Mighty', 'Coral', 'Amber', 'Turbo', 'Pixel', 'Lunar', 'Solar',
];

const ANIMALS = [
  'Falcon', 'Otter', 'Panda', 'Fox', 'Tiger', 'Koala', 'Lynx', 'Dolphin',
  'Raven', 'Gecko', 'Bison', 'Heron', 'Wolf', 'Puffin', 'Jaguar', 'Moose',
  'Owl', 'Orca', 'Llama', 'Badger', 'Hawk', 'Lemur', 'Narwhal', 'Yak',
];

// No 0/O, 1/I/L to keep codes easy to read aloud and type.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;
export const MAX_NAME_LENGTH = 24;

function randomInt(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

export function randomName(): string {
  return `${ADJECTIVES[randomInt(ADJECTIVES.length)]} ${ANIMALS[randomInt(ANIMALS.length)]}`;
}

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCode(code: string): boolean {
  return new RegExp(`^[A-Z0-9]{${ROOM_CODE_LENGTH}}$`).test(code);
}

export function sanitizeName(input: unknown): string {
  if (typeof input !== 'string') return 'Guest';
  const clean = input.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME_LENGTH);
  return clean || 'Guest';
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** Stable, pleasant color per peer id. */
export function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 72% 68%)`;
}

export function genId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

const NAME_KEY = 'photocrew.displayName';
/** Key used before the app was renamed; read so people keep their saved name. */
const LEGACY_NAME_KEY = 'snappool.displayName';

export function loadDisplayName(): string | null {
  try {
    const v = localStorage.getItem(NAME_KEY) ?? localStorage.getItem(LEGACY_NAME_KEY);
    return v ? sanitizeName(v) : null;
  } catch {
    return null;
  }
}

export function saveDisplayName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, sanitizeName(name));
  } catch {
    /* storage unavailable (private mode) – name just won't persist */
  }
}
