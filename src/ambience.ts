/** A little life drawn over each stage picture: embers, fireflies, rain, drifting leaves... */
import { H, W } from './draw';

interface Kind {
  count: number;
  colors: string[];
  /** Speed range in pixels a tick: [vx min, vx max, vy min, vy max]. */
  v: [number, number, number, number];
  /** Band of the screen they live in: [top, bottom]. */
  band: [number, number];
  w: number;
  h: number;
  /** Wander from side to side as they go. */
  sway?: number;
  /** Blink on and off. */
  blink?: boolean;
  /** Every so often the sky flashes. */
  lightning?: boolean;
}

const KINDS: Record<string, Kind> = {
  // Embers rising from the lava.
  volcano: {
    count: 26,
    colors: ['#ffb040', '#ff6a20', '#ffe080'],
    v: [-0.2, 0.2, -0.7, -0.25],
    band: [40, 250],
    w: 2,
    h: 2,
    sway: 0.4,
  },
  // Leaves drifting down.
  jungle: {
    count: 12,
    colors: ['#6ac030', '#3a9020', '#c8e060'],
    v: [-0.5, -0.1, 0.25, 0.55],
    band: [0, 250],
    w: 3,
    h: 2,
    sway: 0.7,
  },
  // Pollen and seeds floating on the breeze.
  meadow: { count: 18, colors: ['#fff', '#fff4b0'], v: [0.1, 0.4, -0.15, 0.1], band: [60, 240], w: 1, h: 1, sway: 0.5 },
  // Fireflies.
  dojo: {
    count: 16,
    colors: ['#e8ff70', '#b0ff60'],
    v: [-0.2, 0.2, -0.15, 0.15],
    band: [110, 240],
    w: 2,
    h: 2,
    sway: 0.8,
    blink: true,
  },
  // Dust blowing across the canyon.
  boneyard: { count: 16, colors: ['#f4d8a0', '#e0b070'], v: [0.9, 1.8, -0.05, 0.1], band: [150, 262], w: 4, h: 1 },
  // Snow in the wind, and lightning far off.
  peak: {
    count: 40,
    colors: ['#fff', '#d8e4ff'],
    v: [-1.6, -0.8, 0.5, 1.1],
    band: [0, 262],
    w: 2,
    h: 2,
    lightning: true,
  },
  // Rain.
  cove: {
    count: 46,
    colors: ['#b8d8f0', '#88b0d8'],
    v: [-1, -0.8, 4.5, 5.5],
    band: [0, 262],
    w: 1,
    h: 5,
    lightning: true,
  },
  // Shooting stars.
  crater: { count: 4, colors: ['#fff', '#ffe8a0'], v: [-3.5, -2.5, 1, 1.6], band: [0, 70], w: 6, h: 1 },
  // Glints on the sea.
  beach: { count: 14, colors: ['#fff', '#c8ecff'], v: [-0.05, 0.05, 0, 0], band: [196, 222], w: 3, h: 1, blink: true },
};

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  /** Each has its own rhythm. */
  seed: number;
}

export class Ambience {
  private readonly kind: Kind | undefined;
  private motes: Mote[] = [];
  private t = 0;
  private flash = 0;

  constructor(stage: string) {
    this.kind = KINDS[stage];
    const k = this.kind;
    if (!k) return;
    const between = (a: number, b: number) => a + Math.random() * (b - a);
    for (let i = 0; i < k.count; i++) {
      this.motes.push({
        x: Math.random() * W,
        y: between(k.band[0], k.band[1]),
        vx: between(k.v[0], k.v[1]),
        vy: between(k.v[2], k.v[3]),
        color: k.colors[i % k.colors.length],
        seed: Math.random() * 100,
      });
    }
  }

  update(): void {
    const k = this.kind;
    if (!k) return;
    this.t++;
    const [top, bottom] = k.band;
    for (const m of this.motes) {
      m.x += m.vx + (k.sway ? Math.sin(this.t / 30 + m.seed) * k.sway * 0.5 : 0);
      m.y += m.vy;
      // Leaving one side of its band, a mote comes back in on the other.
      if (m.y < top) m.y = bottom;
      else if (m.y > bottom) m.y = top;
      if (m.x < -8) m.x = W + 8;
      else if (m.x > W + 8) m.x = -8;
    }
    if (this.flash > 0) this.flash--;
    else if (k.lightning && Math.random() < 1 / 420) this.flash = 5;
  }

  /** Drawn over the stage picture and behind the fighters. `cam` makes the motes slide a little as the view scrolls. */
  draw(g: CanvasRenderingContext2D, cam: number): void {
    const k = this.kind;
    if (!k) return;
    if (this.flash > 0) {
      // A soft flicker of light, kept faint.
      g.fillStyle = `rgb(255 255 255 / ${this.flash > 3 ? 0.22 : 0.1})`;
      g.fillRect(0, 0, W, H);
    }
    for (const m of this.motes) {
      if (k.blink && Math.sin(this.t / 14 + m.seed) < 0.1) continue;
      g.fillStyle = m.color;
      const x = ((((m.x - cam * 0.5) % (W + 16)) + (W + 16)) % (W + 16)) - 8;
      g.fillRect(Math.round(x), Math.round(m.y), k.w, k.h);
    }
  }
}
