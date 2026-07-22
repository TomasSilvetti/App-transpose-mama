import { z } from "zod";

/** Extrae el id de video de cualquier formato de URL de YouTube (watch, youtu.be, shorts, embed). */
export function parseVideoId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  if (/^[\w-]{11}$/.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return /^[\w-]{11}$/.test(id) ? id : null;
  }

  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "music.youtube.com") {
    return null;
  }

  const fromQuery = url.searchParams.get("v");
  if (fromQuery && /^[\w-]{11}$/.test(fromQuery)) return fromQuery;

  const match = url.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/);
  return match ? match[2] : null;
}

export const urlFormSchema = z.object({
  url: z
    .string()
    .min(1, "Pegá un link de YouTube")
    .refine((value) => parseVideoId(value) !== null, "Ese link de YouTube no es válido"),
});

export type UrlFormValues = z.infer<typeof urlFormSchema>;

export const videoInfoSchema = z.object({
  videoId: z.string(),
  title: z.string(),
  author: z.string(),
  thumbnail: z.string(),
  duration: z.number(),
});

export type VideoInfo = z.infer<typeof videoInfoSchema>;
