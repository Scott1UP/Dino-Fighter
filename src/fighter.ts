/** One dinosaur in a fight: movement, blocking, the two attacks, the signature move, getting hit. */
import type { Box, FighterArt } from './assets';
import { sfx } from './audio';
import { emptyPad, type Pad } from './input';

export const GROUND_Y = 250;

export type Attack = 'head' | 'tail';

/** How long each part of an attack lasts, in sixtieths of a second. */
const TIMING: Record<Attack, { wind: number; active: number; recover: number }> = {
  head: { wind: 7, active: 6, recover: 11 },
  tail: { wind: 13, active: 8, recover: 17 },
};

const GRAVITY = 0.34;
/** How long a signature move is charged before it goes off (it also needs a full power bar). */
const CHARGE = 40;
/** A full power bar. */
export const FULL = 100;

/**
 * Walking speed in pixels a tick, and the damage of each attack (out of 100 health).
 * Tail damage is set against tail reach, which comes from the drawings: the longer the tail, the
 * lighter it hits (Titan's reaches 134 pixels, Trixie's 69).
 */
export const STATS: Record<string, { speed: number; head: number; tail: number }> = {
  rex: { speed: 1.5, head: 10, tail: 13 },
  trike: { speed: 1.4, head: 11, tail: 16 },
  stego: { speed: 1.3, head: 8, tail: 15 },
  raptor: { speed: 2.1, head: 7, tail: 11 },
  ankylo: { speed: 1.15, head: 9, tail: 17 },
  pachy: { speed: 1.75, head: 12, tail: 13 },
  spino: { speed: 1.5, head: 11, tail: 13 },
  giga: { speed: 1.4, head: 13, tail: 12 },
};

/** Something a signature move sends rolling along the ground. */
export interface Wave {
  kind: 'quake' | 'water';
  x: number;
  dir: 1 | -1;
  speed: number;
  /** Ticks left before it fades. */
  life: number;
  w: number;
  h: number;
  damage: number;
  owner: Fighter;
  /** Which of its owner's signature moves made it (see Fighter.move). */
  move: number;
}

/**
 * A signature move. While `active` ticks last it shows the fighter's signature frame and can hit;
 * then `recover` ticks of getting back up. `tick` drives the move and may end the active part
 * early by calling f.settle().
 */
interface Special {
  name: string;
  active: number;
  recover: number;
  damage: number;
  /**
   * A move that strikes several times: once the first strike lands, the rest follow `every` ticks
   * apart and can't miss, sharing the damage between them.
   */
  hits?: number;
  every?: number;
  begin?(f: Fighter): void;
  tick?(f: Fighter): void;
}

const wave = (f: Fighter, kind: Wave['kind'], dir: 1 | -1, from: number, speed: number, h: number): void => {
  f.send?.({
    kind,
    x: f.x + dir * from,
    dir,
    speed,
    life: 50,
    w: 30,
    h,
    damage: SPECIALS[f.art.id].damage,
    owner: f,
    move: f.move,
  });
  sfx('wave', 0.8);
};

