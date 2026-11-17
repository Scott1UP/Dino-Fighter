/** Things remembered between visits, in the browser's local storage. */
const read = (key: string): boolean => {
  try {
    return localStorage.getItem(`dino-fighter:${key}`) === '1';
  } catch {
    return false;
  }
};
const write = (key: string, on: boolean): void => {
  try {
    localStorage.setItem(`dino-fighter:${key}`, on ? '1' : '0');
  } catch {
    // Private browsing: nothing is remembered.
  }
};

/** Beating either secret boss in the story makes both of them playable, for good. */
export const bossesUnlocked = (): boolean => read('bosses-unlocked');
export const unlockBosses = (): void => write('bosses-unlocked', true);

/**
 * Easy mode, for the youngest players: the computer is slower, never blocks, and its hits do half
 * damage; bonus stages get half as much time again.
 */
let easy = read('easy');
export const easyMode = (): boolean => easy;
export function setEasyMode(on: boolean): void {
  easy = on;
  write('easy', on);
}
