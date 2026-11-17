/** Every screen that isn't a fight, and the order they come in. */
import { art, BOSSES, homeStage, PLAYABLE, STAGES } from './assets';
import { music, sfx, unlockAudio, voice } from './audio';
import { backdrop, button, H, inside, panel, type Rect, text, W } from './draw';
import { Bonus, LEVELS } from './bonus';
import { Match } from './fight';
import { game, type Scene } from './game';
import { bossesUnlocked, easyMode, setEasyMode, unlockBosses } from './settings';

type Mode = 'story' | 'versus' | 'bonus';

const CONFIRM = ['Enter', 'Space', 'KeyF', 'KeyK'];

const blink = (t: number, every = 30) => Math.floor(t / every) % 2 === 0;

/** A stage picture drifting slowly behind the title, darkened. */
function drifting(g: CanvasRenderingContext2D, t: number): void {
  const span = 768 - W;
  const x = (Math.sin(t / 400) * 0.5 + 0.5) * span;
  g.drawImage(art.stages.volcano, -Math.round(x), 0);
  g.fillStyle = 'rgb(0 0 40 / 0.45)';
  g.fillRect(0, 0, W, H);
}

function logo(g: CanvasRenderingContext2D, cx: number, y: number, width: number): number {
  const h = Math.round((art.logo.height / art.logo.width) * width);
  g.drawImage(art.logo, Math.round(cx - width / 2), y, width, h);
  return h;
}

class Title implements Scene {
  private t = 0;
  private readonly play: Rect = { x: W / 2 - 70, y: 212, w: 140, h: 36 };

  constructor() {
    void music('theme');
  }
  update(): void {
    this.t++;
  }
  draw(g: CanvasRenderingContext2D): void {
    drifting(g, this.t);
    const w = Math.min(art.logo.width, Math.round((190 * art.logo.width) / art.logo.height));
    logo(g, W / 2, 12 + Math.round(Math.sin(this.t / 40) * 2), w);
    button(g, this.play, 'PLAY', blink(this.t), 16);
  }
  private start(): void {
    void unlockAudio().then(() => {
      sfx('confirm');
      voice('title');
    });
    game.go(new Modes());
  }
  tap(x: number, y: number): void {
    // Only the PLAY button starts the game; a touch anywhere else just wakes the sound up.
    if (inside(this.play, x, y)) this.start();
  }
  key(code: string): void {
    if (CONFIRM.includes(code)) this.start();
  }
}

class Modes implements Scene {
  private t = 0;
  private at = 0;
  private readonly items: { label: string; mode: Mode; r: Rect }[] = (
    [
      ['1 PLAYER', 'story'],
      ['2 PLAYERS', 'versus'],
      ['BONUS STAGE', 'bonus'],
    ] as const
  ).map(([label, mode], i) => ({ label, mode, r: { x: W / 2 - 110, y: 118 + i * 40, w: 220, h: 32 } }));
  private readonly easy: Rect = { x: W / 2 - 110, y: 240, w: 220, h: 22 };

  constructor() {
    void music('theme');
  }
  update(): void {
    this.t++;
  }
  draw(g: CanvasRenderingContext2D): void {
    drifting(g, this.t);
    logo(g, W / 2, 8, Math.round((108 * art.logo.width) / art.logo.height));
    this.items.forEach((it, i) => button(g, it.r, it.label, i === this.at && blink(this.t, 20), 16));
    button(g, this.easy, `EASY MODE: ${easyMode() ? 'ON' : 'OFF'}`, easyMode());
  }
  private toggleEasy(): void {
    setEasyMode(!easyMode());
    sfx('tap');
  }
  private choose(i: number): void {
    sfx('confirm');
    game.go(new Select(this.items[i].mode));
  }
  tap(x: number, y: number): void {
    if (inside(this.easy, x, y)) return this.toggleEasy();
    const i = this.items.findIndex((it) => inside(it.r, x, y));
    if (i >= 0) this.choose(i);
  }
  key(code: string): void {
    const n = this.items.length;
    if (code === 'ArrowDown' || code === 'KeyS') this.at = (this.at + 1) % n;
    else if (code === 'ArrowUp' || code === 'KeyW') this.at = (this.at + n - 1) % n;
    else if (CONFIRM.includes(code)) return this.choose(this.at);
    else if (code === 'KeyE') return this.toggleEasy();
    else if (code === 'Escape') return game.go(new Title());
    else return;
    sfx('tap');
  }
}