export const SPECIALS: Record<string, Special> = {
  // A long lunging bite.
  rex: { name: 'MEGA CHOMP', active: 16, recover: 16, damage: 20, tick: (f) => (f.vx = f.aim * 4.6) },
  // Head down, horns first, a long way across the stage.
  trike: { name: 'HORN CHARGE', active: 26, recover: 18, damage: 20, tick: (f) => (f.vx = f.aim * 5) },
  // Spins with its spiked tail out, hitting on both sides: four turns, and a strike on each.
  stego: {
    name: 'SPIKE SPIN',
    active: 40,
    recover: 16,
    damage: 19,
    hits: 4,
    every: 10,
    tick: (f) => {
      f.vx = f.aim * 1.5;
      if (f.t % 5 === 0) f.facing = f.facing === 1 ? -1 : 1;
    },
  },
  // A long leap, claws first.
  raptor: {
    name: 'RAPTOR POUNCE',
    active: 60,
    recover: 12,
    damage: 18,
    begin: (f) => f.launch(5.4),
    tick: (f) => {
      f.vx = f.aim * 4.6;
      if (f.grounded && f.t > 4) f.settle();
    },
  },
  // Slams its club down and sends a tremor along the ground.
  ankylo: {
    name: 'CLUB QUAKE',
    active: 14,
    recover: 22,
    damage: 19,
    tick: (f) => {
      if (f.t === 6) wave(f, 'quake', f.aim, f.art.frames.tailHit.reach!, 4, 22);
    },
  },
  // Flies head first, low and fast.
  pachy: {
    name: 'ROCKET BONK',
    active: 60,
    recover: 14,
    damage: 19,
    begin: (f) => f.launch(2.4),
    tick: (f) => {
      f.vx = f.aim * 6.2;
      if (f.grounded && f.t > 4) f.settle();
    },
  },
  // Sweeps its paddle tail and throws a wave of water.
  spino: {
    name: 'TIDAL WAVE',
    active: 14,
    recover: 24,
    damage: 19,
    tick: (f) => {
      if (f.t === 8) wave(f, 'water', f.aim, f.art.frames.tailHit.reach! - 10, 5, 36);
    },
  },
  // Jumps and lands so hard that tremors run out both ways.
  giga: {
    name: 'TITAN STOMP',
    active: 90,
    recover: 24,
    damage: 20,
    begin: (f) => f.launch(6.6),
    tick: (f) => {
      f.vx = 0;
      if (f.grounded && f.t > 4) {
        wave(f, 'quake', 1, 30, 4.5, 26);
        wave(f, 'quake', -1, 30, 4.5, 26);
        f.settle();
      }
    },
  },
};

type State = 'idle' | 'walk' | 'jump' | Attack | 'block' | 'charge' | 'special' | 'hurt' | 'down' | 'win';

export class Fighter {
  x: number;
  /** Height of the feet above the stage floor. */
  y = 0;
  vx = 0;
  vy = 0;
  facing: 1 | -1;
  hp = 100;
  /** The power bar: fills by landing and taking hits; a full one buys a signature move. */
  meter = 0;
  state: State = 'idle';
  /** Ticks spent in the current state. */
  t = 0;
  /** The current attack has already landed, so it can't land again. */
  connected = false;
  /** Height of whatever is under the feet: 0 on the stage floor, more on top of a bonus-stage object. */
  floor = 0;
  /** Take-off speed of a jump. */
  jumpPower = 6.4;
  /** Counts this fighter's signature moves, so each one (and the waves it makes) can only land once. */
  move = 0;
  /** The signature move that has already landed, by its count. */
  landed = -1;
  /** The way a signature move is travelling (its facing when it began). */
  aim: 1 | -1 = 1;
  /** Set by the arena: where waves made by signature moves go. */
  send: ((w: Wave) => void) | null = null;
  private hurtFor = 0;
  private prev: Pad = emptyPad();
  readonly stats: (typeof STATS)[string];
  readonly special: Special;

  constructor(
    readonly art: FighterArt,
    x: number,
    facing: 1 | -1,
  ) {
    this.x = x;
    this.facing = facing;
    this.stats = STATS[art.id];
    this.special = SPECIALS[art.id];
  }

  private set(state: State): void {
    this.state = state;
    this.t = 0;
  }

  get grounded(): boolean {
    return this.y <= this.floor;
  }

  get attacking(): Attack | null {
    return this.state === 'head' || this.state === 'tail' ? this.state : null;
  }

  /** True on the ticks when the current attack or signature move can land. */
  get striking(): boolean {
    if (this.connected) return false;
    if (this.state === 'special') return this.t < this.special.active;
    const a = this.attacking;
    return !!a && this.t >= TIMING[a].wind && this.t < TIMING[a].wind + TIMING[a].active;
  }

  /** Damage of whatever is being thrown right now. */
  get power(): number {
    return this.state === 'special' ? this.special.damage : this.attacking ? this.stats[this.attacking] : 0;
  }

  /** Tail attacks and signature moves knock back further. */
  get heavy(): boolean {
    return this.state === 'special' || this.state === 'tail';
  }

  get canBeHit(): boolean {
    return this.state !== 'down' && this.state !== 'win' && !(this.state === 'hurt' && this.t < 14);
  }

  /** Blocking: standing on the ground, holding the direction away from where the hit comes from. */
  guards(fromX: number): boolean {
    if (this.state === 'block') return true;
    if (!this.grounded || (this.state !== 'idle' && this.state !== 'walk')) return false;
    return fromX > this.x ? this.prev.left : this.prev.right;
  }

