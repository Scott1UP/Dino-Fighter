// Art pipeline: fighters, portraits, stages, the bonus-stage objects and the logo.
// Run through npm so the API key is loaded:
//
//   npm run sprites -- all             generate whatever is missing, then pack everything
//   npm run sprites -- ref rex         draw the design reference for one fighter (its ready stance)
//   npm run sprites -- tweak rex "..." redraw the reference with one change, keeping the rest
//   npm run sprites -- sheet rex       draw the 12-pose animation sheet from that reference
//   npm run sprites -- extra rex       draw the second sheet: block, charging up, and the signature move
//   npm run sprites -- portrait rex    draw the character-select portrait from that reference
//   npm run sprites -- stage volcano   draw one stage background
//   npm run sprites -- object barrel   draw one bonus-stage object in its four states of damage
//   npm run sprites -- logo            draw the title logo
//   npm run sprites -- pack            re-pack everything from art/raw/ (free: no generation)
//
// Raw model output is kept in art/raw/. Packing reduces it to real game pixels and writes
// public/sprites/. For fighters it also measures every frame's outline, so the game's hit and
// hurt boxes are the drawn shape of the dinosaur, not a guess.

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'art', 'raw');
const OUT = path.join(ROOT, 'public', 'sprites');

const MODEL = process.env.SPRITE_MODEL ?? 'gpt-image-2.6-sunburst';
const QUALITY = process.env.SPRITE_QUALITY ?? 'high';

const PIXEL_ART = [
  'Style: early-1990s 16-bit arcade one-on-one fighting video game.',
  'Hand-drawn pixel art: crisp hard-edged pixels, a limited colour palette, dark outlines, bold shading',
  'in a few flat tones with strong highlights and deep shadows.',
].join(' ');

const STYLE = [
  PIXEL_ART,
  'The character is halfway between a realistic dinosaur and a cartoon: believable anatomy, a powerful',
  'muscular build, a slightly bigger head and a confident expressive eye. It stands upright on its hind legs',
  'like a martial artist and wears martial-arts gear: a karate headband tied round its forehead with two',
  'long ends trailing behind, white cloth wraps round its wrists and ankles, and a belt knotted round its waist.',
  'An original character design that does not resemble any existing video game, film or cartoon character.',
  'Friendly enough for a young child: determined and heroic, never scary, no blood.',
  'Fully transparent background. No ground, no cast shadow, no text, no border, no extra objects.',
].join(' ');

/**
 * The cast. `height` is how tall the ready stance is drawn in the game, in game pixels (the screen
 * is 270 tall). `head` and `tail` describe the two attacks, each fitted to the animal's anatomy,
 * and `special` its signature move.
 */
