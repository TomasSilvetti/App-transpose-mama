/// <reference lib="webworker" />

import { Mp3Encoder } from "@breezystack/lamejs";
import { SimpleFilter, SoundTouch, WebAudioBufferSource } from "soundtouchjs";

export type ExportFormat = "mp3" | "wav";

export type ExportRequest = {
  channels: Float32Array[];
  sampleRate: number;
  length: number;
  semitones: number;
  tempo: number;
  bitrate: number;
  format?: ExportFormat;
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

/** Cabecera RIFF/WAVE de 44 bytes para PCM 16 bits estéreo. */
function wavHeader(sampleRate: number, dataBytes: number) {
  const header = new DataView(new ArrayBuffer(44));
  const channels = 2;
  const bytesPerSample = 2;

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) header.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, "RIFF");
  header.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, channels, true);
  header.setUint32(24, sampleRate, true);
  header.setUint32(28, sampleRate * channels * bytesPerSample, true);
  header.setUint16(32, channels * bytesPerSample, true);
  header.setUint16(34, 8 * bytesPerSample, true);
  ascii(36, "data");
  header.setUint32(40, dataBytes, true);

  return new Uint8Array(header.buffer);
}

self.onmessage = (event: MessageEvent<ExportRequest>) => {
  const { channels, sampleRate, length, semitones, tempo, bitrate, format = "mp3" } = event.data;

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
    const encoder = format === "mp3" ? new Mp3Encoder(2, sampleRate, bitrate) : null;

    const interleaved = new Float32Array(FRAMES_PER_BLOCK * 2);
    const left = new Int16Array(FRAMES_PER_BLOCK);
    const right = new Int16Array(FRAMES_PER_BLOCK);
    const parts: Uint8Array[] = [];

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

      if (encoder) {
        const chunk = encoder.encodeBuffer(left.subarray(0, frames), right.subarray(0, frames));
        if (chunk.length > 0) parts.push(new Uint8Array(chunk.buffer.slice(0, chunk.length)));
      } else {
        const pcm = new Int16Array(frames * 2);
        for (let i = 0; i < frames; i += 1) {
          pcm[i * 2] = left[i];
          pcm[i * 2 + 1] = right[i];
        }
        parts.push(new Uint8Array(pcm.buffer));
      }

      writtenFrames += frames;
      const progress = Math.min(0.99, writtenFrames / expectedFrames);
      if (progress - lastReported > 0.01) {
        lastReported = progress;
        self.postMessage({ type: "progress", value: progress } satisfies ExportResponse);
      }
    }

    if (encoder) {
      const tail = encoder.flush();
      if (tail.length > 0) parts.push(new Uint8Array(tail.buffer.slice(0, tail.length)));
    }

    const dataBytes = parts.reduce((sum, part) => sum + part.length, 0);
    const header = encoder ? null : wavHeader(sampleRate, dataBytes);
    const output = new Uint8Array(dataBytes + (header?.length ?? 0));

    let offset = 0;
    if (header) {
      output.set(header, 0);
      offset = header.length;
    }
    for (const part of parts) {
      output.set(part, offset);
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
