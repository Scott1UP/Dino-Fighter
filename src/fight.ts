/** A fight between two dinosaurs. */
import { Arena, CENTRE, healthBar, powerBar } from './arena';
import { art, type Box } from './assets';
import { music, sfx, voice } from './audio';
import { panel, text, W } from './draw';
import { Fighter, FULL, GROUND_Y, overlap } from './fighter';
import type { Scene } from './game';
import { emptyPad, pad, type Pad, setSpecialReady } from './input';

/** One strike's part of a move's damage when it is split over several strikes (the parts add up exactly). */
export const share = (damage: number, hits: number, n: number): number =>
  Math.round(((n + 1) * damage) / hits) - Math.round((n * damage) / hits);

export interface MatchOptions {
  ids: [string, string];
  stage: string;
  /** How good the computer opponent is (0 gentlest), or null when player 2 is a person. */
  ai: number | null;
  /** Rounds needed to win the match. */
  rounds: number;
  /** Easy mode: a slower computer that never blocks and hits half as hard. */
  easy?: boolean;
  done(winner: 0 | 1): void;
  quit(): void;
}

export class Match extends Arena implements Scene {
  pads: 1 | 2;
  private f!: [Fighter, Fighter];
  private wins: [number, number] = [0, 0];
  private round = 0;
  private phase: 'intro' | 'fight' | 'over' | 'result' = 'intro';
  private clock = 99;
  private winner: 0 | 1 | null = null;
  private aiPad = emptyPad();
  private aiWait = 0;
  /** The name of a signature move, shown for a moment when it goes off. */
  private shout: { name: string; side: 0 | 1; t: number } | null = null;
  /** A signature move that strikes several times and has landed its first: the strikes still to come. */
  private combo: { attacker: Fighter; victim: Fighter; done: number; at: number; blocked: boolean } | null = null;

  constructor(private readonly o: MatchOptions) {
    super(o.stage, o.quit);
    this.pads = o.ai === null ? 2 : 1;
    void music(o.stage);
    this.startRound();
  }

  private startRound(): void {
    this.round++;
    // Power bars carry over from round to round.
    const meters = this.f ? this.f.map((f) => f.meter) : [0, 0];
    this.f = [
      new Fighter(art.fighters[this.o.ids[0]], CENTRE - 75, 1),
      new Fighter(art.fighters[this.o.ids[1]], CENTRE + 75, -1),
    ];
    for (const [i, f] of this.f.entries()) {
      f.send = (w) => this.waves.push(w);
      f.meter = meters[i];
    }
    this.waves = [];
    this.combo = null;
    this.cam = CENTRE - W / 2;
    this.clock = 99;
    this.phase = 'intro';
    this.t = 0;
    this.winner = null;
  }

  /** The computer's buttons for this tick. */
  private think(me: Fighter, foe: Fighter): Pad {
    const level = this.o.easy ? Math.floor((this.o.ai ?? 0) / 3) : (this.o.ai ?? 0);
    const dist = Math.abs(foe.x - me.x);
    const towards = foe.x > me.x ? 'right' : 'left';
    const away = foe.x > me.x ? 'left' : 'right';
    const headRange = me.art.frames.headHit.reach! + foe.art.body[1] - 8;
    const tailRange = me.art.frames.tailHit.reach! + foe.art.body[1] - 8;
    // Buttons are tapped for one tick; a direction is held until the next decision.
    this.aiPad.head = this.aiPad.tail = this.aiPad.jump = this.aiPad.special = false;

    // Seeing an attack start, it sometimes backs off into a block: more often the better it is.
    const threat = (foe.attacking || foe.state === 'special') && foe.t === 3 && dist < 170;
    if (threat && !this.o.easy && Math.random() < 0.06 + level * 0.09) {
      this.aiPad = emptyPad();
      this.aiPad[away] = true;
      this.aiWait = 24;
      return this.aiPad;
    }
    if (--this.aiWait > 0) return this.aiPad;
    this.aiWait = Math.round(30 - level * 2.6 + Math.random() * 8);
    const p = (this.aiPad = emptyPad());
    const keen = 0.28 + level * 0.07;
    const r = Math.random();
    if (me.meter >= FULL && dist < 220 && Math.random() < 0.2 + level * 0.06) p.special = true;
    else if (dist > Math.max(tailRange, headRange)) {
      if (r < 0.5 + keen * 0.5) p[towards] = true;
      else if (r > 0.95) p.jump = true;
    } else if (dist > Math.min(tailRange, headRange)) {
      // Only the longer attack reaches from here.
      const long = tailRange > headRange ? 'tail' : 'head';
      if (r < keen) p[long] = true;
      else if (r < keen + 0.3) p[towards] = true;
      else if (r > 0.9) p[away] = true;
    } else if (r < keen) p.head = true;
    else if (r < keen + 0.2) p.tail = true;
    else if (r > 0.8) p[away] = true;
    return p;
  }