export const FIGHTERS = {
  rex: {
    name: 'REX',
    species: 'Tyrannosaurus',
    height: 122,
    design:
      'A tyrannosaurus rex: forest green with darker green stripes down its back and tail, a sandy tan belly ' +
      'and throat, a big square jaw with a row of white teeth, small two-fingered arms held up like a boxer, ' +
      'thick powerful legs and a long heavy tail. Red headband, black belt.',
    head: 'a big chomping bite: it lunges forwards with its neck stretched out and its huge jaws wide open',
    tail: 'its long heavy tail swept round low along the ground',
    special:
      'a giant chomp: body stretched out low and level, lunging forwards, its enormous jaws opened as wide as they can go',
  },
  trike: {
    name: 'TRIXIE',
    species: 'Triceratops',
    height: 112,
    design:
      'A triceratops: dusty rose-purple with a cream belly, a big round bony neck frill edged in cream studs, ' +
      'two long cream brow horns, a short nose horn and a parrot-like beak, a stocky barrel chest, thick arms ' +
      'with fists raised, sturdy legs and a short thick tail. Yellow headband tied below the horns, blue belt.',
    head: 'a horn charge: head lowered, it drives its two long brow horns straight forwards',
    tail: 'its short thick tail swung round low along the ground',
    special:
      'a horn charge at full gallop: body level, head down, running flat out with its two long brow horns pointing straight forwards',
  },
  stego: {
    name: 'SPIKE',
    species: 'Stegosaurus',
    height: 114,
    design:
      'A stegosaurus: warm orange with a pale cream belly, a double row of big teal diamond-shaped plates ' +
      'running down its back, a small narrow head with a beak, strong arms with fists raised, sturdy legs and a ' +
      'long muscular tail ending in four long cream spikes. Purple headband, white belt.',
    head: 'a headbutt jab: it thrusts its small beaked head and one fist straight forwards',
    tail: 'its long spiked tail whipped round low along the ground, the four cream spikes leading',
    special:
      'a spinning tail strike: body twisted round in mid-spin, its long spiked tail whipped out level at chest height to the RIGHT, the four cream spikes leading',
  },
  raptor: {
    name: 'ZIP',
    species: 'Velociraptor',
    height: 100,
    design:
      'A velociraptor: slim and wiry, sandy yellow with brown bands across its back, a crest of orange ' +
      'feathers on its head and short orange feathers along its forearms, a long narrow snout, long clawed ' +
      'hands held up in a kung-fu guard, a big curved sickle claw on each foot and a long stiff tail. ' +
      'Green headband, green belt.',
    head: 'a snapping claw strike: it darts forwards, snout and both clawed hands thrust out in front',
    tail: 'its long stiff tail whipped round low along the ground',
    special:
      'a flying pounce: in mid-air, leaping forwards, both feet thrust out in front with the big sickle claws leading, arms spread, mouth open',
  },
  ankylo: {
    name: 'TANK',
    species: 'Ankylosaurus',
    height: 102,
    design:
      'An ankylosaurus: broad, squat and heavily armoured, slate blue-grey with a pale belly, its back covered ' +
      'in rows of rounded bony armour plates with short spikes along the sides, a wide flat armoured head with ' +
      'two small horns at the back, thick short arms with fists raised, stumpy strong legs and a long tail ' +
      'ending in a big round bone club. Orange headband, brown belt.',
    head: 'a shoulder barge: head tucked down, it rams its wide armoured head and shoulder forwards',
    tail: 'its long tail swung round low along the ground, the big round bone club leading',
    special:
      'a club slam: its long tail arched right over its back and brought down in front of it, the big round bone club smashing onto the ground to the RIGHT of its feet',
  },
  pachy: {
    name: 'BONK',
    species: 'Pachycephalosaurus',
    height: 108,
    design:
      'A pachycephalosaurus: athletic and upright, chestnut brown with a tan belly and darker spots on its ' +
      'back, a tall smooth thick dome of pale bone on top of its skull ringed with small knobbly bumps, a ' +
      'short snout, lean arms held up like a boxer, long springy legs and a long tail. White headband tied ' +
      'under the dome, red belt.',
    head: 'a flying headbutt: body stretched out level, it rams the bony dome of its skull straight forwards',
    tail: 'its long tail swept round low along the ground',
    special:
      'a rocket headbutt: flying through the air perfectly level like a missile, arms swept back along its sides, the bony dome of its skull leading',
  },
  spino: {
    name: 'RIPTIDE',
    species: 'Spinosaurus',
    height: 134,
    design:
      'A spinosaurus: tall and imposing, deep ocean blue with a pale grey belly, a huge crimson-and-gold ' +
      'striped sail standing up along its back, a long narrow crocodile-like snout with many small teeth, long ' +
      'strong arms with three big claws held up in a guard, and a long tall paddle-shaped tail. Black headband, ' +
      'gold belt.',
    head: 'a snapping lunge: it shoots its long crocodile-like jaws straight forwards, mouth open',
    tail: 'its long paddle-shaped tail swept round low along the ground',
    special:
      'a wave-throwing tail sweep: body turned, its long paddle-shaped tail swung upwards and forwards in a big scooping arc to the RIGHT, as if flinging water',
  },
  giga: {
    name: 'TITAN',
    species: 'Giganotosaurus',
    height: 142,
    design:
      'A giganotosaurus, the final champion: enormous and broad-chested, charcoal black with glowing ' +
      'ember-red stripes down its back and a dark grey belly, a long heavy skull with low ridged crests over ' +
      'the eyes and big teeth, strong three-fingered arms held up like a boxer, a scar-free proud face, massive ' +
      'legs and a long thick tail. Purple headband with ragged ends, gold belt and gold wrist cuffs instead ' +
      'of cloth wraps.',
    head: 'a huge chomping bite: it lunges forwards with its neck stretched out and its enormous jaws wide open',
    tail: 'its long thick tail swept round low along the ground',
    special:
      'a giant stomp: leaping in mid-air with one huge foot raised high and about to slam down, both fists raised above its head, roaring',
  },
};

/** The poses on an animation sheet, in reading order (3 columns x 4 rows). */
export const POSES = ['idle1', 'idle2', 'walk1', 'walk2', 'jump', 'headWind', 'headHit', 'tailWind', 'tailHit', 'hurt', 'down', 'win'];
const COLS = 3;
const poseText = (f) => [
  'the ready fighting stance, exactly as in the reference image',
  'the same ready stance, sunk a little lower with knees more bent and fists a little higher (breathing)',
  'walking forwards, mid-stride, the near leg stepping forward',
  'walking forwards, mid-stride, the far leg stepping forward',
  'jumping: in mid-air, both legs tucked up under the body, tail lifted, arms up',
  'winding up a head attack: leaning back, head and shoulders pulled back, about to spring forwards',
  `the head attack at full stretch: ${f.head}, reaching as far to the RIGHT as it can`,
  'winding up a tail attack: crouched and twisting its body round, tail coiled back behind it',
  `the tail attack at full stretch: crouched low and spun round, ${f.tail}, the tail reaching far out to ` +
    'the RIGHT past its own body, towards the opponent',
  'being hit: knocked backwards off balance, head snapped back, eyes squeezed shut, mouth open in surprise',
  'knocked out: lying flat on its back on the ground, belly up, legs in the air, tongue out, dazed and comical, not injured',
  'victory: standing tall and proud, head thrown back roaring at the sky, one fist punched high in the air',
];