  get pose(): string {
    switch (this.state) {
      case 'idle':
        return Math.floor(this.t / 22) % 2 ? 'idle2' : 'idle1';
      case 'walk':
        return ['walk1', 'idle1', 'walk2', 'idle1'][Math.floor(this.t / 7) % 4];
      case 'jump':
        return 'jump';
      case 'head':
      case 'tail': {
        const { wind, active, recover } = TIMING[this.state];
        return this.t >= wind && this.t < wind + active + recover / 2 ? `${this.state}Hit` : `${this.state}Wind`;
      }
      case 'block':
      case 'charge':
        return this.state;
      case 'special':
        return this.t < this.special.active ? 'special' : 'idle2';
      case 'hurt':
        return 'hurt';
      case 'down':
        return this.grounded ? 'down' : 'hurt';
      case 'win':
        return 'win';
    }
  }

  gain(amount: number): void {
    this.meter = Math.min(FULL, this.meter + amount);
  }

  /** The current frame's hurt or hit outline, as boxes on the stage. */
  boxes(kind: 'hurt' | 'hit'): Box[] {
    const frame = this.art.frames[this.pose];
    const feet = GROUND_Y - this.y;
    return (frame[kind] ?? []).map(([x0, y0, x1, y1]) =>
      this.facing === 1
        ? [this.x + x0, feet + y0, this.x + x1, feet + y1]
        : [this.x - x1, feet + y0, this.x - x0, feet + y1],
    );
  }

  /** The solid body on the stage: [left, right]. */
  get body(): [number, number] {
    const [b0, b1] = this.art.body;
    return this.facing === 1 ? [this.x + b0, this.x + b1] : [this.x - b1, this.x - b0];
  }

  /** Leave the ground with this upward speed. */
  launch(speed: number): void {
    this.vy = speed;
    this.y = this.floor + 0.01;
  }

  /** End the active part of a signature move now and start getting back up. */
  settle(): void {
    this.t = Math.max(this.t, this.special.active);
    this.vx = 0;
  }

  /** Advance one tick. `towards` is where the opponent is, to turn and face it. */
  step(pad: Pad, towards: number | null): void {
    const press = (k: keyof Pad) => pad[k] && !this.prev[k];
    const move = (pad.right ? 1 : 0) - (pad.left ? 1 : 0);
    this.t++;

    switch (this.state) {
      case 'idle':
      case 'walk': {
        if (!this.grounded) {
          // Walked off the edge of something.
          this.set('jump');
          break;
        }
        if (towards !== null && towards !== this.x) this.facing = towards > this.x ? 1 : -1;
        this.vx = move * this.stats.speed;
        const next = move ? 'walk' : 'idle';
        if (next !== this.state) this.set(next);
        if (press('jump')) {
          this.launch(this.jumpPower);
          this.set('jump');
          sfx('jump', 0.5);
        } else if (press('special') && this.meter >= FULL) {
          this.meter = 0;
          this.vx = 0;
          this.set('charge');
          sfx('charge', 0.7);
        } else if (press('head')) this.attack('head');
        else if (press('tail')) this.attack('tail');
        break;
      }
      case 'jump':
        this.vx = move * this.stats.speed * 0.9;
        if (press('head')) this.attack('head');
        else if (press('tail')) this.attack('tail');
        break;
      case 'head':
      case 'tail': {
        const { wind, active, recover } = TIMING[this.state];
        if (this.grounded) {
          // The head attack steps into the opponent a little.
          this.vx = this.state === 'head' && this.t >= wind && this.t < wind + active ? this.facing * 1.4 : 0;
        }
        if (this.t >= wind + active + recover) this.set(this.grounded ? 'idle' : 'jump');
        break;
      }
      case 'block':
        this.vx *= 0.8;
        if (this.t >= 14) this.set('idle');
        break;
      case 'charge':
        this.vx = 0;
        if (this.t >= CHARGE) {
          this.connected = false;
          this.move++;
          this.aim = this.facing;
          this.set('special');
          sfx('special', 0.8);
          this.special.begin?.(this);
        }
        break;
      case 'special':
        if (this.t < this.special.active) this.special.tick?.(this);
        else this.vx = 0;
        if (this.t >= this.special.active + this.special.recover) {
          this.facing = this.aim;
          this.set(this.grounded ? 'idle' : 'jump');
        }
        break;
      case 'hurt':
        this.vx *= 0.86;
        if (this.t >= this.hurtFor) this.set(this.grounded ? 'idle' : 'jump');
        break;
      case 'down':
        if (this.grounded) this.vx *= 0.88;
        break;
      case 'win':
        this.vx = 0;
        break;
    }

    this.x += this.vx;
    if (!this.grounded) {
      this.y += this.vy;
      this.vy -= GRAVITY;
      if (this.y <= this.floor) {
        this.y = this.floor;
        this.vy = 0;
        sfx('land', 0.5);
        if (this.state === 'jump') this.set('idle');
      }
    }
    this.prev = { ...pad };
  }

