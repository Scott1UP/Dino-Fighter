/** The controls screen: what to press, for whichever of the keyboard or the touch buttons is in use. */
import { button, panel, type Rect, text, W } from './draw';
import { ARROW, ICONS, KEYMAP, type Pad, usingTouch } from './input';

/** The button that closes the screen, and the keys that do the same. */
export const BACK: Rect = { x: W / 2 - 60, y: 236, w: 120, h: 22 };
export const BACK_KEYS = ['Escape', 'Enter', 'Space', 'KeyC'];

const GOLD = '#ffd23a';
const P1 = '#7fd4ff';
const P2 = '#ff8a7c';

/** The touch buttons' own pictures, drawn at their natural 24 pixels. */
const picture = (svg: string): HTMLImageElement => {
  const img = new Image();
  const sized = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" ');
  img.src = `data:image/svg+xml,${encodeURIComponent(sized)}`;
  return img;
};

type Action = 'move' | 'jump' | 'head' | 'tail' | 'special';
/** One column each, in the colours of the touch buttons. */
const ACTIONS: { id: Action; label: string; color: string; pads: (keyof Pad)[]; icons: HTMLImageElement[] }[] = [
  { id: 'move', label: 'MOVE', color: '#3a3f55', pads: ['left', 'right'], icons: [picture(ARROW(-1)), picture(ARROW(1))] },
  { id: 'jump', label: 'JUMP', color: '#2f9e44', pads: ['jump'], icons: [picture(ICONS.jump)] },
  { id: 'head', label: 'HEAD', color: '#e03131', pads: ['head'], icons: [picture(ICONS.head)] },
  { id: 'tail', label: 'TAIL', color: '#1c7ed6', pads: ['tail'], icons: [picture(ICONS.tail)] },
  { id: 'special', label: 'SPECIAL', color: '#f0a800', pads: ['special'], icons: [picture(ICONS.special)] },
];
const colorOf = (id: Action): string => ACTIONS.find((a) => a.id === id)!.color;

/** Each player's keys for each column, straight from the key map. */
const KEYS = ([0, 1] as const).map((player) =>
  ACTIONS.map((a) =>
    a.pads.flatMap((k) =>
      Object.entries(KEYMAP)
        .filter(([, [p, key]]) => p === player && key === k)
        .map(([code]) => code),
    ),
  ),
);

/** A round button, or a long one if it is wider than it is tall, with a black edge. */
function pill(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, color: string): void {
  const half = (w - h) / 2;
  for (const [grow, c] of [
    [2, '#000'],
    [0, color],
  ] as const) {
    g.fillStyle = c;
    g.beginPath();
    g.arc(cx - half, cy, h / 2 + grow, Math.PI / 2, Math.PI * 1.5);
    g.arc(cx + half, cy, h / 2 + grow, -Math.PI / 2, Math.PI / 2);
    g.fill();
  }
}

/** The pictures and names along the top of a listing. On touch they sit on their buttons. */
function header(g: CanvasRenderingContext2D, cols: number[], y: number, buttons: boolean): void {
  ACTIONS.forEach((a, i) => {
    const cx = cols[i];
    const n = a.icons.length;
    const gap = buttons ? 6 : 0;
    if (buttons) pill(g, cx, y + 12, n > 1 ? 68 : 36, 36, a.color);
    a.icons.forEach((img, j) => {
      const x = Math.round(cx - (n * 24 + (n - 1) * gap) / 2 + j * (24 + gap));
      if (img.complete && img.naturalWidth) g.drawImage(img, x, y);
    });
    text(g, a.label, cx, y + (buttons ? 34 : 26), { align: 'center' });
  });
}