// Character select: the big picture of your dinosaur on the left, a 4 x 2 grid of faces on the right.
const TILE = 56;
const GAP = 4;
const GRID = { x: 208, y: 58, cols: 4 };
const tileRect = (i: number): Rect => ({
  x: GRID.x + GAP + (i % GRID.cols) * (TILE + GAP),
  y: GRID.y + GAP + Math.floor(i / GRID.cols) * (TILE + GAP),
  w: TILE,
  h: TILE,
});

class Select implements Scene {
  private t = 0;
  /** The face the cursor is on: nothing until one is tapped. */
  private at: number | null = null;
  private picked: string[] = [];
  /** The last two places are the secret bosses: question marks until they are unlocked. */
  private readonly tiles: (string | null)[] = [...PLAYABLE, ...(bossesUnlocked() ? BOSSES : [null, null])];
  private readonly ok: Rect = { x: 300, y: 232, w: 156, h: 28 };
  private readonly back: Rect = { x: 208, y: 232, w: 84, h: 28 };

  constructor(private readonly mode: Mode) {
    void music('theme');
    voice('choose');
  }
  update(): void {
    this.t++;
  }
  private get player(): number {
    return this.picked.length + 1;
  }
  draw(g: CanvasRenderingContext2D): void {
    backdrop(g);
    logo(g, 96, 6, 168);
    const f = this.at === null ? null : art.fighters[this.tiles[this.at]!];
    panel(g, { x: 10, y: 94, w: 172, h: 172 }, '#000', '#9aa4ff');
    if (f) g.drawImage(f.big, 12, 96);
    else text(g, '?', 96, 148, { size: 64, align: 'center', color: '#2a308a' });

    text(
      g,
      this.mode === 'versus' ? `PLAYER ${this.player}` : this.mode === 'bonus' ? 'BONUS STAGE' : '1 PLAYER',
      332,
      14,
      {
        align: 'center',
        color: '#ffd23a',
      },
    );
    text(g, 'CHOOSE YOUR DINO', 332, 30, { align: 'center' });

    g.fillStyle = '#000';
    g.fillRect(GRID.x - 1, GRID.y - 1, GRID.cols * (TILE + GAP) + GAP + 2, 2 * (TILE + GAP) + GAP + 2);
    g.fillStyle = '#8890a8';
    g.fillRect(GRID.x, GRID.y, GRID.cols * (TILE + GAP) + GAP, 2 * (TILE + GAP) + GAP);
    this.tiles.forEach((tile, i) => {
      const r = tileRect(i);
      if (tile) g.drawImage(art.fighters[tile].small, r.x, r.y);
      else {
        g.fillStyle = '#0a0a2a';
        g.fillRect(r.x, r.y, r.w, r.h);
        text(g, '?', r.x + r.w / 2 + 1, r.y + 16, { size: 24, align: 'center', color: '#4a50a0' });
      }
      // A fighter player 1 has already taken stays marked.
      if (tile && this.picked[0] === tile) text(g, '1P', r.x + 3, r.y + 3, { color: '#7fd4ff' });
    });

    // The cursor: corner brackets and a label, blinking.
    if (this.at !== null && blink(this.t, 12)) {
      const r = tileRect(this.at);
      const c = this.player === 1 ? '#3c6cff' : '#ff4a3c';
      g.fillStyle = c;
      for (const [cx, cy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        const x = cx ? r.x + r.w - 10 : r.x - 2;
        const y = cy ? r.y + r.h - 1 : r.y - 2;
        g.fillRect(x, y, 12, 3);
        g.fillRect(cx ? r.x + r.w - 1 : r.x - 2, cy ? r.y + r.h - 10 : r.y - 2, 3, 12);
      }
      text(g, `${this.player}P`, r.x + r.w / 2, r.y - 12, { align: 'center', color: c });
    }

    button(g, this.back, 'BACK', false);
    if (f) {
      text(g, f.name, 332, 190, { size: 16, align: 'center', color: '#ffd23a' });
      text(g, f.species.toUpperCase(), 332, 212, { align: 'center' });
      // The confirm button only exists once a dinosaur is chosen.
      button(g, this.ok, 'OK!', blink(this.t, 20), 16);
    } else if (blink(this.t, 30)) text(g, 'TAP A DINO', 332, 198, { align: 'center' });
  }
  private choose(i: number): void {
    this.at = i;
    sfx('tap');
    // Only one roar at a time: moving on cuts the last one off.
    sfx(`roar-${this.tiles[i]}`, 0.7, 1, 'roar');
  }
  private confirm(): void {
    if (this.at === null) return;
    const id = this.tiles[this.at]!;
    sfx('confirm');
    voice(`name-${id}`);
    this.picked.push(id);
    this.at = null;
    if (this.mode === 'story') startStory(id);
    else if (this.mode === 'bonus') bonus(id, 0);
    else if (this.picked.length === 2) {
      const ids = this.picked as [string, string];
      game.go(new StageSelect((stage) => versus(ids, stage)));
    }
  }
  private goBack(): void {
    sfx('tap');
    if (this.at !== null) this.at = null;
    else if (this.picked.length) this.picked.pop();
    else game.go(new Modes());
  }
  tap(x: number, y: number): void {
    if (this.at !== null && inside(this.ok, x, y)) return this.confirm();
    if (inside(this.back, x, y)) return this.goBack();
    const i = this.tiles.findIndex((tile, n) => tile && inside(tileRect(n), x, y));
    if (i < 0) return;
    // One tap chooses a face; a second tap on it (or on OK) confirms.
    if (i === this.at) this.confirm();
    else this.choose(i);
  }
  key(code: string): void {
    const n = this.tiles.filter(Boolean).length;
    if (CONFIRM.includes(code)) return this.confirm();
    if (code === 'Escape') return this.goBack();
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(code)) return;
    const at = this.at;
    let to: number;
    if (at === null) to = 0;
    else if (code === 'ArrowRight' || code === 'KeyD') to = (at + 1) % n;
    else if (code === 'ArrowLeft' || code === 'KeyA') to = (at + n - 1) % n;
    else to = at < GRID.cols ? at + GRID.cols : at - GRID.cols;
    if (to < n) this.choose(to);
  }
}

