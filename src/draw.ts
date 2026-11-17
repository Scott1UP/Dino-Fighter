/** Drawing helpers shared by every screen. */
export const W = 480;
export const H = 270;

export const FONT = '"Press Start 2P"';

interface TextStyle {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  /** Colour of the hard drop shadow; null for none. */
  shadow?: string | null;
}

export function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, style: TextStyle = {}): void {
  const { size = 8, color = '#fff', align = 'left', shadow = '#000' } = style;
  g.font = `${size}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = 'top';
  x = Math.round(x);
  y = Math.round(y);
  if (shadow) {
    g.fillStyle = shadow;
    const d = Math.max(1, Math.round(size / 8));
    g.fillText(s, x + d, y + d);
  }
  g.fillStyle = color;
  g.fillText(s, x, y);
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const inside = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** A chunky bordered box, as used for buttons and frames. */
export function panel(g: CanvasRenderingContext2D, r: Rect, fill: string, border = '#fff'): void {
  g.fillStyle = '#000';
  g.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
  g.fillStyle = border;
  g.fillRect(r.x, r.y, r.w, r.h);
  g.fillStyle = fill;
  g.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
}

export function button(g: CanvasRenderingContext2D, r: Rect, label: string, hot: boolean, size = 8): void {
  panel(g, r, hot ? '#c8261c' : '#1a1f6e', hot ? '#ffd23a' : '#9aa4ff');
  text(g, label, r.x + r.w / 2, r.y + (r.h - size) / 2 + 1, { size, align: 'center', color: hot ? '#ffd23a' : '#fff' });
}

/** The deep blue backdrop of the menu screens. */
export function backdrop(g: CanvasRenderingContext2D): void {
  const bands = ['#00004a', '#000058', '#000066', '#000a78', '#00148a', '#001e9c'];
  const h = Math.ceil(H / bands.length);
  bands.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(0, i * h, W, h);
  });
}
