/// <reference lib="webworker" />

import { Mp3Encoder } from "@breezystack/lamejs";
import { SimpleFilter, SoundTouch, WebAudioBufferSource } from "soundtouchjs";

export type ExportRequest = {
  channels: Float32Array[];
  sampleRate: number;
  length: number;
  semitones: number;
  tempo: number;
  bitrate: number;
};

export type ExportResponse =
  | { type: "progress"; value: number }
  | { type: "done"; data: Uint8Array }
  | { type: "error"; message: string };

const FRAMES_PER_BLOCK = 8192;

function toInt16(value: number) {
  const clamped = Math.max(-1, Math.min(1, value));
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}

self.onmessage = (event: MessageEvent<ExportRequest>) => {
  const { channels, sampleRate, length, semitones, tempo, bitrate } = event.data;

  try {
    // SoundTouch solo necesita esta porción de la interfaz de AudioBuffer, que no existe en el worker.
    const source = new WebAudioBufferSource({
      numberOfChannels: channels.length,
      getChannelData: (index: number) => channels[Math.min(index, channels.length - 1)],
    } as unknown as AudioBuffer);

    const pipe = new SoundTouch();
    pipe.pitchSemitones = semitones;
    pipe.tempo = tempo;

    const filter = new SimpleFilter(source, pipe);
    const encoder = new Mp3Encoder(2, sampleRate, bitrate);

    const interleaved = new Float32Array(FRAMES_PER_BLOCK * 2);
    const left = new Int16Array(FRAMES_PER_BLOCK);
    const right = new Int16Array(FRAMES_PER_BLOCK);
    const parts: Int8Array[] = [];

    const expectedFrames = Math.max(1, Math.round(length / tempo));
    let writtenFrames = 0;
    let lastReported = 0;

    for (;;) {
      const frames = filter.extract(interleaved, FRAMES_PER_BLOCK);
      if (frames === 0) break;

      for (let i = 0; i < frames; i += 1) {
        left[i] = toInt16(interleaved[i * 2]);
        right[i] = toInt16(interleaved[i * 2 + 1]);
      }

      const chunk = encoder.encodeBuffer(left.subarray(0, frames), right.subarray(0, frames));
      if (chunk.length > 0) parts.push(new Int8Array(chunk));

      writtenFrames += frames;
      const progress = Math.min(0.99, writtenFrames / expectedFrames);
      if (progress - lastReported > 0.01) {
        lastReported = progress;
        self.postMessage({ type: "progress", value: progress } satisfies ExportResponse);
      }
    }

    const tail = encoder.flush();
    if (tail.length > 0) parts.push(new Int8Array(tail));

    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      output.set(new Uint8Array(part.buffer, part.byteOffset, part.length), offset);
      offset += part.length;
    }

    self.postMessage({ type: "done", data: output } satisfies ExportResponse, {
      transfer: [output.buffer],
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Falló la exportación del MP3.",
    } satisfies ExportResponse);
  }
};
