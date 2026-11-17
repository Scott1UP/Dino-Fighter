/** The bonus stages: smash things before the clock runs out. */
import { Arena, CENTRE, healthBar, powerBar } from './arena';
import { art, type Box, type ObjectArt } from './assets';
import { music, sfx, voice } from './audio';
import { button, inside, type Rect, text, W } from './draw';
import { Fighter, FULL, GROUND_Y, overlap } from './fighter';
import { game, type Scene } from './game';
import { emptyPad, pad, type Pad, setSpecialReady } from './input';
import { easyMode } from './settings';

interface Level {
  /** Which object (see scripts/sprites.mjs), and where each one stands, measured from the middle of the stage. */
  object: string;
  at: number[];
  /** Health of each one. */
  hp: number;
  stage: string;
  seconds: number;
  intro: string;
  cleared: string;
  hitSound: string;
  breakSound: string;
  /** Colours of the bits that fly off. */
  bits: string[];
}

export const LEVELS: Level[] = [
  {
    object: 'truck',
    at: [0],
    hp: 260,
    stage: 'boneyard',
    seconds: 40,
    intro: 'SMASH THE TRUCK!',
    cleared: 'SMASHED IT!',
    hitSound: 'crunch',
    breakSound: 'smash',
    bits: ['#5a6b2a', '#8a9a48', '#e8e0c0', '#333', '#b8c0c8'],
  },
  {
    object: 'barrel',
    at: [-150, -60, 30, 120, 210],
    hp: 48,
    stage: 'beach',
    seconds: 40,
    intro: 'BREAK THE BARRELS!',
    cleared: 'ALL BROKEN!',
    hitSound: 'wood',
    breakSound: 'woodBreak',
    bits: ['#8a5a2a', '#b07a3a', '#5a3a1a', '#444'],
  },
  {
    object: 'meteor',
    at: [0],
    hp: 280,
    stage: 'volcano',
    seconds: 40,
    intro: 'CRACK THE METEOR!',
    cleared: 'CRYSTALS!',
    hitSound: 'rock',
    breakSound: 'rockBreak',
    bits: ['#555', '#777', '#3a3a44', '#5cc8ff'],
  },
  {
    object: 'statue',
    at: [-70, 90],
    hp: 150,
    stage: 'jungle',
    seconds: 45,
    intro: 'TOPPLE THE STATUES!',
    cleared: 'SMASHED IT!',
    hitSound: 'rock',
    breakSound: 'rockBreak',
    bits: ['#8a8a78', '#a8a890', '#5a6b3a', '#666'],
  },
  {
    object: 'egg',
    at: [0],
    hp: 300,
    stage: 'meadow',
    seconds: 45,
    intro: 'HATCH THE EGG!',
    cleared: 'IT HATCHED!',
    hitSound: 'eggCrack',
    breakSound: 'hatch',
    bits: ['#f4ecd0', '#fff', '#3aa8a0'],
  },
];

interface Thing {
  x: number;
  hp: number;
  /** Ticks left of the wobble after a hit. */
  wobble: number;
}

/** Signature moves hit this many times harder on bonus stages: a full power bar should really smash something. */
const SPECIAL_BOOST = 3;

const AGAIN: Rect = { x: W / 2 - 110, y: 150, w: 220, h: 34 };
const MENU: Rect = { x: W / 2 - 110, y: 194, w: 220, h: 34 };

export interface BonusOptions {
  id: string;
  level: number;
  /** In the story a bonus stage comes up on its own, so it isn't numbered. */
  unnumbered?: boolean;
  /** The level was cleared: on to the next (or the end). */
  next(): void;
  retry(): void;
  quit(): void;
  /** The second button when time runs out, under TRY AGAIN. Without it, that button is MENU and quits. */
  giveUp?: { label: string; go(): void };
}

export class Bonus extends Arena implements Scene {
  pads = 1 as const;
  private readonly level: Level;
  private readonly look: ObjectArt;
  private f: Fighter;
  private things: Thing[];
  private clock: number;
  private phase: 'intro' | 'smash' | 'cleared' | 'failed' = 'intro';

