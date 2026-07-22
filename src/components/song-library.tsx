"use client";

import Image from "next/image";
import { Music4, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatSemitones } from "@/lib/utils";
import type { SavedSong } from "@/lib/storage";

type SongLibraryProps = {
  songs: SavedSong[];
  activeVideoId: string | null;
  onSelect: (song: SavedSong) => void;
  onRemove: (videoId: string) => void;
};

export function SongLibrary({ songs, activeVideoId, onSelect, onRemove }: SongLibraryProps) {
  if (songs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border-subtle px-4 py-10 text-center">
        <Music4 className="size-6 text-ink-muted" aria-hidden />
        <p className="text-sm text-ink-muted">
          Todavía no guardaste canciones. Cargá un link y quedará acá con su tono.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {songs.map((song) => {
        const isActive = song.videoId === activeVideoId;
        return (
          <li key={song.videoId}>
            <div
              className={`group flex items-center gap-3 rounded-xl border p-2 transition-colors ${
                isActive
                  ? "border-accent/60 bg-accent/10"
                  : "border-transparent hover:border-border-subtle hover:bg-surface-input"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(song)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <Image
                  src={song.thumbnail}
                  alt=""
                  width={64}
                  height={36}
                  unoptimized
                  className="h-9 w-16 shrink-0 rounded-md object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{song.title}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {song.author}
                    {song.semitones !== 0 ? ` · ${formatSemitones(song.semitones)} st` : ""}
                    {song.tempo !== 1 ? ` · ${song.tempo.toFixed(2)}×` : ""}
                  </span>
                </span>
              </button>
              <Button
                variant="danger"
                size="icon"
                aria-label={`Quitar ${song.title}`}
                onClick={() => onRemove(song.videoId)}
                className="size-9 shrink-0"
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
