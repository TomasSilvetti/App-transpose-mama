declare module "soundtouchjs" {
  export interface PitchShifterPlayDetail {
    timePlayed: number;
    formattedTimePlayed: string;
    percentagePlayed: number;
  }

  export class PitchShifter {
    constructor(
      context: BaseAudioContext,
      buffer: AudioBuffer,
      bufferSize: number,
      onEnd?: () => void,
    );
    readonly node: AudioNode;
    readonly duration: number;
    readonly sampleRate: number;
    readonly formattedDuration: string;
    readonly formattedTimePlayed: string;
    timePlayed: number;
    sourcePosition: number;
    percentagePlayed: number;
    pitch: number;
    pitchSemitones: number;
    rate: number;
    tempo: number;
    connect(node: AudioNode): void;
    disconnect(): void;
    on(event: "play", cb: (detail: PitchShifterPlayDetail) => void): void;
    off(event?: string): void;
  }

  export class SoundTouch {
    pitch: number;
    pitchSemitones: number;
    rate: number;
    tempo: number;
  }

  export class WebAudioBufferSource {
    constructor(buffer: AudioBuffer);
  }

  export class SimpleFilter {
    constructor(source: unknown, pipe: SoundTouch, onEnd?: () => void);
    sourcePosition: number;
    extract(target: Float32Array, numFrames: number): number;
  }
}

declare module "@breezystack/lamejs" {
  export class Mp3Encoder {
    constructor(channels: number, sampleRate: number, kbps: number);
    encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
    flush(): Int8Array;
  }
}
