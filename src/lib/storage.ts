"use client";

import { videoQualitySchema, type VideoQuality } from "@/lib/youtube";

const QUALITY_KEY = "transpose:quality:v1";

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
