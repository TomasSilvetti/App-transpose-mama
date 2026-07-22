"use client";

import Image from "next/image";
import { FolderOpen, Music4, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatSemitones } from "@/lib/utils";
import type { DownloadedSong } from "@/types/transpose-api";

type SongLibraryProps = {
  songs: DownloadedSong[];
  activeFileName: string | null;
  onSelect: (song: DownloadedSong) => void;
  onRemove: (fileName: string) => void;
  onOpenFolder: () => void;
};

function formatSize(bytes: number) {
  const mb = bytes / 1048576;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function SongLibrary({
  songs,
  activeFileName,
  onSelect,
  onRemove,
  onOpenFolder,
}: SongLibraryProps) {
  if (songs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-subtle px-4 py-10 text-center">
        <Music4 className="size-6 text-ink-muted" aria-hidden />
        <p className="text-sm text-ink-muted">
          Todavía no descargaste ninguna canción. Las que guardes quedan acá para abrirlas cuando
          quieras, sin volver a bajarlas.
        </p>
        <Button variant="ghost" size="sm" onClick={onOpenFolder}>
          <FolderOpen className="size-4" aria-hidden />
          Abrir la carpeta
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {songs.map((song) => {
          const isActive = song.fileName === activeFileName;
          return (
            <li key={song.fileName}>
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
                  {song.thumbnail ? (
                    <Image
                      src={song.thumbnail}
                      alt=""
                      width={64}
                      height={36}
                      unoptimized
                      className="h-9 w-16 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span className="flex h-9 w-16 shrink-0 items-center justify-center rounded-md bg-surface-input">
                      <Music4 className="size-4 text-ink-muted" aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{song.title}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {song.kind === "video" ? "Video" : "MP3"}
                      {song.semitones !== 0 ? ` · ${formatSemitones(song.semitones)} st` : ""}
                      {song.tempo !== 1 ? ` · ${song.tempo.toFixed(2)}×` : ""}
                      {` · ${formatSize(song.sizeBytes)} · ${formatDate(song.downloadedAt)}`}
                    </span>
                  </span>
                </button>
                <Button
                  variant="danger"
                  size="icon"
                  aria-label={`Borrar ${song.title}`}
                  onClick={() => onRemove(song.fileName)}
                  className="size-9 shrink-0"
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Button variant="ghost" size="sm" onClick={onOpenFolder} className="self-start">
        <FolderOpen className="size-4" aria-hidden />
        Abrir la carpeta
      </Button>
    </div>
  );
}
