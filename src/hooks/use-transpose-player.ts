"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PitchShifter } from "soundtouchjs";

const BUFFER_SIZE = 4096;

export const MIN_SEMITONES = -12;
export const MAX_SEMITONES = 12;
export const MIN_TEMPO = 0.5;
export const MAX_TEMPO = 1.5;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Reproductor con transposición. Recibe el audio ya descargado y lo decodifica;
 * el tono y la velocidad se aplican en vivo, sin volver a procesar la canción.
 */
export function useTransposePlayer(audioData: ArrayBuffer | null) {
  const contextRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const shifterRef = useRef<PitchShifter | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const connectedRef = useRef(false);

  const [isReady, setIsReady] = useState(false);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [semitones, setSemitonesState] = useState(0);
  const [tempo, setTempoState] = useState(1);
  const [volume, setVolume] = useState(1);

  const setSemitones = useCallback(
    (value: number) => setSemitonesState(clamp(value, MIN_SEMITONES, MAX_SEMITONES)),
    [],
  );

  const setTempo = useCallback(
    (value: number) => setTempoState(clamp(value, MIN_TEMPO, MAX_TEMPO)),
    [],
  );

  /**
   * Ajusta relativo al valor previo. Con el delta calculado en el render, varios clicks
   * seguidos leen el mismo estado y se pierden todos menos uno.
   */
  const adjustSemitones = useCallback(
    (delta: number) =>
      setSemitonesState((previous) => clamp(previous + delta, MIN_SEMITONES, MAX_SEMITONES)),
    [],
  );

  useEffect(() => {
    if (!audioData) {
      if (shifterRef.current && connectedRef.current) {
        shifterRef.current.disconnect();
        connectedRef.current = false;
      }
      shifterRef.current = null;
      bufferRef.current = null;
      // Limpiar al quedarse sin audio es sincronizar con el motor de audio, no un render derivado.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsReady(false);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    let cancelled = false;
    setIsReady(false);
    setDecodeError(null);
    setIsPlaying(false);
    setCurrentTime(0);

    (async () => {
      try {
        const { PitchShifter: Shifter } = await import("soundtouchjs");

        contextRef.current ??= new AudioContext();
        const context = contextRef.current;

        if (!gainRef.current) {
          gainRef.current = context.createGain();
          gainRef.current.connect(context.destination);
        }

        const buffer = await context.decodeAudioData(audioData.slice(0));
        if (cancelled) return;

        if (shifterRef.current && connectedRef.current) {
          shifterRef.current.disconnect();
          connectedRef.current = false;
        }

        const shifter = new Shifter(context, buffer, BUFFER_SIZE, () => {
          if (connectedRef.current) {
            shifter.disconnect();
            connectedRef.current = false;
          }
          setIsPlaying(false);
          setCurrentTime(buffer.duration);
        });

        shifter.on("play", (detail) => setCurrentTime(detail.timePlayed));

        shifterRef.current = shifter;
        bufferRef.current = buffer;
        setDuration(buffer.duration);
        setIsReady(true);
      } catch (error) {
        if (cancelled) return;
        setDecodeError(
          error instanceof Error ? error.message : "No pudimos procesar el audio descargado.",
        );
      }
    })();

    return () => {
      cancelled = true;
      if (shifterRef.current && connectedRef.current) {
        shifterRef.current.disconnect();
        connectedRef.current = false;
      }
    };
  }, [audioData]);

  useEffect(() => {
    if (shifterRef.current) shifterRef.current.pitchSemitones = semitones;
  }, [semitones, isReady]);

  useEffect(() => {
    if (shifterRef.current) shifterRef.current.tempo = tempo;
  }, [tempo, isReady]);

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume;
  }, [volume]);

  useEffect(() => () => void contextRef.current?.close(), []);

  const play = useCallback(async () => {
    const context = contextRef.current;
    const shifter = shifterRef.current;
    const gain = gainRef.current;
    if (!context || !shifter || !gain) return;

    if (context.state === "suspended") await context.resume();
    if (!connectedRef.current) {
      shifter.connect(gain);
      connectedRef.current = true;
    }
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    if (shifterRef.current && connectedRef.current) {
      shifterRef.current.disconnect();
      connectedRef.current = false;
    }
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else void play();
  }, [isPlaying, pause, play]);

  const seek = useCallback(
    (seconds: number) => {
      const shifter = shifterRef.current;
      if (!shifter || duration === 0) return;
      const clamped = Math.min(Math.max(seconds, 0), duration);
      shifter.percentagePlayed = clamped / duration;
      setCurrentTime(clamped);
    },
    [duration],
  );

  const skip = useCallback((delta: number) => seek(currentTime + delta), [currentTime, seek]);

  const reset = useCallback(() => {
    setSemitonesState(0);
    setTempoState(1);
  }, []);

  return {
    isReady,
    decodeError,
    isPlaying,
    currentTime,
    duration,
    semitones,
    tempo,
    volume,
    buffer: bufferRef,
    setSemitones,
    adjustSemitones,
    setTempo,
    setVolume,
    play,
    pause,
    toggle,
    seek,
    skip,
    reset,
  };
}
