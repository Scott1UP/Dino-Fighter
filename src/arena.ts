/** What a fight and the bonus stages share: the stage picture, the camera, hit effects, waves and the pause menu. */
import { Ambience } from './ambience';
import { art, type Box } from './assets';
import { sfx } from './audio';
import { BACK, BACK_KEYS, drawControls } from './controls';
import { button, H, inside, panel, type Rect, text, W } from './draw';
import { type Fighter, FULL, GROUND_Y, type Wave } from './fighter';
import { game, type Scene } from './game';

export const STAGE_W = 768;
export const CENTRE = STAGE_W / 2;
/** How close a fighter may get to the edge of the picture. */
const EDGE = 20;

interface Spark {
  x: number;
  y: number;
  t: number;
  big: boolean;
  /** A blocked hit sparks blue. */
  blocked: boolean;
}
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
}

/** The pause button, top middle of the screen. Its touch area is bigger than the drawing. */
const PAUSE: Rect = { x: W / 2 - 10, y: 0, w: 20, h: 11 };
const PAUSE_TOUCH: Rect = { x: W / 2 - 26, y: 0, w: 52, h: 34 };
const RESUME: Rect = { x: W / 2 - 100, y: 104, w: 200, h: 34 };
const CONTROLS: Rect = { x: W / 2 - 100, y: 148, w: 200, h: 34 };
const QUIT: Rect = { x: W / 2 - 100, y: 192, w: 200, h: 34 };

export abstract class Arena implements Scene {
  abstract pads: 1 | 2;
  protected cam = CENTRE - W / 2;
  protected shake = 0;
  /** Ticks left of the short freeze when a hit lands. */
  protected freeze = 0;
  protected t = 0;
  protected paused = false;
  /** The controls screen, opened from the pause menu. */
  private help = false;
  private sparks: Spark[] = [];
  protected bits: Bit[] = [];
  protected waves: Wave[] = [];
  private readonly ambience: Ambience;

  constructor(
    protected readonly stage: string,
    /** Leave for the menu (from the pause menu). */
    protected readonly quit: () => void,
  ) {
    this.ambience = new Ambience(stage);
  }

  /** One tick of the fight or bonus stage itself. */
  protected abstract tick(): void;
  protected abstract paint(g: CanvasRenderingContext2D): void;
  /** A touch that wasn't on the pause button or menu. */
  protected touched(_x: number, _y: number): void {}
  protected pressed(_code: string): void {}

  update(): void {
    if (this.paused) return;
    this.ambience.update();
    if (this.shake > 0) this.shake--;
    for (const s of this.sparks) s.t++;
    this.sparks = this.sparks.filter((s) => s.t < 12);
    for (const b of this.bits) {
      b.x += b.vx;
      b.y += b.vy;
      b.vy += 0.3;
    }
    this.bits = this.bits.filter((b) => b.y < GROUND_Y + 4);
    if (this.freeze > 0) {
      this.freeze--;
      return;
    }
    for (const w of this.waves) {
      w.x += w.dir * w.speed;
      w.life--;
    }
    this.waves = this.waves.filter((w) => w.life > 0 && w.x > -20 && w.x < STAGE_W + 20);
    this.t++;
    this.tick();
  }

  draw(g: CanvasRenderingContext2D): void {
    this.paint(g);
    panel(g, PAUSE, '#000', '#9aa4ff');
    g.fillStyle = '#fff';
    g.fillRect(PAUSE.x + 6, PAUSE.y + 3, 3, 5);
    g.fillRect(PAUSE.x + 11, PAUSE.y + 3, 3, 5);
    if (!this.paused) return;
    g.fillStyle = 'rgb(0 0 40 / 0.7)';
    g.fillRect(0, 0, W, H);
    if (this.help) return drawControls(g);
    text(g, 'PAUSED', W / 2, 62, { size: 24, align: 'center', color: '#ffd23a' });
    button(g, RESUME, 'RESUME', true, 16);
    button(g, CONTROLS, 'CONTROLS', false, 16);
    button(g, QUIT, 'QUIT', false, 16);
  }

  private pause(on: boolean): void {
    this.paused = on;
    sfx('pause', 0.7);
  }

  private showHelp(on: boolean): void {
    this.help = on;
    sfx('tap');
  }

  tap(x: number, y: number): void {
    if (this.help) {
      if (inside(BACK, x, y)) this.showHelp(false);
    } else if (this.paused) {
      if (inside(RESUME, x, y)) this.pause(false);
      else if (inside(CONTROLS, x, y)) this.showHelp(true);
      else if (inside(QUIT, x, y)) this.quit();
    } else if (inside(PAUSE_TOUCH, x, y)) this.pause(true);
    else this.touched(x, y);
  }

  key(code: string): void {
    if (this.help) {
      if (BACK_KEYS.includes(code)) this.showHelp(false);
    } else if (code === 'Escape' || code === 'KeyP') this.pause(!this.paused);
    else if (this.paused) {
      if (code === 'Enter' || code === 'Space') this.pause(false);
      else if (code === 'KeyC') this.showHelp(true);
      else if (code === 'KeyQ') this.quit();
    } else this.pressed(code);
  }

  protected follow(...xs: number[]): void {
    const mid = xs.reduce((a, b) => a + b, 0) / xs.length;
    const target = Math.max(0, Math.min(STAGE_W - W, mid - W / 2));
    this.cam += (target - this.cam) * 0.15;
  }

