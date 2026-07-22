"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ExportFormat, ExportRequest, ExportResponse } from "@/workers/mp3-export.worker";
import type { ExportStatus } from "@/types/transpose-api";

export type ExportTarget = "mp3" | "video";

export type ExportOptions = {
  buffer: AudioBuffer;
  semitones: number;
  tempo: number;
  fileName: string;
  target: ExportTarget;
  bitrate?: number;
};

function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 90) || "cancion";
}

/** Procesa el audio en un worker y lo entrega como MP3 o unido al video original. */
export function useExport() {
  const workerRef = useRef<Worker | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [target, setTarget] = useState<ExportTarget | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  useEffect(() => {
    return window.transpose?.onExportStatus((payload: ExportStatus) => {
      setStatus(payload.message);
      if (typeof payload.progress === "number") setProgress(payload.progress);
    });
  }, []);

  const runExport = useCallback(
    ({ buffer, semitones, tempo, fileName, target: destination, bitrate = 192 }: ExportOptions) => {
      workerRef.current?.terminate();
      setError(null);
      setSavedPath(null);
      setProgress(0);
      setTarget(destination);
      setStatus(destination === "mp3" ? "Generando el MP3…" : "Procesando el audio…");
      setIsExporting(true);

      const format: ExportFormat = destination === "mp3" ? "mp3" : "wav";

      const worker = new Worker(new URL("../workers/mp3-export.worker.ts", import.meta.url), {
        type: "module",
      });
      workerRef.current = worker;

      worker.onmessage = (event: MessageEvent<ExportResponse>) => {
        const message = event.data;

        if (message.type === "progress") {
          // El audio es la primera mitad del trabajo cuando además hay que unirlo al video.
          setProgress(destination === "mp3" ? message.value : message.value * 0.5);
          return;
        }

        if (message.type === "error") {
          setError(message.message);
          setIsExporting(false);
          worker.terminate();
          return;
        }

        worker.terminate();

        void (async () => {
          try {
            const api = window.transpose;
            if (!api) throw new Error("El guardado solo está disponible en la app de escritorio.");

            const payload = message.data;
            const bytes = payload.buffer.slice(
              payload.byteOffset,
              payload.byteOffset + payload.byteLength,
            ) as ArrayBuffer;

            const result =
              destination === "mp3"
                ? await api.saveMp3(`${sanitizeFileName(fileName)}.mp3`, bytes)
                : await api.exportVideo({
                    fileName: `${sanitizeFileName(fileName)}.mp4`,
                    wav: bytes,
                    tempo,
                    durationSeconds: buffer.duration / tempo,
                  });

            if (result.saved && result.filePath) setSavedPath(result.filePath);
            setProgress(1);
          } catch (saveError) {
            setError(
              saveError instanceof Error ? saveError.message : "No pudimos guardar el archivo.",
            );
          } finally {
            setIsExporting(false);
            setStatus(null);
          }
        })();
      };

      worker.onerror = () => {
        setError("El navegador no pudo ejecutar la exportación.");
        setIsExporting(false);
      };

      // Se transfieren copias: transferir los canales originales dejaría el AudioBuffer inutilizable.
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
        buffer.getChannelData(index).slice(),
      );

      const request: ExportRequest = {
        channels,
        sampleRate: buffer.sampleRate,
        length: buffer.length,
        semitones,
        tempo,
        bitrate,
        format,
      };

      worker.postMessage(
        request,
        channels.map((channel) => channel.buffer),
      );
    },
    [],
  );

  const cancel = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setIsExporting(false);
    setProgress(0);
    setStatus(null);
  }, []);

  const revealSaved = useCallback(() => {
    if (savedPath) void window.transpose?.revealFile(savedPath);
  }, [savedPath]);

  return { runExport, cancel, isExporting, progress, status, error, savedPath, revealSaved, target };
}
