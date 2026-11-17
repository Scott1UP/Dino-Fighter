import '@fontsource/press-start-2p';
import './style.css';
import { loadArt } from './assets';
import { unlockAudio } from './audio';
import { FONT, H, text, W } from './draw';
import { game } from './game';
import { initInput } from './input';
import { title } from './menus';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const g = canvas.getContext('2d')!;
g.imageSmoothingEnabled = false;

text(g, 'LOADING...', W / 2, H / 2 - 4, { align: 'center' });
initInput();

canvas.addEventListener('pointerdown', (e) => {
  void unlockAudio();
  const r = canvas.getBoundingClientRect();
  game.scene?.tap?.(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H);
});
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  void unlockAudio();
  game.scene?.key?.(e.code);
});

await Promise.all([loadArt(), document.fonts.load(`8px ${FONT}`)]);
game.go(title());

// The game always advances in sixtieths of a second, however fast the display refreshes.
const TICK = 1000 / 60;
let last = performance.now();
let owed = 0;
function frame(now: number): void {
  owed = Math.min(owed + now - last, TICK * 5);
  last = now;
  while (owed >= TICK) {
    game.scene?.update();
    owed -= TICK;
  }
  g.imageSmoothingEnabled = false;
  game.scene?.draw(g);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