  constructor(private readonly o: BonusOptions) {
    const level = LEVELS[o.level];
    super(level.stage, o.quit);
    this.level = level;
    this.look = art.objects[level.object];
    this.clock = Math.round(level.seconds * (easyMode() ? 1.5 : 1));
    this.things = level.at.map((x) => ({ x: CENTRE + x, hp: level.hp, wobble: 0 }));
    // Start to the left of everything.
    this.f = new Fighter(art.fighters[o.id], CENTRE + Math.min(...level.at) - this.look.cellW / 2 - 70, 1);
    // Jumps are higher here, to get up on top of things and over them.
    this.f.jumpPower = 9;
    this.f.send = (w) => this.waves.push(w);
    this.cam = Math.max(0, this.f.x - 120);
    void music('beach');
  }

  /** Which drawing of a thing to show: 0 whole ... 3 wrecked. */
  private damage(th: Thing): number {
    const left = th.hp / this.level.hp;
    return left > 0.66 ? 0 : left > 0.33 ? 1 : left > 0 ? 2 : 3;
  }

  private boxes(th: Thing): Box[] {
    return this.look.frames[this.damage(th)].hurt.map(([x0, y0, x1, y1]) => [
      th.x + x0,
      GROUND_Y + y0,
      th.x + x1,
      GROUND_Y + y1,
    ]);
  }

  private get left(): number {
    return this.things.reduce((sum, th) => sum + th.hp, 0);
  }

  private stepFighter(p: Pad): void {
    const f = this.f;
    // Things are solid until they are wrecked: land on top of them, or be stopped by their sides.
    const solid = this.things
      .filter((th) => th.hp > 0)
      .map((th) => {
        const boxes = this.look.frames[this.damage(th)].hurt;
        const half = Math.max(...boxes.map((b) => b[2])) - 8;
        return { l: th.x - half, r: th.x + half, x: th.x, top: -Math.min(...boxes.map((b) => b[1])) - 6 };
      });
    const over = (s: (typeof solid)[number]) => f.body[1] > s.l && f.body[0] < s.r;
    f.floor = Math.max(0, ...solid.filter((s) => over(s) && f.y >= s.top - 4).map((s) => s.top));
    // Face the nearest thing still standing.
    const standing = this.things.filter((th) => th.hp > 0);
    const nearest = standing.sort((a, b) => Math.abs(a.x - f.x) - Math.abs(b.x - f.x))[0];
    f.step(p, nearest ? nearest.x : null);
    setSpecialReady(0, f.meter >= FULL);
    for (const s of solid) {
      if (over(s) && f.y < s.top - 4) f.x += f.x < s.x ? s.l - f.body[1] : s.r - f.body[0];
    }
    this.contain(f);
    this.follow(f.x, f.x, nearest ? nearest.x : f.x);
  }

  /** Hit whichever thing these boxes touch. Returns true if one was hit. */
  private smash(boxes: Box[], damage: number, heavy: boolean): boolean {
    for (const th of this.things) {
      if (th.hp <= 0) continue;
      const at = overlap(boxes, this.boxes(th));
      if (!at) continue;
      th.hp = Math.max(0, th.hp - damage);
      th.wobble = 8;
      this.hitEffect(at[0], at[1], heavy);
      const broke = th.hp <= 0;
      sfx(broke ? this.level.breakSound : this.level.hitSound, 0.9, broke ? 1 : 0.9 + Math.random() * 0.3);
      if (broke) this.shake = 14;
      for (let i = 0; i < (broke ? 18 : heavy ? 9 : 5); i++) {
        this.bits.push({
          x: at[0],
          y: at[1],
          vx: (Math.random() - 0.5) * (broke ? 8 : 5),
          vy: -2 - Math.random() * 4,
          color: this.level.bits[Math.floor(Math.random() * this.level.bits.length)],
        });
      }
      return true;
    }
    return false;
  }

