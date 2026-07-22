import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatSemitones(value: number) {
  if (value === 0) return "0";
  return value > 0 ? `+${value}` : `${value}`;
}

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Nombre de la nota resultante al transportar una tónica una cantidad de semitonos. */
export function transposeKey(key: string, semitones: number) {
  const index = NOTES.indexOf(key);
  if (index === -1) return key;
  return NOTES[(((index + semitones) % 12) + 12) % 12];
}

export { NOTES };