  private attack(kind: Attack): void {
    this.connected = false;
    this.set(kind);
    sfx('swing', kind === 'tail' ? 0.6 : 0.45, kind === 'tail' ? 0.8 : 1.15);
  }

  /** Take a hit travelling in the direction `from` (1 = towards the right). `knock` is how hard it shoves. */
  takeHit(damage: number, heavy: boolean, from: 1 | -1, knock = heavy ? 3.4 : 2.3): void {
    this.hp = Math.max(0, this.hp - damage);
    this.gain(damage * 0.8);
    this.facing = from === 1 ? -1 : 1;
    if (this.hp <= 0) {
      this.vx = from * 2.6;
      this.launch(4.2);
      this.set('down');
      return;
    }
    this.vx = from * knock;
    this.hurtFor = heavy ? 26 : 19;
    this.set('hurt');
  }

  /** Block a hit: no damage from ordinary attacks, half from a signature move (which can't knock out). */
  blockHit(damage: number, special: boolean, from: 1 | -1): void {
    if (special) this.hp = Math.max(1, this.hp - Math.round(damage / 2));
    this.gain(4);
    this.vx = from * 1.8;
    this.set('block');
  }

  celebrate(): void {
    if (this.state !== 'down') this.set('win');
  }

  draw(g: CanvasRenderingContext2D, cam: number): void {
    const { art } = this;
    const charging = this.state === 'charge';
    // A fighter charging up trembles.
    const sx = Math.round(this.x - cam) + (charging && this.t % 4 < 2 ? 1 : 0);
    // Shadow on the floor.
    g.fillStyle = 'rgb(0 0 0 / 0.35)';
    const half = Math.round(((art.body[1] - art.body[0]) / 2 + 14) * (1 - Math.min(this.y, 60) / 150));
    g.fillRect(sx - half, GROUND_Y - 2, half * 2, 4);
    g.fillRect(sx - half + 4, GROUND_Y - 3, half * 2 - 8, 6);

    const i = art.poses.indexOf(this.pose);
    const top = Math.round(GROUND_Y - this.y) - (art.cellH - 1);
    g.save();
    g.translate(sx, 0);
    if (this.facing === -1) g.scale(-1, 1);
    g.drawImage(art.img, i * art.cellW, 0, art.cellW, art.cellH, -art.cellW / 2, top, art.cellW, art.cellH);
    if (charging && this.t % 8 < 4) {
      // ...and flashes brighter and brighter.
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.35 + (0.5 * this.t) / CHARGE;
      g.drawImage(art.img, i * art.cellW, 0, art.cellW, art.cellH, -art.cellW / 2, top, art.cellW, art.cellH);
    }
    g.restore();

    if (charging) {
      // Sparks rising round it.
      for (let n = 0; n < 6; n++) {
        const rise = (this.t * 2 + n * 17) % 50;
        const px = sx + Math.round(Math.sin(n * 2.4) * (half + 4));
        g.fillStyle = n % 2 ? '#fff' : '#ffd23a';
        g.fillRect(px, GROUND_Y - this.y - 6 - rise * 2, 2, 4);
      }
    }
  }
}

/** Where two sets of boxes overlap, or null. Returns the middle of the first overlap found. */
export function overlap(a: Box[], b: Box[]): [number, number] | null {
  for (const [ax0, ay0, ax1, ay1] of a) {
    for (const [bx0, by0, bx1, by1] of b) {
      if (ax0 < bx1 && bx0 < ax1 && ay0 < by1 && by0 < ay1) {
        return [(Math.max(ax0, bx0) + Math.min(ax1, bx1)) / 2, (Math.max(ay0, by0) + Math.min(ay1, by1)) / 2];
      }
    }
  }
  return null;
}