  private stepFighters(pads: [Pad, Pad]): void {
    const [a, b] = this.f;
    for (const [side, f] of this.f.entries()) {
      const was = f.state;
      f.step(pads[side], this.f[1 - side].x);
      if (f.state === 'special' && was === 'charge') {
        this.shout = { name: f.special.name, side: side as 0 | 1, t: 0 };
        voice(`move-${f.art.id}`);
      }
      setSpecialReady(side as 0 | 1, f.meter >= FULL);
    }

    // Two bodies can't stand in the same place (but one can jump over the other).
    if (a.y < 50 && b.y < 50 && a.state !== 'down' && b.state !== 'down') {
      const [a0, a1] = a.body;
      const [b0, b1] = b.body;
      const depth = Math.min(a1, b1) - Math.max(a0, b0);
      if (depth > 0) {
        const dir = a.x <= b.x ? -1 : 1;
        a.x += (dir * depth) / 2;
        b.x -= (dir * depth) / 2;
      }
    }
    this.contain(a);
    this.contain(b);
    this.follow(a.x, b.x);
  }

  /** A hit arrives at `at`: blocked or taken, with its spark and sound. */
  private deliver(
    victim: Fighter,
    at: [number, number],
    fromX: number,
    damage: number,
    heavy: boolean,
    special: boolean,
    blocked: boolean,
    knock?: number,
  ): void {
    const dir = fromX <= victim.x ? 1 : -1;
    // In easy mode the computer's hits on the player are softer.
    if (this.o.easy && victim === this.f[0]) damage = Math.ceil(damage / 2);
    if (blocked) {
      victim.blockHit(damage, special, dir);
      this.hitEffect(at[0], at[1], heavy, true);
      sfx('block', 0.9);
    } else {
      victim.takeHit(damage, heavy, dir, knock);
      this.hitEffect(at[0], at[1], heavy);
      sfx(heavy ? 'hitHeavy' : 'hitLight', 0.9);
    }
  }

  /** Where these hit boxes touch a victim who can be hit, or null. */
  private touches(victim: Fighter, boxes: Box[]): [number, number] | null {
    return victim.canBeHit ? overlap(boxes, victim.boxes('hurt')) : null;
  }

  private strikes(attacker: Fighter, victim: Fighter): void {
    const special = attacker.state === 'special';
    const at = attacker.striking ? this.touches(victim, attacker.boxes('hit')) : null;
    if (at) {
      attacker.connected = true;
      const hits = special ? (attacker.special.hits ?? 1) : 1;
      const blocked = victim.guards(attacker.x);
      if (hits > 1) {
        // The first of several strikes: a light one that keeps the victim close. The rest follow in tick().
        const every = attacker.special.every!;
        this.combo = { attacker, victim, done: 1, at: this.t + every, blocked };
        // The move keeps going long enough for every strike.
        attacker.t = Math.min(attacker.t, attacker.special.active - (hits - 1) * every - 2);
        this.deliver(victim, at, attacker.x, share(attacker.power, hits, 0), false, true, blocked, 0.6);
      } else this.deliver(victim, at, attacker.x, attacker.power, attacker.heavy, special, blocked);
      if (special) attacker.landed = attacker.move;
      // Ordinary hits fill the power bar; the signature move it pays for doesn't.
      else attacker.gain(attacker.power * 1.4);
    }
    for (const w of this.waves) {
      if (w.owner !== attacker) continue;
      // A signature move lands once: if the swing itself has hit, the wave it threw fades out.
      if (attacker.landed === w.move) {
        w.life = Math.min(w.life, 8);
        continue;
      }
      const hit = this.touches(victim, this.waveBox(w));
      if (!hit) continue;
      this.deliver(victim, hit, w.x - w.dir, w.damage, true, true, victim.guards(w.x - w.dir));
      w.life = 0;
      attacker.landed = w.move;
      if (attacker.state === 'special' && attacker.move === w.move) attacker.connected = true;
    }
  }

  /** The later strikes of a signature move that hits several times: they can't miss. */
  private followUp(): void {
    const c = this.combo;
    if (!c) return;
    const sp = c.attacker.special;
    const hits = sp.hits!;
    if (c.attacker.state !== 'special' || c.victim.hp <= 0 || c.done >= hits) {
      this.combo = null;
      return;
    }
    if (this.t < c.at) return;
    const last = c.done === hits - 1;
    const at: [number, number] = [c.victim.x, GROUND_Y - c.victim.y - c.victim.art.height * 0.5];
    // Every strike but the last is a light one that keeps the victim in reach; the last sends them flying.
    this.deliver(
      c.victim,
      at,
      c.attacker.x,
      share(sp.damage, hits, c.done),
      last,
      true,
      c.blocked,
      last ? undefined : 0.6,
    );
    c.done++;
    c.at = this.t + sp.every!;
  }

  private finish(winner: 0 | 1 | null): void {
    this.phase = 'over';
    this.t = 0;
    this.winner = winner;
  }

