import { SoundTouch, SimpleFilter, WebAudioBufferSource } from "soundtouchjs";

const RATE = 44100, SECS = 4, FREQ = 440;

function tone() {
  const n = RATE * SECS;
  const ch = new Float32Array(n);
  for (let i = 0; i < n; i++) ch[i] = Math.sin(2 * Math.PI * FREQ * (i / RATE)) * 0.8;
  return { numberOfChannels: 2, getChannelData: () => ch };
}

function process(semitones, tempo) {
  const pipe = new SoundTouch();
  pipe.pitchSemitones = semitones;
  pipe.tempo = tempo;
  const filter = new SimpleFilter(new WebAudioBufferSource(tone()), pipe);

  const block = new Float32Array(8192 * 2);
  const out = [];
  for (;;) {
    const frames = filter.extract(block, 8192);
    if (frames === 0) break;
    for (let i = 0; i < frames; i++) out.push(block[i * 2]);
  }

  // Cruces por cero: un seno de F Hz cruza 2F veces por segundo.
  const skip = Math.floor(out.length * 0.2), end = Math.floor(out.length * 0.8);
  let crossings = 0;
  for (let i = skip + 1; i < end; i++) if ((out[i - 1] < 0) !== (out[i] < 0)) crossings++;
  const dur = (end - skip) / RATE;
  return { hz: Math.round(crossings / 2 / dur), frames: out.length };
}

const base = process(0, 1);
console.log(`original     : ${base.hz} Hz (esperado ${FREQ})`);

for (const st of [12, 7, -12]) {
  const r = process(st, 1);
  const esperado = Math.round(FREQ * Math.pow(2, st / 12));
  const errorPct = Math.abs(r.hz - esperado) / esperado * 100;
  console.log(`${String(st).padStart(3)} semitonos: ${r.hz} Hz (esperado ${esperado}) -> desvio ${errorPct.toFixed(1)}% ${errorPct < 3 ? "OK" : "FALLA"}`);
}

console.log("\n-- tempo (el tono NO debe cambiar) --");
for (const t of [0.5, 1.5]) {
  const r = process(0, t);
  const ratio = r.frames / base.frames;
  console.log(`tempo ${t}x: ${r.hz} Hz | duracion x${ratio.toFixed(2)} (esperado x${(1/t).toFixed(2)}) ${Math.abs(r.hz-FREQ)<20 ? "TONO OK" : "TONO CAMBIO=FALLA"}`);
}
