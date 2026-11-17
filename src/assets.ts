/** Loads the packed art (see scripts/sprites.mjs). */

/** [x0, y0, x1, y1], measured from a frame's anchor: x to the right, y from the ground (negative is up). */
export type Box = [number, number, number, number];

export interface Frame {
  /** The outline of the animal in this frame: where it can be hit. */
  hurt: Box[];
  /** On the two striking frames, the part of the outline that does the hitting. */
  hit?: Box[];
  /** On the striking frames, how far forward of the anchor the strike reaches. */
  reach?: number;
}

export interface FighterArt {
  id: string;
  name: string;
  species: string;
  cellW: number;
  cellH: number;
  height: number;
  /** The solid body, from and to, either side of the anchor. */
  body: [number, number];
  poses: string[];
  frames: Record<string, Frame>;
  img: HTMLImageElement;
  big: HTMLImageElement;
  small: HTMLImageElement;
}

/** Something to smash on a bonus stage, drawn in four states of damage: 0 whole ... 3 wrecked. */
export interface ObjectArt {
  cellW: number;
  cellH: number;
  frames: { hurt: Box[] }[];
  img: HTMLImageElement;
}

export const PLAYABLE = ['rex', 'trike', 'stego', 'raptor', 'ankylo', 'pachy'];
export const BOSSES = ['spino', 'giga'];
export const OBJECTS = ['truck', 'barrel', 'meteor', 'statue', 'egg'];

/** Every fighter has a home stage. */
export const STAGES = [
  { id: 'volcano', name: 'LAVA RIDGE', home: 'rex' },
  { id: 'jungle', name: 'JUNGLE TEMPLE', home: 'trike' },
  { id: 'meadow', name: 'FERN VALLEY', home: 'stego' },
  { id: 'dojo', name: 'MOONLIT DOJO', home: 'raptor' },
  { id: 'boneyard', name: 'BONE CANYON', home: 'ankylo' },
  { id: 'peak', name: 'THUNDER PEAK', home: 'pachy' },
  { id: 'cove', name: 'TIDAL COVE', home: 'spino' },
  { id: 'crater', name: 'TITAN CRATER', home: 'giga' },
];
export const BONUS_STAGE = 'beach';
export const homeStage = (fighter: string): string => STAGES.find((s) => s.home === fighter)!.id;

const base = import.meta.env.BASE_URL;

function image(file: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${file}`));
    img.src = `${base}sprites/${file}`;
  });
}

const json = async <T>(file: string): Promise<T> => (await fetch(`${base}sprites/${file}`)).json();

export const art = {
  fighters: {} as Record<string, FighterArt>,
  stages: {} as Record<string, HTMLImageElement>,
  objects: {} as Record<string, ObjectArt>,
  logo: null as unknown as HTMLImageElement,
};

export async function loadArt(): Promise<void> {
  await Promise.all([
    ...[...PLAYABLE, ...BOSSES].map(async (id) => {
      const [data, img, big, small] = await Promise.all([
        json<Omit<FighterArt, 'img' | 'big' | 'small'>>(`${id}.json`),
        image(`${id}.png`),
        image(`portrait-${id}-big.png`),
        image(`portrait-${id}-small.png`),
      ]);
      art.fighters[id] = { ...data, img, big, small };
    }),
    ...[...STAGES.map((s) => s.id), BONUS_STAGE].map(async (id) => {
      art.stages[id] = await image(`stage-${id}.png`);
    }),
    ...OBJECTS.map(async (id) => {
      const [data, img] = await Promise.all([json<Omit<ObjectArt, 'img'>>(`obj-${id}.json`), image(`obj-${id}.png`)]);
      art.objects[id] = { ...data, img };
    }),
    (async () => {
      art.logo = await image('logo.png');
    })(),
  ]);
}