/** Stage backgrounds: one home stage per fighter, plus the dock. */
export const STAGES = {
  volcano: {
    scene:
      'a rocky ridge at dusk in front of a huge erupting volcano: glowing rivers of lava run down distant ' +
      'slopes, an orange and purple sky full of ash clouds, pterosaurs gliding far away, giant ferns and ' +
      'cycads at the sides. The floor is cracked dark basalt with thin glowing seams.',
  },
  jungle: {
    scene:
      'a clearing in a lush prehistoric jungle in bright daylight: an ancient mossy stone temple carved with ' +
      'dinosaur faces, a tall waterfall behind it, huge tree ferns and hanging vines, a few friendly ' +
      'long-necked dinosaurs watching from far in the background. The floor is worn square stone paving ' +
      'with moss in the cracks.',
  },
  boneyard: {
    scene:
      'a desert canyon at golden sunset: towering red rock walls and mesas, the gigantic fossil ribcage and ' +
      'skull of a long-dead sauropod arching across the background, cacti-like prehistoric plants, dust in ' +
      'the warm light, a big setting sun. The floor is packed sand scattered with a few small bones.',
  },
  meadow: {
    scene:
      'a wide green valley at dawn: rolling meadows of ferns and horsetails, a calm winding river, giant ' +
      'redwood trees at the sides, a herd of plated stegosaurs grazing far away, soft pink and gold morning ' +
      'sky with low mist, snow-capped mountains on the horizon. The floor is short trampled grass and earth.',
  },
  dojo: {
    scene:
      'the courtyard of a prehistoric martial-arts dojo at night under a huge full moon: a wooden training ' +
      'hall with a curved roof decorated with carved raptor claws, glowing paper lanterns on poles, tall ' +
      'bamboo-like horsetail plants, wooden training posts, fireflies, a starry deep blue sky. The floor is ' +
      'smooth wooden boards.',
  },
  peak: {
    scene:
      'a high windswept mountain plateau above the clouds: jagged grey peaks dusted with snow, dark storm ' +
      'clouds with a few bolts of lightning far away, tattered prayer flags strung between stone cairns, ' +
      'two rams-horn shaped rock pillars, a sea of clouds below. The floor is flat grey rock slabs.',
  },
  cove: {
    scene:
      'a hidden sea cove at high tide on a stormy afternoon: tall dark cliffs with waterfalls pouring into a ' +
      'teal lagoon, crashing waves and spray, a wrecked wooden fishing raft, giant ammonite shells on the ' +
      'rocks, sail-backed dinosaurs swimming far out, grey-blue rain clouds with shafts of light. The floor ' +
      'is wet dark sand with shells and small tide pools.',
  },
  crater: {
    scene:
      'a champion\'s arena inside a gigantic meteor crater at night: a ring of towering fossil bones and ' +
      'tusks around the rim with burning torches on them, a crowd of dinosaur silhouettes watching from the ' +
      'crater walls, shooting stars and a meteor shower streaking across a purple starry sky, a glowing ' +
      'comet. The floor is flat scorched stone with a faint painted circle.',
  },
  beach: {
    scene:
      'a wooden jetty on a tropical prehistoric coast on a sunny day: deep blue sea with small waves behind, ' +
      'white clouds on the horizon, a jungle-covered island with a volcano far away, palm trees at the ' +
      'sides, a little wooden ranger hut at the far left. The floor is wide sun-bleached wooden planks.',
  },
};

/**
 * Things to smash on the bonus stages. Each is drawn four times, more broken each time. `size` is
 * how big the unbroken one is in game pixels, measured along `axis`.
 */
export const OBJECTS = {
  truck: {
    size: 170,
    axis: 'w',
    what:
      'a boxy old open-top safari park ranger truck, olive green with a cream stripe, chunky off-road tyres, ' +
      'a spare wheel on the back and a roll bar, facing left',
    states: [
      'brand new and shiny',
      'dented bonnet and doors, a cracked windscreen, one headlight hanging',
      'badly battered, bodywork crumpled, bonnet popped open, roll bar bent, windscreen gone',
      'a completely flattened, crumpled wreck sagging on its wheels with the bonnet and doors fallen off',
    ],
  },
  barrel: {
    size: 58,
    axis: 'h',
    what: 'a big fat wooden barrel standing upright, warm brown staves held by three dark iron hoops',
    states: [
      'whole and sturdy',
      'two staves cracked and splintered, the top hoop slipped down crooked',
      'half smashed: one side caved in, staves splayed outwards, only one hoop still on',
      'a low heap of broken planks, splinters and bent hoops on the ground',
    ],
  },
  meteor: {
    size: 120,
    axis: 'w',
    what: 'a big round fallen meteorite boulder of dark pitted grey rock with thin glowing blue veins',
    states: [
      'whole',
      'covered in wide glowing blue cracks, a few chips knocked off',
      'split open, big chunks fallen away to show a core of large bright blue crystals inside',
      'a low heap of rubble with a cluster of big sparkling blue crystals standing in the middle',
    ],
  },
  statue: {
    size: 98,
    axis: 'h',
    what:
      'an ancient mossy stone statue of a roaring T-rex head and shoulders on a square carved stone plinth, facing left',
    states: [
      'whole and proud',
      'cracked all over, two teeth and a chunk of the snout broken off',
      'half crumbled: the top of the head and the jaw gone, big pieces lying round the plinth',
      'just the cracked plinth under a heap of stone rubble',
    ],
  },
  egg: {
    size: 92,
    axis: 'h',
    what:
      'a giant cream dinosaur egg with big teal speckles, standing upright in a round nest of twigs and leaves',
    states: [
      'whole and smooth',
      'a few zig-zag cracks across the shell',
      'big cracks and one piece of shell fallen away, with two cute round eyes peeking out of the dark hole',
      'hatched: the top of the shell gone, and a cute happy green baby dinosaur sitting up in the bottom ' +
        'half of the shell with its little arms in the air and a piece of shell on its head',
    ],
  },
};