// Stage select: a 4 x 2 grid of small pictures. The bosses' stages stay hidden until they are unlocked.
const THUMB = { w: 108, h: 61 };
const thumbRect = (i: number): Rect => ({ x: 12 + (i % 4) * 116, y: 62 + Math.floor(i / 4) * 100, ...THUMB });

class StageSelect implements Scene {
  private t = 0;
  private at = 0;
  private readonly open = STAGES.filter((s) => bossesUnlocked() || !BOSSES.includes(s.home));

  constructor(private readonly chosen: (stage: string) => void) {}
  update(): void {
    this.t++;
  }
  draw(g: CanvasRenderingContext2D): void {
    backdrop(g);
    text(g, 'CHOOSE A STAGE', W / 2, 22, { size: 16, align: 'center', color: '#ffd23a' });
    STAGES.forEach((s, i) => {
      const r = thumbRect(i);
      const here = i === this.at;
      const known = this.open.includes(s);
      panel(
        g,
        { x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 },
        '#0a0a2a',
        here && blink(this.t, 12) ? '#ffd23a' : '#9aa4ff',
      );
      if (known) g.drawImage(art.stages[s.id], 144, 0, 480, 270, r.x, r.y, r.w, r.h);
      else text(g, '?', r.x + r.w / 2 + 1, r.y + 18, { size: 24, align: 'center', color: '#4a50a0' });
      if (known) text(g, s.name, r.x + r.w / 2, r.y + r.h + 8, { align: 'center', color: here ? '#ffd23a' : '#fff' });
    });
  }
  private choose(i: number): void {
    if (i >= this.open.length) return;
    sfx('confirm');
    this.chosen(this.open[i].id);
  }
  tap(x: number, y: number): void {
    const i = STAGES.findIndex((_, n) => inside(thumbRect(n), x, y));
    if (i >= 0) this.choose(i);
  }
  key(code: string): void {
    const n = this.open.length;
    if (code === 'ArrowRight' || code === 'KeyD') this.at = (this.at + 1) % n;
    else if (code === 'ArrowLeft' || code === 'KeyA') this.at = (this.at + n - 1) % n;
    else if (['ArrowDown', 'ArrowUp', 'KeyW', 'KeyS'].includes(code)) {
      const other = this.at < 4 ? this.at + 4 : this.at - 4;
      if (other < n) this.at = other;
    } else if (CONFIRM.includes(code)) return this.choose(this.at);
    else return;
    sfx('tap');
  }
}