  /** Keep a fighter on the stage and in the picture. */
  protected contain(f: Fighter): void {
    f.x = Math.max(Math.max(EDGE, this.cam + EDGE), Math.min(Math.min(STAGE_W - EDGE, this.cam + W - EDGE), f.x));
  }

  protected hitEffect(x: number, y: number, heavy: boolean, blocked = false): void {
    this.sparks.push({ x, y, t: 0, big: heavy && !blocked, blocked });
    this.shake = blocked ? 2 : heavy ? 9 : 5;
    this.freeze = blocked ? 3 : heavy ? 8 : 5;
  }

  /** Where a wave can hit, as a box on the stage. */
  protected waveBox(w: Wave): Box[] {
    return [[w.x - w.w / 2, GROUND_Y - w.h, w.x + w.w / 2, GROUND_Y]];
  }

  /** The camera position to draw with, including any shake. */
  protected get view(): number {
    return Math.round(this.cam + (this.shake ? (this.shake % 2 ? 1 : -1) * Math.ceil(this.shake / 3) : 0));
  }

  protected drawStage(g: CanvasRenderingContext2D): void {
    g.drawImage(art.stages[this.stage], -this.view, 0);
    this.ambience.draw(g, this.view);
  }

  protected drawEffects(g: CanvasRenderingContext2D): void {
    const cam = this.view;
    for (const w of this.waves) {
      // A row of jagged columns, tallest at the front, fading as the wave runs out.
      const colors = w.kind === 'water' ? ['#fff', '#7fd4ff', '#2a7fff'] : ['#f4e2b0', '#b08850', '#6a4a2a'];
      const fade = Math.min(1, w.life / 12);
      for (let i = 0; i < 6; i++) {
        const along = w.dir * (w.w / 2 - i * 7);
        const h = Math.round(w.h * fade * (1 - i * 0.13) * (0.75 + 0.25 * Math.sin(w.life * 0.9 + i * 1.7)));
        g.fillStyle = colors[(i + Math.floor(w.life / 3)) % colors.length];
        g.fillRect(Math.round(w.x + along - cam) - 3, GROUND_Y - h, 6, h);
      }
    }
    for (const b of this.bits) {
      g.fillStyle = b.color;
      g.fillRect(Math.round(b.x - cam), Math.round(b.y), 3, 3);
    }
    for (const s of this.sparks) {
      const x = Math.round(s.x - cam);
      const y = Math.round(s.y);
      const r = (s.big ? 7 : 4) + s.t;
      g.fillStyle = s.blocked ? (s.t < 5 ? '#fff' : '#7fd4ff') : s.t < 4 ? '#fff' : s.t < 8 ? '#ffe45c' : '#ff9a2e';
      g.fillRect(x - r, y - 1, r * 2, 3);
      g.fillRect(x - 1, y - r, 3, r * 2);
      const d = Math.round(r * 0.6);
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        g.fillRect(x + dx * d - 1, y + dy * d - 1, 3, 3);
      if (s.t < 5) {
        g.fillStyle = '#fff';
        g.fillRect(x - 3, y - 3, 7, 7);
      }
    }
  }

  protected drawBoxes(g: CanvasRenderingContext2D, boxes: Box[], color: string): void {
    g.fillStyle = color;
    for (const [x0, y0, x1, y1] of boxes) g.fillRect(Math.round(x0 - this.view), y0, Math.round(x1 - x0), y1 - y0);
  }

  protected debugBoxes(g: CanvasRenderingContext2D, fighters: Fighter[]): void {
    if (!game.showBoxes) return;
    for (const f of fighters) {
      this.drawBoxes(g, f.boxes('hurt'), 'rgb(0 255 80 / 0.4)');
      if (f.striking) this.drawBoxes(g, f.boxes('hit'), 'rgb(255 0 0 / 0.7)');
    }
    for (const w of this.waves) this.drawBoxes(g, this.waveBox(w), 'rgb(255 0 0 / 0.7)');
  }

  protected banner(g: CanvasRenderingContext2D, s: string, color = '#ffd23a', y = 104, size = 24): void {
    text(g, s, W / 2 + 2, y + 2, { size, align: 'center', color: '#000', shadow: null });
    text(g, s, W / 2, y, { size, align: 'center', color, shadow: '#a01008' });
  }
}

/** A health bar. With `fromRight` it empties towards the left edge of the screen. */
export function healthBar(g: CanvasRenderingContext2D, x: number, w: number, frac: number, fromRight: boolean): void {
  panel(g, { x, y: 16, w, h: 12 }, '#d01818');
  const fill = Math.round((w - 4) * Math.max(0, frac));
  g.fillStyle = '#ffe000';
  g.fillRect(fromRight ? x + w - 2 - fill : x + 2, 18, fill, 8);
}

/** A power bar: blue while it fills, flashing gold when it is full and the signature move is ready. */
export function powerBar(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  meter: number,
  fromRight: boolean,
  t: number,
): void {
  const w = 72;
  panel(g, { x, y, w, h: 7 }, '#101030');
  const full = meter >= FULL;
  const fill = Math.round(((w - 4) * Math.min(meter, FULL)) / FULL);
  g.fillStyle = full ? (t % 16 < 8 ? '#ffd23a' : '#fff') : '#3c9cff';
  g.fillRect(fromRight ? x + w - 2 - fill : x + 2, y + 2, fill, 3);
}