const exists = (p) => access(p).then(() => true, () => false);

async function openai(endpoint, body) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set (put it in .env.local)');
  const isForm = body instanceof FormData;
  const res = await fetch(`https://api.openai.com/v1/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, ...(isForm ? {} : { 'Content-Type': 'application/json' }) },
    body: isForm ? body : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${json.error?.message ?? JSON.stringify(json)}`);
  return Buffer.from(json.data[0].b64_json, 'base64');
}

/** Find the separate drawings on a transparent sheet. Returns bounding boxes. */
function findBlobs(data, width, height, minFrac = 0.25) {
  const ALPHA = 40;
  const label = new Int32Array(width * height).fill(-1);
  const blobs = [];
  const stack = [];
  for (let start = 0; start < width * height; start++) {
    if (label[start] !== -1 || data[start * 4 + 3] <= ALPHA) continue;
    const id = blobs.length;
    const b = { x0: width, y0: height, x1: 0, y1: 0, area: 0, ids: [id] };
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop();
      const x = p % width;
      const y = (p - x) / width;
      b.area++;
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y;
      if (y > b.y1) b.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (label[n] === -1 && data[n * 4 + 3] > ALPHA) {
            label[n] = id;
            stack.push(n);
          }
        }
      }
    }
    blobs.push(b);
  }

  // Keep the real drawings; fold small detached bits (a floating spike, say)
  // into the nearest drawing, and drop specks.
  const biggest = Math.max(...blobs.map((b) => b.area));
  const main = blobs.filter((b) => b.area >= biggest * minFrac);
  const cx = (b) => (b.x0 + b.x1) / 2;
  const cy = (b) => (b.y0 + b.y1) / 2;
  for (const s of blobs) {
    if (main.includes(s) || s.area < 30) continue;
    let near = null;
    let best = Infinity;
    for (const m of main) {
      const d = Math.hypot(cx(s) - cx(m), cy(s) - cy(m));
      if (d < best) {
        best = d;
        near = m;
      }
    }
    if (near && best < Math.max(near.x1 - near.x0, near.y1 - near.y0) * 0.75) {
      near.x0 = Math.min(near.x0, s.x0);
      near.y0 = Math.min(near.y0, s.y0);
      near.x1 = Math.max(near.x1, s.x1);
      near.y1 = Math.max(near.y1, s.y1);
      near.ids.push(...s.ids);
    }
  }
  return { blobs: main, label };
}

/**
 * Cut one drawing out of the sheet as a PNG-ready sharp image. Only pixels that
 * belong to the drawing are kept, so a neighbour poking into its bounding box
 * doesn't come along.
 */
function cutBlob(data, width, label, b) {
  const w = b.x1 - b.x0 + 1;
  const h = b.y1 - b.y0 + 1;
  const ids = new Set(b.ids);
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (b.y0 + y) * width + (b.x0 + x);
      if (!ids.has(label[src])) continue;
      data.copy(out, (y * w + x) * 4, src * 4, src * 4 + 4);
    }
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } });
}

const limit = (n) => {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
};
/** At most this many pictures are requested at once. */
const slot = limit(5);
const generate = (endpoint, body) => slot(async () => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await openai(endpoint, body);
    } catch (err) {
      if (attempt >= 3) throw err;
      console.warn(`  retrying after: ${err.message}`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
});

function editForm(prompt, size, refs, background = 'transparent') {
  const form = new FormData();
  form.set('model', MODEL);
  form.set('prompt', prompt);
  form.set('size', size);
  form.set('quality', QUALITY);
  form.set('background', background);
  form.set('output_format', 'png');
  for (const [name, png] of refs) form.append('image[]', new Blob([png], { type: 'image/png' }), name);
  return form;
}

const SIDE_ON =
  'Exact side-on view, facing right, in a ready fighting stance, the whole body visible from snout to tail ' +
  'tip and centred.';

async function makeRef(id) {
  console.log(`[${id}] drawing reference...`);
  const png = await generate('images/generations', {
    model: MODEL,
    prompt: `${FIGHTERS[id].design} ${SIDE_ON} ${STYLE}`,
    size: '1536x1024',
    quality: QUALITY,
    background: 'transparent',
    output_format: 'png',
  });
  await mkdir(path.join(RAW, id), { recursive: true });
  await writeFile(path.join(RAW, id, 'ref.png'), png);
}

/** Redraw a fighter's reference with one change. The previous one is kept as ref.prev.png. */
async function tweakRef(id, instruction) {
  const refPath = path.join(RAW, id, 'ref.png');
  const ref = await readFile(refPath);
  console.log(`[${id}] redrawing reference...`);
  const png = await generate(
    'images/edits',
    editForm(
      `Redraw this exact image: the same character, pose, colours, proportions and pixel-art style, with one ` +
        `change. ${instruction} Change nothing else. Fully transparent background, no ground, no shadow, no text.`,
      '1536x1024',
      [['ref.png', ref]],
    ),
  );
  await writeFile(path.join(RAW, id, 'ref.prev.png'), ref);
  await writeFile(refPath, png);
}