  protected tick(): void {
    const f = this.f;
    for (const th of this.things) if (th.wobble > 0) th.wobble--;
    if (this.phase === 'intro') {
      this.stepFighter(emptyPad());
      if (this.t === 5) voice('bonus');
      if (this.t === 110) {
        sfx('bell', 0.5);
        voice('go');
      }
      if (this.t >= 140) {
        this.phase = 'smash';
        this.t = 0;
      }
    } else if (this.phase === 'smash') {
      this.stepFighter(pad(0));
      if (f.striking && this.smash(f.boxes('hit'), f.power * (f.state === 'special' ? SPECIAL_BOOST : 1), f.heavy)) {
        f.connected = true;
        if (f.state === 'special') f.landed = f.move;
        else f.gain(f.power * 1.4);
      }
      for (const w of this.waves) {
        // A signature move lands once: if the swing itself has hit, the wave it threw fades out.
        if (f.landed === w.move) w.life = Math.min(w.life, 8);
        else if (this.smash(this.waveBox(w), w.damage * SPECIAL_BOOST, true)) {
          w.life = 0;
          f.landed = w.move;
        }
      }
      if (this.left <= 0) {
        this.phase = 'cleared';
        this.t = 0;
        void music(null);
        f.celebrate();
        voice('smashed');
      } else if (this.t % 60 === 0 && --this.clock <= 0) {
        this.phase = 'failed';
        this.t = 0;
        void music(null);
        sfx('lose', 0.8);
        voice('timeUp');
      }
    } else {
      this.stepFighter(emptyPad());
      if (this.phase === 'cleared') {
        if (this.t === 50) sfx('win', 0.8);
        if (this.t === 70) sfx(`roar-${f.art.id}`, 0.9);
        if (this.t >= 280) this.o.next();
      }
    }
  }

  protected paint(g: CanvasRenderingContext2D): void {
    this.drawStage(g);
    const { look } = this;
    for (const th of this.things) {
      const x = Math.round(th.x - this.view - look.cellW / 2) + (th.wobble ? (th.wobble % 2 ? 2 : -2) : 0);
      if (th.hp > 0) {
        g.fillStyle = 'rgb(0 0 0 / 0.35)';
        g.fillRect(x + 6, GROUND_Y - 2, look.cellW - 12, 5);
      }
      g.drawImage(
        look.img,
        this.damage(th) * look.cellW,
        0,
        look.cellW,
        look.cellH,
        x,
        GROUND_Y - look.cellH + 1,
        look.cellW,
        look.cellH,
      );
    }
    this.f.draw(g, this.view);
    this.drawEffects(g);
    this.debugBoxes(g, [this.f]);
    if (game.showBoxes) for (const th of this.things) this.drawBoxes(g, this.boxes(th), 'rgb(0 255 80 / 0.4)');

    text(g, this.o.unnumbered ? 'BONUS STAGE' : `BONUS STAGE ${this.o.level + 1}`, 16, 5);
    healthBar(g, 14, 196, this.left / (this.level.hp * this.things.length), false);
    powerBar(g, 14, 32, this.f.meter, false, this.t);
    text(g, String(Math.max(0, this.clock)).padStart(2, '0'), W - 16, 10, { size: 24, align: 'right' });

    if (this.phase === 'intro') {
      if (this.t < 110) this.banner(g, this.level.intro, '#ffd23a', 108, 16);
      else this.banner(g, 'GO!', '#ff5a36');
    } else if (this.phase === 'cleared') {
      this.banner(g, this.level.cleared, '#ffd23a', 92);
      this.banner(g, `${this.clock} SECONDS LEFT`, '#fff', 124, 8);
    } else if (this.phase === 'failed') {
      this.banner(g, 'TIME UP', '#ff5a36', 84);
      if (this.t > 40) {
        button(g, AGAIN, 'TRY AGAIN', Math.floor(this.t / 20) % 2 === 0, 16);
        button(g, MENU, this.o.giveUp?.label ?? 'MENU', false, 16);
      }
    }
  }

  protected touched(x: number, y: number): void {
    if (this.phase !== 'failed' || this.t <= 40) return;
    if (inside(AGAIN, x, y)) {
      sfx('confirm');
      this.o.retry();
    } else if (inside(MENU, x, y)) (this.o.giveUp?.go ?? this.o.quit)();
  }

  protected pressed(code: string): void {
    if (this.phase !== 'failed' || this.t <= 40) return;
    if (code === 'Enter' || code === 'Space' || code === 'KeyF') {
      sfx('confirm');
      this.o.retry();
    }
  }
}