/** The two fighters face to face before a fight. */
class Versus implements Scene {
  private t = 0;
  constructor(
    private readonly ids: [string, string],
    private readonly label: string,
    private readonly next: () => void,
    /** An announcer line for this screen, instead of the two names. */
    private readonly say?: string,
  ) {
    void music(null);
  }
  update(): void {
    this.t++;
    if (this.t === 20) sfx(`roar-${this.ids[0]}`, 0.8);
    if (this.t === 80) sfx(`roar-${this.ids[1]}`, 0.8);
    if (this.t === 30) voice(this.say ?? `name-${this.ids[0]}`);
    if (this.t === 75 && !this.say) voice('versus');
    if (this.t === 120 && !this.say) voice(`name-${this.ids[1]}`);
    if (this.t >= 190) this.next();
  }
  draw(g: CanvasRenderingContext2D): void {
    backdrop(g);
    const [a, b] = this.ids.map((id) => art.fighters[id]);
    text(g, this.label, W / 2, 12, { align: 'center', color: '#ffd23a' });
    // Each slides in from its own side.
    const slide = Math.max(0, 20 - this.t) * 12;
    panel(g, { x: 18 - slide, y: 34, w: 172, h: 172 }, '#000', '#3c6cff');
    g.drawImage(a.big, 20 - slide, 36);
    panel(g, { x: W - 190 + slide, y: 34, w: 172, h: 172 }, '#000', '#ff4a3c');
    g.save();
    g.translate(W - 20 + slide, 36);
    g.scale(-1, 1);
    g.drawImage(b.big, 0, 0);
    g.restore();
    if (this.t > 20) text(g, 'VS', W / 2 + 2, 104, { size: 32, align: 'center', color: '#ff5a36', shadow: '#000' });
    text(g, a.name, 104, 216, { size: 16, align: 'center' });
    text(g, b.name, W - 104, 216, { size: 16, align: 'center' });
    text(g, a.species.toUpperCase(), 104, 240, { align: 'center', color: '#9aa4ff' });
    text(g, b.species.toUpperCase(), W - 104, 240, { align: 'center', color: '#9aa4ff' });
  }
  tap(): void {
    if (this.t > 30) this.next();
  }
  key(code: string): void {
    if (CONFIRM.includes(code)) this.tap();
  }
}