async function makeSheet(id) {
  const f = FIGHTERS[id];
  const ref = await readFile(path.join(RAW, id, 'ref.png'));
  const poses = poseText(f);
  const prompt = [
    'An animation sprite sheet of EXACTLY the character in the reference image: the same design, colours,',
    'gear, proportions and pixel-art style in every pose.',
    `(${f.design})`,
    `The sheet is a grid of ${COLS} columns and ${poses.length / COLS} rows: ${poses.length} separate poses, evenly spaced, with wide`,
    'empty space between them so that no pose touches or overlaps another. Every pose is drawn at the same',
    'scale and seen exactly side-on. The character is fighting an opponent who stands off to the RIGHT of it:',
    'in every pose its attention and its attacks are directed to the RIGHT.',
    ...poses.map((v, i) => `Pose ${i + 1} (row ${Math.floor(i / COLS) + 1}, column ${(i % COLS) + 1}): ${v}.`),
    'Each pose is one single connected drawing: no detached motion lines, stars, dust, sweat drops or effects.',
    STYLE,
  ].join(' ');
  console.log(`[${id}] drawing pose sheet...`);
  const png = await generate('images/edits', editForm(prompt, '2048x2048', [['ref.png', ref]]));
  await writeFile(path.join(RAW, id, 'sheet.png'), png);
}

/** The poses on the second sheet (2 x 2). The first is the ready stance again, only there to measure the scale by. */
const EXTRA_POSES = ['block', 'charge', 'special'];
async function makeExtra(id) {
  const f = FIGHTERS[id];
  const ref = await readFile(path.join(RAW, id, 'ref.png'));
  const poses = [
    'the ready fighting stance, exactly as in the reference image',
    'blocking: braced and leaning back a little, both forearms raised and crossed in front of its face and ' +
      'chest as a guard, chin tucked in, eyes narrowed, feet planted wide',
    'gathering its strength: crouched low with knees bent, both fists clenched down at its sides, head lowered, ' +
      'teeth gritted, every muscle tensed, about to explode into action',
    `its signature move, ${f.special}`,
  ];
  const prompt = [
    'An animation sprite sheet of EXACTLY the character in the reference image: the same design, colours,',
    'gear, proportions and pixel-art style in every pose.',
    `(${f.design})`,
    'The sheet is a grid of 2 columns and 2 rows: 4 separate poses, evenly spaced, with wide empty space',
    'between them so that no pose touches or overlaps another. Every pose is drawn at the same scale and seen',
    'exactly side-on. The character is fighting an opponent who stands off to the RIGHT of it: in every pose',
    'its attention and its attacks are directed to the RIGHT.',
    ...poses.map((v, i) => `Pose ${i + 1} (row ${Math.floor(i / 2) + 1}, column ${(i % 2) + 1}): ${v}.`),
    'Each pose is one single connected drawing: no detached motion lines, stars, dust, glows, water or effects.',
    STYLE,
  ].join(' ');
  console.log(`[${id}] drawing extra poses...`);
  const png = await generate('images/edits', editForm(prompt, '2048x2048', [['ref.png', ref]]));
  await writeFile(path.join(RAW, id, 'extra.png'), png);
}

async function makePortrait(id) {
  const ref = await readFile(path.join(RAW, id, 'ref.png'));
  console.log(`[${id}] drawing portrait...`);
  const png = await generate(
    'images/edits',
    editForm(
      'A character-select portrait of EXACTLY the dinosaur in the reference image: the same character, colours ' +
        'and headband. A dramatic close-up of its head and the top of its shoulders, filling the whole square ' +
        'frame, turned three-quarters towards the viewer and facing right, with a determined, confident look. ' +
        `${PIXEL_ART} The background is a plain flat very dark navy blue. No text, no border, no frame.`,
      '1024x1024',
      [['ref.png', ref]],
      'opaque',
    ),
  );
  await writeFile(path.join(RAW, id, 'portrait.png'), png);
}

async function makeStage(id) {
  console.log(`[stage ${id}] drawing...`);
  const png = await generate('images/generations', {
    model: MODEL,
    prompt:
      `A background for a fighting-game stage: ${STAGES[id].scene} ` +
      'Seen exactly side-on at eye level like a theatre stage, a wide panorama. Composition: the top half of ' +
      'the picture is only sky; all the scenery sits in the lower half; and the floor that the fighters will ' +
      'stand on is a flat, level, empty strip running the full width along the very bottom, one tenth of the ' +
      `picture high. ${PIXEL_ART} Rich parallax-style layers of detail in the distance. ` +
      'No characters in the foreground, no text, no border, no user interface.',
    size: '1536x1024',
    quality: QUALITY,
    output_format: 'png',
  });
  await mkdir(path.join(RAW, 'stages'), { recursive: true });
  await writeFile(path.join(RAW, 'stages', `${id}.png`), png);
}

