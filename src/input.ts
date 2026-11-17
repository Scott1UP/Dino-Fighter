/** What each player is pressing: keyboard and the on-screen touch buttons, merged. */

export interface Pad {
  left: boolean;
  right: boolean;
  jump: boolean;
  head: boolean;
  tail: boolean;
  /** The signature move. */
  special: boolean;
}
type Key = keyof Pad;

export const emptyPad = (): Pad => ({
  left: false,
  right: false,
  jump: false,
  head: false,
  tail: false,
  special: false,
});

const keys: [Pad, Pad] = [emptyPad(), emptyPad()];
const touch: [Pad, Pad] = [emptyPad(), emptyPad()];

// Player 1: A/D to move, W to jump, F and G to attack, H for the signature move.
// Player 2: arrow keys, K and L, and ; for the signature move.
const KEYMAP: Record<string, [0 | 1, Key]> = {
  KeyA: [0, 'left'],
  KeyD: [0, 'right'],
  KeyW: [0, 'jump'],
  KeyF: [0, 'head'],
  KeyG: [0, 'tail'],
  KeyH: [0, 'special'],
  ArrowLeft: [1, 'left'],
  ArrowRight: [1, 'right'],
  ArrowUp: [1, 'jump'],
  KeyK: [1, 'head'],
  KeyL: [1, 'tail'],
  Semicolon: [1, 'special'],
};

/** With one player, both sets of keys are theirs. */
let solo = true;

export function pad(player: 0 | 1): Pad {
  const out = emptyPad();
  for (const k of Object.keys(out) as Key[]) {
    out[k] = solo ? keys[0][k] || keys[1][k] || touch[0][k] : keys[player][k] || touch[player][k];
  }
  return out;
}

const ARROW = (dir: number) =>
  `<svg viewBox="0 0 24 24"><path d="${dir < 0 ? 'M17 3 5 12l12 9z' : 'M7 3l12 9-12 9z'}" fill="#fff" stroke="#000" stroke-width="2" stroke-linejoin="round"/></svg>`;
const ICONS = {
  jump: '<svg viewBox="0 0 24 24"><path d="M12 2 2 13h6v9h8v-9h6z" fill="#fff" stroke="#000" stroke-width="2" stroke-linejoin="round"/></svg>',
  // Jaws.
  head: '<svg viewBox="0 0 24 24"><path d="M2 3h20v6l-3 4-3-4-2 4-2-4-2 4-3-4-2 4-3-4z" fill="#fff" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/><path d="M2 21h20v-5l-4-3-3 3-3-3-3 3-3-3-4 3z" fill="#fff" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  // A tail.
  tail: '<svg viewBox="0 0 24 24"><path d="M2 5c2 9 8 14 20 14-7-3-10-8-11-15z" fill="#fff" stroke="#000" stroke-width="1.8" stroke-linejoin="round"/><path d="M16 5l5-3M18 9l5-1M14 2l2-1" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
  // A star: the signature move.
  special:
    '<svg viewBox="0 0 24 24"><path d="M12 1.5l3.1 6.6 7.2.9-5.3 5 1.4 7.2L12 17.6l-6.4 3.6L7 14 1.7 9l7.2-.9z" fill="#fff" stroke="#000" stroke-width="1.8" stroke-linejoin="round"/></svg>',
};

const specialButtons: HTMLElement[] = [];

/** Light up or dim a player's signature-move button: it only works when their power bar is full. */
export function setSpecialReady(player: 0 | 1, ready: boolean): void {
  specialButtons[player]?.classList.toggle('off', !ready);
}

function button(player: 0 | 1, key: 'jump' | 'head' | 'tail' | 'special'): HTMLElement {
  const el = document.createElement('div');
  el.className = `btn ${key}`;
  if (key === 'special') specialButtons[player] = el;
  el.innerHTML = ICONS[key];
  const set = (down: boolean) => {
    touch[player][key] = down;
    el.classList.toggle('down', down);
  };
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    set(true);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(type, () => set(false));
  return el;
}

function mover(player: 0 | 1): HTMLElement {
  const el = document.createElement('div');
  el.className = 'btn move';
  el.innerHTML = ARROW(-1) + ARROW(1);
  let finger: number | null = null;
  const set = (dir: number) => {
    touch[player].left = dir < 0;
    touch[player].right = dir > 0;
    el.classList.toggle('left', dir < 0);
    el.classList.toggle('right', dir > 0);
    el.classList.toggle('down', dir !== 0);
  };
  const aim = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    set(e.clientX < r.left + r.width / 2 ? -1 : 1);
  };
  el.addEventListener('pointerdown', (e) => {
    finger = e.pointerId;
    el.setPointerCapture(e.pointerId);
    aim(e);
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId === finger) aim(e);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    el.addEventListener(type, (e) => {
      if ((e as PointerEvent).pointerId !== finger) return;
      finger = null;
      set(0);
    });
  }
  return el;
}

const group = (...children: HTMLElement[]) => {
  const el = document.createElement('div');
  el.className = 'group';
  el.append(...children);
  return el;
};

let usesTouch = matchMedia('(pointer: coarse)').matches;
let shown: 0 | 1 | 2 = 0;

function layout(): void {
  const root = document.getElementById('pads')!;
  const visible = usesTouch && shown > 0;
  root.hidden = !visible;
  document.body.classList.toggle('with-pads', visible);
  root.classList.toggle('two', shown === 2);
  root.querySelectorAll<HTMLElement>('.pad').forEach((el, i) => {
    el.hidden = i >= shown;
    // Player 2's set is mirrored, so both players have their move control in the outer corner.
    el.style.flexDirection = i === 1 ? 'row-reverse' : 'row';
  });
}

/** Show the touch controls for this many players (0 hides them). */
export function showPads(players: 0 | 1 | 2): void {
  shown = players;
  solo = players < 2;
  for (const p of touch) Object.assign(p, emptyPad());
  layout();
}

export function initInput(): void {
  addEventListener('keydown', (e) => {
    const m = KEYMAP[e.code];
    if (m) {
      keys[m[0]][m[1]] = true;
      e.preventDefault();
    }
  });
  addEventListener('keyup', (e) => {
    const m = KEYMAP[e.code];
    if (m) keys[m[0]][m[1]] = false;
  });
  addEventListener('blur', () => keys.forEach((p) => Object.assign(p, emptyPad())));
  // A touch on a device that didn't announce itself as one still brings the buttons up.
  addEventListener(
    'touchstart',
    () => {
      if (!usesTouch) {
        usesTouch = true;
        layout();
      }
    },
    { passive: true },
  );
  document.querySelectorAll<HTMLElement>('.pad').forEach((el) => {
    const player = Number(el.dataset.player) as 0 | 1;
    el.append(
      mover(player),
      group(button(player, 'special'), button(player, 'jump'), button(player, 'tail'), button(player, 'head')),
    );
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}