/** A picture of a fighter, a headline and one or two buttons: used after fights. */
class Card implements Scene {
  private t = 0;
  private readonly rects: Rect[];
  constructor(
    private readonly id: string,
    private readonly lines: string[],
    private readonly buttons: { label: string; go(): void }[],
  ) {
    this.rects = buttons.map((_, i) => ({ x: 204, y: 170 + i * 44, w: 256, h: 34 }));
  }
  update(): void {
    this.t++;
  }
  draw(g: CanvasRenderingContext2D): void {
    backdrop(g);
    panel(g, { x: 18, y: 49, w: 172, h: 172 }, '#000', '#ffd23a');
    g.drawImage(art.fighters[this.id].big, 20, 51);
    this.lines.forEach((line, i) =>
      text(g, line, 332, 56 + i * 28, { size: i === 0 ? 16 : 8, align: 'center', color: i === 0 ? '#ffd23a' : '#fff' }),
    );
    this.buttons.forEach((b, i) => button(g, this.rects[i], b.label, i === 0 && blink(this.t, 20), 16));
  }
  tap(x: number, y: number): void {
    const i = this.rects.findIndex((r) => inside(r, x, y));
    if (i < 0 || this.t < 30) return;
    sfx('confirm');
    this.buttons[i].go();
  }
  key(code: string): void {
    if (CONFIRM.includes(code) && this.t >= 30) {
      sfx('confirm');
      this.buttons[0].go();
    } else if (code === 'Escape') this.buttons[this.buttons.length - 1].go();
  }
}

const menu = (): void => game.go(new Modes());
const toMenu = { label: 'MENU', go: menu };

/** Two players: first to win two rounds. */
function versus(ids: [string, string], stage: string): void {
  game.go(
    new Versus(ids, '2 PLAYER BATTLE', () =>
      game.go(
        new Match({
          ids,
          stage,
          ai: null,
          rounds: 2,
          quit: menu,
          done: (winner) =>
            game.go(
              new Card(
                ids[winner],
                [`PLAYER ${winner + 1} WINS!`, `${art.fighters[ids[winner]].name} IS THE WINNER`],
                [{ label: 'REMATCH', go: () => versus(ids, stage) }, toMenu],
              ),
            ),
        }),
      ),
    ),
  );
}

/** A moment before a bonus stage: your dinosaur, the stage behind it, and what there is to smash. */
class BonusPreview implements Scene {
  private t = 0;
  constructor(
    private readonly id: string,
    private readonly level: number,
    private readonly next: () => void,
    private readonly unnumbered = false,
  ) {
    void music(null);
  }
  update(): void {
    if (++this.t >= 190) this.next();
  }
  draw(g: CanvasRenderingContext2D): void {
    const level = LEVELS[this.level];
    g.drawImage(art.stages[level.stage], -144, 0);
    g.fillStyle = 'rgb(0 0 40 / 0.6)';
    g.fillRect(0, 0, W, H);
    // The fighter slides in from the left, the thing to smash from the right.
    const slide = Math.max(0, 20 - this.t) * 12;
    panel(g, { x: 18 - slide, y: 49, w: 172, h: 172 }, '#000', '#ffd23a');
    g.drawImage(art.fighters[this.id].big, 20 - slide, 51);
    text(g, this.unnumbered ? 'BONUS STAGE' : `BONUS STAGE ${this.level + 1}`, 332, 40, {
      size: 16,
      align: 'center',
      color: '#ffd23a',
    });
    const look = art.objects[level.object];
    g.drawImage(
      look.img,
      0,
      0,
      look.cellW,
      look.cellH,
      Math.round(332 - look.cellW / 2) + slide,
      196 - look.cellH,
      look.cellW,
      look.cellH,
    );
    if (this.t > 20 && blink(this.t, 20)) text(g, level.intro, 332, 212, { align: 'center' });
  }
  tap(): void {
    if (this.t > 30) this.next();
  }
  key(code: string): void {
    if (CONFIRM.includes(code)) this.tap();
  }
}