async function makeObject(id) {
  const o = OBJECTS[id];
  const place = ['top left', 'top right', 'bottom left', 'bottom right'];
  console.log(`[${id}] drawing...`);
  const png = await generate('images/generations', {
    model: MODEL,
    prompt:
      'Four drawings of the same object in a grid of 2 columns and 2 rows, with wide empty space between ' +
      `them so that none touch: ${o.what}, seen exactly side-on at eye level, the same size and angle each ` +
      'time. It gets more comically smashed from drawing to drawing, as if dinosaurs have been bashing it: ' +
      o.states.map((st, i) => `${i + 1} (${place[i]}) ${st}`).join('; ') +
      '. Each drawing is one single connected shape with no loose pieces flying away from it. No people, ' +
      `no fire, no logos, no lettering. ${PIXEL_ART} Fully transparent background. No ground, no cast ` +
      'shadow, no smoke, no text.',
    size: '1536x1024',
    quality: QUALITY,
    background: 'transparent',
    output_format: 'png',
  });
  await mkdir(path.join(RAW, id), { recursive: true });
  await writeFile(path.join(RAW, id, 'sheet.png'), png);
}

async function makeLogo() {
  const ref = await readFile(path.join(RAW, 'rex', 'ref.png'));
  console.log('[logo] drawing...');
  const png = await generate(
    'images/edits',
    editForm(
      'A title logo for a 16-bit fighting video game called DINO FIGHTER. Two lines of big, heavy, slanted ' +
        'block capitals carved from cracked stone: "DINO" on top in mossy jungle green with a lighter top edge, ' +
        '"FIGHTER" beneath it, wider, in a hot gradient from yellow at the top to deep orange-red at the ' +
        'bottom. Thick dark outline and a hard drop shadow. Three diagonal claw slashes cut across the letters, ' +
        'and a red karate headband is tied round the letter O of DINO with its ends flying. The text reads ' +
        `exactly DINO FIGHTER and nothing else. An original logo design. ${PIXEL_ART} ` +
        'Use the reference image only for the colour and pixel style. No characters. Fully transparent ' +
        'background, no frame, no other text.',
      '1536x1024',
      [['ref.png', ref]],
    ),
  );
  await mkdir(path.join(RAW, 'logo'), { recursive: true });
  await writeFile(path.join(RAW, 'logo', 'logo.png'), png);
}

// ---------------------------------------------------------------------------------------------
// Packing: everything is reduced to real game pixels with hard edges and a small palette.

const clear = { r: 0, g: 0, b: 0, alpha: 0 };

/** Resize a cut-out to w x h and make every pixel fully solid or fully clear. */
async function pixelate(image, w, h) {
  const { data } = await image
    .resize(w, h, { kernel: 'lanczos3', fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] >= 128 ? 255 : 0;
  return data;
}

/** Height of one outline band, in game pixels. */
const BAND = 4;

/**
 * The outline of a frame as a stack of thin boxes, one per band of rows: [x0, y0, x1, y1] measured
 * from the frame's anchor (x, to the right) and from the ground (y, negative is up). With `from`,
 * only the part of the outline to the right of that x is kept.
 */
function outline(data, w, h, anchor, from = -Infinity) {
  const boxes = [];
  for (let top = h; top > 0; top -= BAND) {
    const y0 = Math.max(0, top - BAND);
    let min = Infinity;
    let max = -Infinity;
    for (let y = y0; y < top; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3]) {
          if (x < min) min = x;
          if (x > max) max = x;
        }
      }
    }
    if (max < 0) continue;
    const x0 = Math.max(min - anchor, from);
    const x1 = max + 1 - anchor;
    if (x1 - x0 >= 2) boxes.push([Math.round(x0), y0 - h, Math.round(x1), top - h]);
  }
  return boxes;
}

/** Sort the drawings found on a sheet into reading order. */
function readingOrder(blobs, cols) {
  blobs.sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
  const ordered = [];
  for (let r = 0; r < blobs.length; r += cols) {
    ordered.push(...blobs.slice(r, r + cols).sort((a, b) => a.x0 - b.x0));
  }
  return ordered;
}

