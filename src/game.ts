/** The screen currently showing, and how screens hand over to each other. */
import { showPads } from './input';

export interface Scene {
  /** How many players' touch controls this screen needs. */
  pads?: 0 | 1 | 2;
  update(): void;
  draw(g: CanvasRenderingContext2D): void;
  /** A touch or click, in screen pixels (480 x 270). */
  tap?(x: number, y: number): void;
  key?(code: string): void;
}

export const game = {
  scene: null as Scene | null,
  /** Open the page with ?boxes to see every hit and hurt box drawn over the fight. */
  showBoxes: new URLSearchParams(location.search).has('boxes'),
  go(scene: Scene): void {
    this.scene = scene;
    showPads(scene.pads ?? 0);
  },
};
