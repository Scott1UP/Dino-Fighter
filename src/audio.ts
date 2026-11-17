/** Sound effects, music and the announcer. Everything is listed in the manifests written by scripts/sfx.mjs, music.mjs and voices.mjs. */

const base = import.meta.env.BASE_URL;
let ctx: AudioContext | null = null;
let musicGain: GainNode;
const buffers = new Map<string, AudioBuffer>();
let musicIds: string[] = [];
let voiceIds: string[] = [];
let speaking: AudioBufferSourceNode | null = null;
let lineNumber = 0;
let wanted: string | null = null;
let playing: { id: string; node: AudioBufferSourceNode } | null = null;

async function load(kind: 'sfx' | 'music' | 'voice', id: string): Promise<AudioBuffer | null> {
  const key = `${kind}/${id}`;
  const have = buffers.get(key);
  if (have || !ctx) return have ?? null;
  try {
    const data = await (await fetch(`${base}audio/${key}.mp3`)).arrayBuffer();
    const buffer = await ctx.decodeAudioData(data);
    buffers.set(key, buffer);
    return buffer;
  } catch {
    return null;
  }
}

const manifest = async (kind: string): Promise<string[]> => {
  try {
    return Object.keys(await (await fetch(`${base}audio/${kind}/manifest.json`)).json());
  } catch {
    return [];
  }
};

/** Browsers only allow sound after a touch or a click: call this from the first one. */
export async function unlockAudio(): Promise<void> {
  if (ctx) {
    void ctx.resume();
    return;
  }
  ctx = new AudioContext();
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.45;
  musicGain.connect(ctx.destination);
  let sfxIds: string[];
  [sfxIds, musicIds, voiceIds] = await Promise.all([manifest('sfx'), manifest('music'), manifest('voice')]);
  void Promise.all([...sfxIds.map((id) => load('sfx', id)), ...voiceIds.map((id) => load('voice', id))]);
  if (wanted) {
    const id = wanted;
    wanted = null;
    void music(id);
  }
}

const channels = new Map<string, AudioBufferSourceNode>();

/**
 * Play a sound effect. Sounds given the same `channel` cut each other off: a new one stops the
 * one before it (used so that only one roar is ever heard at a time on the select screen).
 */
export function sfx(id: string, volume = 1, rate = 1, channel?: string): void {
  const buffer = buffers.get(`sfx/${id}`);
  if (!ctx || !buffer) return;
  const node = ctx.createBufferSource();
  node.buffer = buffer;
  node.playbackRate.value = rate;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  node.connect(gain).connect(ctx.destination);
  if (channel) {
    channels.get(channel)?.stop();
    channels.set(channel, node);
  }
  node.start();
}

/**
 * The announcer says a line (see scripts/voice-lines.json), cutting off whatever he was saying.
 * Silent if the clip doesn't exist. If the clip is still loading, he says it as soon as it arrives.
 */
export function voice(id: string): void {
  if (!ctx || !voiceIds.includes(id)) return;
  const said = ++lineNumber;
  void load('voice', id).then((buffer) => {
    // A newer line may have been asked for while this one loaded.
    if (!ctx || !buffer || said !== lineNumber) return;
    speaking?.stop();
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);
    node.start();
    speaking = node;
  });
}

/** Loop a piece of music, replacing whatever was playing. Asking for the piece already playing does nothing. */
export async function music(id: string | null): Promise<void> {
  wanted = id;
  if (!ctx) return;
  if (playing && playing.id === id) return;
  if (playing) {
    playing.node.stop();
    playing = null;
  }
  if (!id || !musicIds.includes(id)) return;
  const buffer = await load('music', id);
  // Something else may have been asked for while this was loading.
  if (!buffer || wanted !== id || playing) return;
  const node = ctx.createBufferSource();
  node.buffer = buffer;
  node.loop = true;
  node.connect(musicGain);
  node.start();
  playing = { id, node };
}
