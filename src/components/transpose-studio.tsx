"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AlertCircle, Download, Film, FolderOpen, Loader2, Music2 } from "lucide-react";

import { QualityPicker } from "@/components/quality-picker";
import { SongLibrary } from "@/components/song-library";
import { VideoStage } from "@/components/video-stage";
import { TransportControls } from "@/components/transport-controls";
import { TransposeControls } from "@/components/transpose-controls";
import { UpdateBanner } from "@/components/update-banner";
import { UrlForm } from "@/components/url-form";
import { VersionBar } from "@/components/version-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useExport, type ExportTarget } from "@/hooks/use-export";
import { useTransposePlayer } from "@/hooks/use-transpose-player";
import { formatSemitones, formatTime } from "@/lib/utils";
import {
  readLibrary,
  readQuality,
  removeSong,
  upsertSong,
  writeQuality,
  type SavedSong,
} from "@/lib/storage";
import { videoInfoSchema, type VideoInfo, type VideoQuality } from "@/lib/youtube";
import type { DownloaderStatus } from "@/types/transpose-api";

/** Miniatura pública de YouTube: permite mostrar la portada sin esperar la descarga. */
function thumbnailFor(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/** Electron antepone su propia cáscara al error del proceso principal; acá sobra. */
function cleanErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : "Error inesperado.";
  return raw.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, "");
}