/** The bonus stages, one after another, each with its preview. A failed one can be tried again as often as you like. */
function bonus(id: string, level: number): void {
  const play = (): void =>
    game.go(
      new Bonus({
        id,
        level,
        quit: menu,
        retry: play,
        next: () => {
          if (level + 1 < LEVELS.length) return bonus(id, level + 1);
          sfx(`roar-${id}`);
          game.go(
            new Card(id, ['SMASHING!', `${art.fighters[id].name} BROKE EVERYTHING`], [{ label: 'HOORAY!', go: menu }]),
          );
        },
      }),
    );
  game.go(new BonusPreview(id, level, play));
}

/** A bonus stage in the middle of the story: win or lose, the story carries on afterwards. */
function interlude(id: string, level: number, then: () => void): void {
  const play = (): void =>
    game.go(
      new Bonus({
        id,
        level,
        unnumbered: true,
        quit: menu,
        retry: play,
        next: then,
        giveUp: { label: 'CARRY ON', go: then },
      }),
    );
  game.go(new BonusPreview(id, level, play, true));
}

/**
 * One player: beat the six ordinary dinosaurs in a random order (your own double last of them),
 * then the two secret bosses, each on its own home stage, with a bonus stage after the third and
 * sixth wins. Each fight is a single round, and a lost fight can be tried again for ever.
 */
function startStory(player: string): void {
  const others = PLAYABLE.filter((id) => id !== player);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const ladder = [...others, ...(PLAYABLE.includes(player) ? [player] : []), ...BOSSES];

  // Two different bonus stages, picked at random.
  const breaks = LEVELS.map((_, i) => i).sort(() => Math.random() - 0.5);

  const champion = (): void => {
    sfx(`roar-${player}`);
    voice('champion');
    game.go(
      new Card(
        player,
        ['CHAMPION!', `${art.fighters[player].name} IS THE`, 'GREATEST DINO FIGHTER'],
        [{ label: 'HOORAY!', go: () => game.go(new Title()) }],
      ),
    );
  };

  const fight = (n: number): void => {
    const foe = ladder[n];
    const onwards = (): void => (n + 1 < ladder.length ? fight(n + 1) : champion());
    const after = (): void => (n === 2 || n === 5 ? interlude(player, breaks[n === 2 ? 0 : 1], onwards) : onwards());
    const label =
      n === ladder.length - 1
        ? 'THE FINAL BOSS!'
        : n === ladder.length - 2
          ? 'A SECRET CHALLENGER!'
          : `FIGHT ${n + 1} OF ${ladder.length}`;
    game.go(
      new Versus(
        [player, foe],
        label,
        () =>
          game.go(
            new Match({
              ids: [player, foe],
              stage: homeStage(foe),
              ai: n,
              rounds: 1,
              easy: easyMode(),
              quit: menu,
              done: (winner) => {
                if (winner === 1) {
                  game.go(
                    new Card(
                      foe,
                      ['SO CLOSE!', `${art.fighters[foe].name} WON THIS TIME`],
                      [{ label: 'TRY AGAIN', go: () => fight(n) }, toMenu],
                    ),
                  );
                } else if (BOSSES.includes(foe) && !bossesUnlocked()) {
                  unlockBosses();
                  void music(null);
                  sfx('win', 0.8);
                  voice('unlocked');
                  game.go(
                    new Card(
                      foe,
                      ['UNLOCKED!', BOSSES.map((b) => art.fighters[b].name).join(' AND '), 'CAN NOW BE CHOSEN'],
                      [{ label: 'OK!', go: after }],
                    ),
                  );
                } else after();
              },
            }),
          ),
        n === ladder.length - 1 ? 'finalBoss' : n === ladder.length - 2 ? 'secret' : undefined,
      ),
    );
  };
  fight(0);
}

export const title = (): Scene => new Title();
