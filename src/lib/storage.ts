"use client";

import { z } from "zod";

import { videoQualitySchema, type VideoQuality } from "@/lib/youtube";

const STORAGE_KEY = "transpose:library:v1";
const QUALITY_KEY = "transpose:quality:v1";
const MAX_ENTRIES = 30;

export const savedSongSchema = z.object({
  videoId: z.string(),
  title: z.string(),
  author: z.string(),
  thumbnail: z.string(),
  duration: z.number(),
  semitones: z.number(),
  tempo: z.number(),
  savedAt: z.string(),
});

export type SavedSong = z.infer<typeof savedSongSchema>;

export function readLibrary(): SavedSong[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = savedSongSchema.array().safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function writeLibrary(songs: SavedSong[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(songs.slice(0, MAX_ENTRIES)));
  } catch {
    // Cuota llena o modo privado: la app sigue funcionando sin historial.
  }
  return songs.slice(0, MAX_ENTRIES);
}

export function upsertSong(song: SavedSong): SavedSong[] {
  const rest = readLibrary().filter((item) => item.videoId !== song.videoId);
  return writeLibrary([song, ...rest]);
}

export function removeSong(videoId: string): SavedSong[] {
  return writeLibrary(readLibrary().filter((item) => item.videoId !== videoId));
}

export function findSong(videoId: string): SavedSong | undefined {
  return readLibrary().find((item) => item.videoId === videoId);
}

export function readQuality(): VideoQuality {
  if (typeof window === "undefined") return "720";
  const parsed = videoQualitySchema.safeParse(window.localStorage.getItem(QUALITY_KEY));
  return parsed.success ? parsed.data : "720";
}

export function writeQuality(quality: VideoQuality) {
  try {
    window.localStorage.setItem(QUALITY_KEY, quality);
  } catch {
    // Sin persistencia la app sigue andando, solo se pierde la preferencia.
  }
}