export function TransposeStudio() {
  const [library, setLibrary] = useState<SavedSong[]>([]);
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [audioData, setAudioData] = useState<ArrayBuffer | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [quality, setQuality] = useState<VideoQuality>("720");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);
  const [downloader, setDownloader] = useState<DownloaderStatus | null>(null);
  const pendingSettings = useRef<{ semitones: number; tempo: number } | null>(null);

  const player = useTransposePlayer(audioData);
  const {
    runExport,
    isExporting,
    progress: exportProgress,
    status: exportStatus,
    error: exportError,
    savedPath,
    revealSaved,
    target: exportTarget,
  } = useExport();

  const { setSemitones, setTempo, isReady } = player;

  useEffect(() => {
    // localStorage no existe durante el prerender: leerlo antes rompería la hidratación.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLibrary(readLibrary());
    setQuality(readQuality());
  }, []);

  const handleQualityChange = useCallback((value: VideoQuality) => {
    setQuality(value);
    writeQuality(value);
  }, []);

  useEffect(() => {
    const api = window.transpose;
    if (!api) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDownloader({
        phase: "error",
        message: "Abrí Transpose desde su acceso directo: esta pantalla necesita la app de escritorio.",
      });
      return;
    }
    const stopStatus = api.onDownloaderStatus(setDownloader);
    const stopProgress = api.onDownloadProgress(({ progress }) => setDownloadProgress(progress));
    const stopRetry = api.onDownloadRetry(({ intento, total }) =>
      setRetryNotice(`YouTube demoró en responder. Reintentando (${intento} de ${total})…`),
    );
    void api.ensureDownloader().catch(() => {});
    return () => {
      stopStatus();
      stopProgress();
      stopRetry();
    };
  }, []);

  // Los ajustes guardados solo pueden aplicarse cuando el shifter ya existe.
  useEffect(() => {
    if (!isReady || !pendingSettings.current) return;
    setSemitones(pendingSettings.current.semitones);
    setTempo(pendingSettings.current.tempo);
    pendingSettings.current = null;
  }, [isReady, setSemitones, setTempo]);

  const loadVideo = useCallback(
    async (videoId: string, settings?: { semitones: number; tempo: number }) => {
      setIsLoading(true);
      setLoadError(null);
      setRetryNotice(null);
      setDownloadProgress(0);
      setAudioData(null);
      setVideoUrl(null);
      pendingSettings.current = settings ?? { semitones: 0, tempo: 1 };

      // La portada aparece de inmediato; el resto de la ficha llega con la descarga.
      setVideo({
        videoId,
        title: "Descargando…",
        author: "",
        thumbnail: thumbnailFor(videoId),
        duration: 0,
      });

      try {
        const api = window.transpose;
        if (!api) throw new Error("Esta pantalla necesita ejecutarse dentro de la app de escritorio.");

        const { info, audio, videoUrl: url } = await api.loadVideo(videoId, quality);
        const parsed = videoInfoSchema.parse(info);

        setVideo(parsed);
        setAudioData(audio);
        setVideoUrl(url);
        setLibrary(
          upsertSong({
            ...parsed,
            semitones: settings?.semitones ?? 0,
            tempo: settings?.tempo ?? 1,
            savedAt: new Date().toISOString(),
          }),
        );
      } catch (error) {
        setVideo(null);
        setLoadError(cleanErrorMessage(error));
      } finally {
        setIsLoading(false);
        setRetryNotice(null);
      }
    },
    [quality],
  );

  // Persistir los ajustes en cuanto el usuario los toca, para reencontrarlos la próxima vez.
  useEffect(() => {
    if (!video || !isReady || pendingSettings.current) return;
    setLibrary(
      upsertSong({
        ...video,
        semitones: player.semitones,
        tempo: player.tempo,
        savedAt: new Date().toISOString(),
      }),
    );
  }, [video, isReady, player.semitones, player.tempo]);

  const handleRemove = (videoId: string) => {
    setLibrary(removeSong(videoId));
    if (video?.videoId === videoId) {
      setVideo(null);
      setAudioData(null);
    }
  };

  const handleDownload = (destination: ExportTarget) => {
    const buffer = player.buffer.current;
    if (!buffer || !video) return;
    runExport({
      buffer,
      semitones: player.semitones,
      tempo: player.tempo,
      fileName: `${video.title} (${formatSemitones(player.semitones)} st)`,
      target: destination,
    });
  };

  const busy = isLoading || downloader?.phase === "preparing";
  const controlsDisabled = !isReady;
  const errorMessage = loadError ?? player.decodeError;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:py-14">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-accent">
          <Music2 className="size-5" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-[0.2em]">Transpose</span>
        </div>
        <h1 className="text-3xl font-semibold text-ink sm:text-4xl">
          Cambiá el tono de cualquier canción de YouTube
        </h1>
        <p className="max-w-2xl text-sm text-ink-muted">
          Pegá un link, movés el tono a tu comodidad, practicás con el audio ya transportado y lo
          descargás en MP3 para llevarlo a donde quieras.
        </p>
      </header>

      <UpdateBanner />

      <UrlForm onSubmit={(videoId) => void loadVideo(videoId)} isLoading={busy} />

      {downloader?.phase === "preparing" ? (
        <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-raised/60 px-4 py-3 text-sm text-ink-muted">
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
          <span>{downloader.message}</span>
        </div>
      ) : null}

      {downloader?.phase === "error" ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{downloader.message}</span>
        </div>
      ) : null}

      {downloader?.phase === "ready" && downloader.updated ? (
        <p className="text-xs text-ink-muted">Descargador actualizado a {downloader.version}.</p>
      ) : null}

      {errorMessage ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          {video ? (
            <Card className="overflow-hidden">
              <div className="relative aspect-video w-full bg-surface-input">
                {videoUrl && isReady ? (
                  <VideoStage
                    src={videoUrl}
                    currentTime={player.currentTime}
                    isPlaying={player.isPlaying}
                    tempo={player.tempo}
                  />
                ) : (
                  <Image
                    src={video.thumbnail}
                    alt={`Portada de ${video.title}`}
                    fill
                    unoptimized
                    sizes="(min-width: 1024px) 640px, 100vw"
                    className="object-cover"
                    priority
                  />
                )}

                {/* Con el video visible la letra importa más que el título: no se tapa. */}
                {videoUrl && isReady ? null : (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-t from-surface-raised via-surface-raised/20 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-5">
                      <h2 className="line-clamp-2 text-lg font-semibold text-ink">{video.title}</h2>
                      <p className="text-sm text-ink-muted">
                        {video.author}
                        {video.duration > 0 ? ` · ${formatTime(video.duration)}` : ""}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {videoUrl && isReady ? (
                <div className="border-b border-border-subtle px-6 py-3">
                  <h2 className="line-clamp-1 text-sm font-semibold text-ink">{video.title}</h2>
                  <p className="text-xs text-ink-muted">
                    {video.author}
                    {video.duration > 0 ? ` · ${formatTime(video.duration)}` : ""}
                  </p>
                </div>
              ) : null}

              <CardContent className="pt-5">
                {isLoading ? (
                  <div className="flex flex-col gap-2 py-6">
                    <div className="flex items-center gap-2 text-sm text-ink-muted">
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      {retryNotice ?? "Descargando la canción…"}
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border-subtle">
                      <div
                        className="h-full rounded-full bg-accent transition-[width] duration-200"
                        style={{ width: `${Math.round(downloadProgress * 100)}%` }}
                      />
                    </div>
                  </div>
                ) : null}

                {isReady ? (
                  <TransportControls
                    isPlaying={player.isPlaying}
                    currentTime={player.currentTime}
                    duration={player.duration}
                    volume={player.volume}
                    disabled={controlsDisabled}
                    onToggle={player.toggle}
                    onSeek={player.seek}
                    onSkip={player.skip}
                    onVolumeChange={player.setVolume}
                  />
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Card className="flex min-h-72 items-center justify-center p-10 text-center">
              <p className="text-sm text-ink-muted">
                Pegá un link de YouTube arriba para ver la portada y empezar a practicar.
              </p>
            </Card>
          )}

          {video ? (
            <Card>
              <CardHeader>
                <CardTitle>Transposición</CardTitle>
              </CardHeader>
              <CardContent>
                <TransposeControls
                  semitones={player.semitones}
                  tempo={player.tempo}
                  disabled={controlsDisabled}
                  onSemitonesChange={player.setSemitones}
                  onSemitonesAdjust={player.adjustSemitones}
                  onTempoChange={player.setTempo}
                  onReset={player.reset}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="flex flex-col gap-6">
          {video ? (
            <Card>
              <CardHeader>
                <CardTitle>Descargar</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Button
                  variant="primary"
                  onClick={() => handleDownload("mp3")}
                  disabled={controlsDisabled || isExporting}
                >
                  {isExporting && exportTarget === "mp3" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Download className="size-4" aria-hidden />
                  )}
                  {isExporting && exportTarget === "mp3"
                    ? `Generando ${Math.round(exportProgress * 100)}%`
                    : "Descargar MP3"}
                </Button>

                <Button
                  variant="secondary"
                  onClick={() => handleDownload("video")}
                  disabled={controlsDisabled || isExporting || !videoUrl}
                  title={videoUrl ? undefined : "Cargá la canción con video para poder guardarlo"}
                >
                  {isExporting && exportTarget === "video" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Film className="size-4" aria-hidden />
                  )}
                  {isExporting && exportTarget === "video"
                    ? `Generando ${Math.round(exportProgress * 100)}%`
                    : "Descargar video"}
                </Button>

                {isExporting ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border-subtle">
                      <div
                        className="h-full rounded-full bg-accent transition-[width] duration-200"
                        style={{ width: `${Math.round(exportProgress * 100)}%` }}
                      />
                    </div>
                    {exportStatus ? (
                      <p className="text-xs text-ink-muted">{exportStatus}</p>
                    ) : null}
                  </div>
                ) : null}

                {exportError ? (
                  <p role="alert" className="text-sm text-red-400">
                    {exportError}
                  </p>
                ) : null}

                {savedPath && !isExporting ? (
                  <Button variant="ghost" size="sm" onClick={revealSaved}>
                    <FolderOpen className="size-4" aria-hidden />
                    Mostrar en la carpeta
                  </Button>
                ) : null}

                <p className="text-xs text-ink-muted">
                  Se generan con el tono y la velocidad que elegiste, y suenan igual a lo que venís
                  practicando. La primera vez que guardes un video se descarga el conversor.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Video</CardTitle>
            </CardHeader>
            <CardContent>
              <QualityPicker value={quality} onChange={handleQualityChange} disabled={isLoading} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mis canciones</CardTitle>
            </CardHeader>
            <CardContent>
              <SongLibrary
                songs={library}
                activeVideoId={video?.videoId ?? null}
                onSelect={(song) =>
                  void loadVideo(song.videoId, { semitones: song.semitones, tempo: song.tempo })
                }
                onRemove={handleRemove}
              />
            </CardContent>
          </Card>
        </aside>
      </div>

      <VersionBar />
    </div>
  );
}