  protected tick(): void {
    const [a, b] = this.f;
    const idle: [Pad, Pad] = [emptyPad(), emptyPad()];
    if (this.shout && ++this.shout.t > 70) this.shout = null;

    if (this.phase === 'intro') {
      this.stepFighters(idle);
      if (this.t === 5) voice(this.o.rounds > 1 ? `round${Math.min(this.round, 3)}` : 'ready');
      if (this.t === 100) {
        sfx('bell', 0.5);
        voice('fight');
      }
      if (this.t >= 140) {
        this.phase = 'fight';
        this.t = 0;
      }
    } else if (this.phase === 'fight') {
      this.stepFighters([pad(0), this.o.ai === null ? pad(1) : this.think(b, a)]);
      this.followUp();
      this.strikes(a, b);
      this.strikes(b, a);
      if (a.hp <= 0 || b.hp <= 0) {
        sfx('ko', 1);
        voice('ko');
        this.shake = 14;
        this.freeze = 18;
        this.finish(a.hp <= 0 && b.hp <= 0 ? null : a.hp <= 0 ? 1 : 0);
      } else if (this.t % 60 === 0 && --this.clock <= 0) {
        voice('timeUp');
        this.finish(a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1);
      }
    } else if (this.phase === 'over') {
      // The knockout plays out at half speed.
      if (this.t > 40 || this.t % 2 === 0) this.stepFighters(idle);
      if (this.t >= 90) {
        this.phase = 'result';
        this.t = 0;
        if (this.winner !== null) {
          this.wins[this.winner]++;
          this.f[this.winner].celebrate();
          sfx(`roar-${this.o.ids[this.winner]}`, 0.9);
        }
      }
    } else {
      this.stepFighters(idle);
      const matchWon = this.winner !== null && this.wins[this.winner] >= this.o.rounds;
      // The announcer: "Rex! ... Wins! ... Perfect!"
      if (this.winner === null) {
        if (this.t === 10) voice('draw');
      } else {
        if (this.t === 30) voice(`name-${this.o.ids[this.winner]}`);
        if (this.t === 75) voice('wins');
        if (this.t === 125 && this.f[this.winner].hp >= 100) voice('perfect');
      }
      if (this.t === 50 && matchWon) {
        void music(null);
        // Against the computer, losing gets the sad tune.
        sfx(this.o.ai !== null && this.winner === 1 ? 'lose' : 'win', 0.8);
      }
      if (this.t >= (matchWon ? 260 : 190)) {
        if (matchWon) this.o.done(this.winner!);
        else this.startRound();
      }
    }
  }

  protected paint(g: CanvasRenderingContext2D): void {
    const [a, b] = this.f;
    this.drawStage(g);
    // Whoever is attacking is drawn in front.
    const order = (b.attacking || b.state === 'special') && !a.attacking ? [a, b] : [b, a];
    for (const f of order) f.draw(g, this.view);
    this.drawEffects(g);
    this.debugBoxes(g, this.f);

    // Health, names, clock.
    healthBar(g, 14, 196, a.hp / 100, true);
    healthBar(g, W - 14 - 196, 196, b.hp / 100, false);
    panel(g, { x: W / 2 - 16, y: 12, w: 32, h: 20 }, '#000', '#ffd23a');
    text(g, 'KO', W / 2 + 1, 18, { align: 'center', color: '#ff3020', shadow: null });
    powerBar(g, 14, 43, a.meter, false, this.t);
    powerBar(g, W - 14 - 72, 43, b.meter, true, this.t);
    text(g, a.art.name, 16, 32, { color: '#ffd23a' });
    text(g, b.art.name, W - 16, 32, { color: '#ffd23a', align: 'right' });
    text(g, '1P', 16, 5);
    text(g, this.o.ai === null ? '2P' : 'CPU', W - 16, 5, { align: 'right' });
    text(g, String(Math.max(0, this.clock)).padStart(2, '0'), W / 2 + 1, 36, { size: 16, align: 'center' });
    for (let i = 0; i < this.o.rounds && this.o.rounds > 1; i++) {
      for (const side of [0, 1] as const) {
        const x = side === 0 ? W / 2 - 34 - i * 12 : W / 2 + 26 + i * 12;
        panel(g, { x, y: 34, w: 8, h: 8 }, i < this.wins[side] ? '#ffd23a' : '#222', '#fff');
      }
    }
    if (this.shout && this.shout.t % 8 < 6) {
      const left = this.shout.side === 0;
      text(g, `${this.shout.name}!`, left ? 16 : W - 16, 54, {
        align: left ? 'left' : 'right',
        color: '#fff',
        shadow: '#c8261c',
      });
    }

    if (this.phase === 'intro') {
      if (this.t < 100) this.banner(g, this.o.rounds > 1 ? `ROUND ${this.round}` : 'READY?');
      else this.banner(g, 'FIGHT!', '#ff5a36');
    } else if (this.phase === 'over') {
      this.banner(g, a.hp <= 0 || b.hp <= 0 ? 'K.O.' : 'TIME UP', '#ff5a36', 100, 32);
    } else if (this.phase === 'result') {
      if (this.winner === null) this.banner(g, 'DRAW');
      else {
        this.banner(g, `${this.f[this.winner].art.name} WINS`, '#ffd23a', 96);
        if (this.f[this.winner].hp >= 100 && this.t > 40) this.banner(g, 'PERFECT!', '#fff', 128, 16);
      }
    }
  }
}