const KEY = 16;
function keycap(g: CanvasRenderingContext2D, x: number, y: number, code: string): void {
  panel(g, { x, y, w: KEY, h: KEY }, '#f0f0ff', '#8890a8');
  g.fillStyle = '#000a78';
  if (code.startsWith('Arrow')) {
    // A small triangle, four pixels deep.
    for (let i = 0; i < 4; i++) {
      const len = 2 + 2 * i;
      if (code === 'ArrowUp') g.fillRect(x + 8 - len / 2, y + 6 + i, len, 1);
      else g.fillRect(code === 'ArrowLeft' ? x + 6 + i : x + 9 - i, y + 8 - len / 2, 1, len);
    }
  } else {
    const name = code === 'Semicolon' ? ';' : code.replace('Key', '');
    text(g, name, x + KEY / 2 + 1, y + 4, { align: 'center', color: '#000a78', shadow: null });
  }
}

function keyRow(g: CanvasRenderingContext2D, cols: number[], y: number, player: 0 | 1, label: string, color: string): void {
  text(g, label, 20, y + 4, { color });
  KEYS[player].forEach((codes, i) => {
    const width = codes.length * KEY + (codes.length - 1) * 4;
    codes.forEach((code, j) => keycap(g, Math.round(cols[i] - width / 2) + j * (KEY + 4), y, code));
  });
}

function rule(g: CanvasRenderingContext2D, y: number): void {
  g.fillStyle = '#2a308a';
  g.fillRect(20, y, W - 40, 2);
}

function keyboard(g: CanvasRenderingContext2D): void {
  const cols = [150, 228, 294, 360, 426];
  header(g, cols, 34, false);
  // On their own, a player may use either set of keys.
  keyRow(g, cols, 76, 0, '1 PLAYER', GOLD);
  keyRow(g, cols, 96, 1, 'OR', '#9aa4ff');
  rule(g, 120);
  text(g, '2 PLAYERS', 20, 128, { color: GOLD });
  keyRow(g, cols, 142, 0, 'PLAYER 1', P1);
  keyRow(g, cols, 162, 1, 'PLAYER 2', P2);
}

/** A small picture of one player's touch buttons, as they sit in their corner of the screen. */
function miniPad(g: CanvasRenderingContext2D, x: number, y: number, mirrored: boolean): void {
  // The move control is in the outer corner, the four buttons towards the middle.
  const at = (dx: number) => (mirrored ? x - dx : x + dx);
  pill(g, at(16), y + 16, 32, 14, colorOf('move'));
  const [near, far] = mirrored ? [at(60), at(44)] : [at(44), at(60)];
  pill(g, near, y, 14, 14, colorOf('special'));
  pill(g, far, y, 14, 14, colorOf('jump'));
  pill(g, near, y + 16, 14, 14, colorOf('tail'));
  pill(g, far, y + 16, 14, 14, colorOf('head'));
}

function touch(g: CanvasRenderingContext2D): void {
  text(g, '1 PLAYER', 20, 34, { color: GOLD });
  header(g, [76, 168, 248, 328, 408], 52, true);
  rule(g, 100);
  text(g, '2 PLAYERS', 20, 108, { color: GOLD });
  text(g, 'PLAYER 1', 28, 124, { color: P1 });
  miniPad(g, 28, 144, false);
  text(g, 'PLAYER 2', W - 28, 124, { color: P2, align: 'right' });
  miniPad(g, W - 28, 144, true);
  text(g, 'THE SAME BUTTONS,', W / 2, 138, { align: 'center' });
  text(g, 'ONE SET EACH', W / 2, 150, { align: 'center' });
}

export function drawControls(g: CanvasRenderingContext2D): void {
  const onTouch = usingTouch();
  panel(g, { x: 6, y: 4, w: W - 12, h: 262 }, '#0a0a2a', '#9aa4ff');
  text(g, 'CONTROLS', W / 2, 12, { size: 16, align: 'center', color: GOLD });
  if (onTouch) touch(g);
  else keyboard(g);
  rule(g, 182);
  [
    'BLOCK: WALK AWAY FROM AN ATTACK',
    'SPECIAL: WHEN YOUR POWER BAR IS FULL',
    onTouch ? 'PAUSE: THE BUTTON AT THE TOP' : 'PAUSE: ESC OR P',
  ].forEach((tip, i) => text(g, tip, W / 2, 191 + i * 12, { align: 'center' }));
  button(g, BACK, 'BACK', true);
}