async function packFighter(id) {
  const sheetPath = path.join(RAW, id, 'sheet.png');
  if (!(await exists(sheetPath)) || !(await exists(path.join(RAW, id, 'extra.png')))) {
    return console.log(`[${id}] sheets not drawn yet, skipping`);
  }
  const f = FIGHTERS[id];
  const { data, info } = await sharp(sheetPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { blobs, label } = findBlobs(data, info.width, info.height);
  if (blobs.length !== POSES.length) {
    throw new Error(`[${id}] expected ${POSES.length} poses on the sheet, found ${blobs.length}`);
  }
  const ordered = readingOrder(blobs, COLS);
  // One scale for every frame, set by the height of the ready stance.
  const scale = f.height / (ordered[0].y1 - ordered[0].y0 + 1);

  const frames = [];
  const addFrame = async (pose, src, b, by) => {
    const w = Math.max(1, Math.round((b.x1 - b.x0 + 1) * by));
    const h = Math.max(1, Math.round((b.y1 - b.y0 + 1) * by));
    const px = await pixelate(cutBlob(src.data, src.info.width, src.label, b), w, h);
    // The anchor is the middle of the animal's mass, so a frame doesn't slide about when a tail
    // or a neck reaches out.
    let sum = 0;
    let n = 0;
    const columns = new Array(w).fill(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (px[(y * w + x) * 4 + 3]) {
          sum += x;
          n++;
          columns[x]++;
        }
      }
    }
    frames.push({ pose, w, h, px, anchor: Math.round(sum / n), columns });
  };
  for (let i = 0; i < ordered.length; i++) await addFrame(POSES[i], { data, info, label }, ordered[i], scale);

  // The second sheet. Its first pose is the ready stance: that gives its scale.
  {
    const x = await sharp(path.join(RAW, id, 'extra.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const found = findBlobs(x.data, x.info.width, x.info.height);
    if (found.blobs.length !== EXTRA_POSES.length + 1) {
      throw new Error(`[${id}] expected ${EXTRA_POSES.length + 1} poses on the extra sheet, found ${found.blobs.length}`);
    }
    const [ready, ...rest] = readingOrder(found.blobs, 2);
    const by = f.height / (ready.y1 - ready.y0 + 1);
    for (let i = 0; i < rest.length; i++) await addFrame(EXTRA_POSES[i], { data: x.data, info: x.info, label: found.label }, rest[i], by);
  }

  const byPose = Object.fromEntries(frames.map((fr) => [fr.pose, fr]));
  const idle = byPose.idle1;
  // The solid body (what two fighters bump into): the columns of the ready stance that are mostly filled.
  const tall = Math.max(...idle.columns);
  const solid = idle.columns.map((c, x) => (c >= tall * 0.5 ? x : -1)).filter((x) => x >= 0);
  const body = [solid[0] - idle.anchor, solid[solid.length - 1] + 1 - idle.anchor];
  const front = idle.w - idle.anchor;

  const cellW = 2 * Math.max(...frames.map((fr) => Math.max(fr.anchor, fr.w - fr.anchor))) + 2;
  const cellH = Math.max(...frames.map((fr) => fr.h)) + 2;
  const layers = [];
  const meta = {};
  frames.forEach((fr, i) => {
    layers.push({
      input: fr.px,
      raw: { width: fr.w, height: fr.h, channels: 4 },
      left: i * cellW + cellW / 2 - fr.anchor,
      top: cellH - 1 - fr.h,
    });
    const entry = { hurt: outline(fr.px, fr.w, fr.h, fr.anchor) };
    if (fr.pose === 'headHit' || fr.pose === 'tailHit' || fr.pose === 'special') {
      // What hits is the part of the animal that reaches out beyond where it stands when ready.
      let from = front - 6;
      const reach = fr.w - fr.anchor;
      if (reach - from < 14) from = reach - 26;
      entry.hit = outline(fr.px, fr.w, fr.h, fr.anchor, from);
      entry.reach = reach;
    }
    meta[fr.pose] = entry;
  });

  await mkdir(OUT, { recursive: true });
  await sharp({ create: { width: cellW * frames.length, height: cellH, channels: 4, background: clear } })
    .composite(layers)
    .png({ palette: true, colours: 48, dither: 0 })
    .toFile(path.join(OUT, `${id}.png`));
  await writeFile(
    path.join(OUT, `${id}.json`),
    JSON.stringify({ id, name: f.name, species: f.species, cellW, cellH, height: f.height, body, poses: frames.map((fr) => fr.pose), frames: meta }) + '\n',
  );
  console.log(
    `[${id}] packed: cell ${cellW}x${cellH}, body ${body}, head reach ${meta.headHit.reach}, tail reach ${meta.tailHit.reach}`,
  );
}

async function packPortrait(id) {
  const src = path.join(RAW, id, 'portrait.png');
  if (!(await exists(src))) return;
  for (const [size, name] of [[168, 'big'], [56, 'small']]) {
    await sharp(src)
      .resize(size, size, { kernel: 'lanczos3' })
      .png({ palette: true, colours: 48, dither: 0 })
      .toFile(path.join(OUT, `portrait-${id}-${name}.png`));
  }
  console.log(`[${id}] packed portraits`);
}

/** Size of a packed stage: wider than the 480-pixel screen, so the view can scroll a little each way. */
const STAGE_W = 768;
const STAGE_H = 270;
async function packStage(id) {
  const src = path.join(RAW, 'stages', `${id}.png`);
  if (!(await exists(src))) return;
  // The drawn picture is taller than the screen: keep its bottom band, 540 high.
  await sharp(src)
    .extract({ left: 0, top: 1024 - 540, width: 1536, height: 540 })
    .resize(STAGE_W, STAGE_H, { kernel: 'lanczos3' })
    .png({ palette: true, colours: 96, dither: 0 })
    .toFile(path.join(OUT, `stage-${id}.png`));
  console.log(`[stage ${id}] packed`);
}

async function packObject(id) {
  const src = path.join(RAW, id, 'sheet.png');
  if (!(await exists(src))) return;
  const o = OBJECTS[id];
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { blobs, label } = findBlobs(data, info.width, info.height, 0.08);
  if (blobs.length !== 4) throw new Error(`[${id}] expected 4 drawings, found ${blobs.length}`);
  const ordered = readingOrder(blobs, 2);
  const first = ordered[0];
  const scale = o.size / (o.axis === 'w' ? first.x1 - first.x0 + 1 : first.y1 - first.y0 + 1);
  const frames = [];
  for (const b of ordered) {
    const w = Math.round((b.x1 - b.x0 + 1) * scale);
    const h = Math.round((b.y1 - b.y0 + 1) * scale);
    frames.push({ w, h, px: await pixelate(cutBlob(data, info.width, label, b), w, h) });
  }
  const cellW = Math.max(...frames.map((fr) => fr.w)) + 2;
  const cellH = Math.max(...frames.map((fr) => fr.h)) + 2;
  await sharp({ create: { width: cellW * frames.length, height: cellH, channels: 4, background: clear } })
    .composite(
      frames.map((fr, i) => ({
        input: fr.px,
        raw: { width: fr.w, height: fr.h, channels: 4 },
        left: i * cellW + Math.round((cellW - fr.w) / 2),
        top: cellH - 1 - fr.h,
      })),
    )
    .png({ palette: true, colours: 48, dither: 0 })
    .toFile(path.join(OUT, `obj-${id}.png`));
  await writeFile(
    path.join(OUT, `obj-${id}.json`),
    JSON.stringify({
      cellW,
      cellH,
      // Each state's outline, measured from the middle of the object.
      frames: frames.map((fr) => ({ hurt: outline(fr.px, fr.w, fr.h, Math.round(fr.w / 2)) })),
    }) + '\n',
  );
  console.log(`[${id}] packed: cell ${cellW}x${cellH}`);
}

/** Width of the packed logo in game pixels. */
const LOGO_PX = 300;
async function packLogo() {
  const src = path.join(RAW, 'logo', 'logo.png');
  if (!(await exists(src))) return;
  const trimmed = sharp(await sharp(src).trim().png().toBuffer());
  const m = await trimmed.metadata();
  const h = Math.round((m.height / m.width) * LOGO_PX);
  const px = await pixelate(trimmed, LOGO_PX, h);
  await sharp(px, { raw: { width: LOGO_PX, height: h, channels: 4 } })
    .png({ palette: true, colours: 64, dither: 0 })
    .toFile(path.join(OUT, 'logo.png'));
  console.log(`[logo] packed ${LOGO_PX}x${h}`);
}

async function packAll(ids) {
  await mkdir(OUT, { recursive: true });
  for (const id of ids) {
    try {
      await packFighter(id);
    } catch (err) {
      console.error(err.message);
    }
    await packPortrait(id);
  }
  for (const id of Object.keys(STAGES)) await packStage(id);
  for (const id of Object.keys(OBJECTS)) await packObject(id).catch((err) => console.error(err.message));
  await packLogo();
}

const [cmd, ...args] = process.argv.slice(2);
const fighters = (list) => {
  for (const id of list) if (!FIGHTERS[id]) throw new Error(`unknown fighter "${id}"`);
  return list.length ? list : Object.keys(FIGHTERS);
};
const raw = (...p) => exists(path.join(RAW, ...p));

if (cmd === 'ref') await Promise.all(fighters(args).map(makeRef));
else if (cmd === 'tweak') {
  const [id, ...words] = args;
  if (!FIGHTERS[id] || !words.length) throw new Error('usage: npm run sprites -- tweak <fighter id> "<what to change>"');
  await tweakRef(id, words.join(' '));
} else if (cmd === 'sheet') await Promise.all(fighters(args).map(makeSheet));
else if (cmd === 'extra') await Promise.all(fighters(args).map(makeExtra));
else if (cmd === 'portrait') await Promise.all(fighters(args).map(makePortrait));
else if (cmd === 'stage') {
  for (const id of args) if (!STAGES[id]) throw new Error(`unknown stage "${id}"`);
  await Promise.all((args.length ? args : Object.keys(STAGES)).map(makeStage));
} else if (cmd === 'object') {
  for (const id of args) if (!OBJECTS[id]) throw new Error(`unknown object "${id}"`);
  await Promise.all((args.length ? args : Object.keys(OBJECTS)).map(makeObject));
}
else if (cmd === 'logo') await makeLogo();
else if (cmd === 'pack') await packAll(fighters(args));
else if (cmd === 'all') {
  const ids = fighters(args);
  await Promise.all([
    ...ids.map(async (id) => {
      if (!(await raw(id, 'ref.png'))) await makeRef(id);
      await Promise.all([
        raw(id, 'sheet.png').then((ok) => ok || makeSheet(id)),
        raw(id, 'portrait.png').then((ok) => ok || makePortrait(id)),
        raw(id, 'extra.png').then((ok) => ok || makeExtra(id)),
      ]);
    }),
    ...Object.keys(STAGES).map(async (id) => (await raw('stages', `${id}.png`)) || makeStage(id)),
    ...Object.keys(OBJECTS).map(async (id) => (await raw(id, 'sheet.png')) || makeObject(id)),
    // The logo borrows its colours from Rex, so it waits for his reference.
    (async () => {
      if (await raw('logo', 'logo.png')) return;
      while (!(await raw('rex', 'ref.png'))) await new Promise((r) => setTimeout(r, 2000));
      await makeLogo();
    })(),
  ]);
  await packAll(ids);
} else {
  console.log('usage: npm run sprites -- <all|ref|tweak|sheet|extra|portrait|stage|object|logo|pack> [ids...]');
  process.exit(1);
}
