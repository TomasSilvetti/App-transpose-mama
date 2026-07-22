"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ExportResponse } from "@/workers/mp3-export.worker";

export type ExportOptions = {
  buffer: AudioBuffer;
  semitones: number;
  tempo: number;
  fileName: string;
  bitrate?: number;
};

function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 90) || "cancion";
}

export function useMp3Export() {
  const workerRef = useRef<Worker | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const exportMp3 = useCallback(
    ({ buffer, semitones, tempo, fileName, bitrate = 192 }: ExportOptions) => {
      workerRef.current?.terminate();
      setError(null);
      setSavedPath(null);
      setProgress(0);
      setIsExporting(true);

      const worker = new Worker(new URL("../workers/mp3-export.worker.ts", import.meta.url), {
        type: "module",
      });
      workerRef.current = worker;

      worker.onmessage = (event: MessageEvent<ExportResponse>) => {
        const message = event.data;

        if (message.type === "progress") {
          setProgress(message.value);
          return;
        }

        if (message.type === "error") {
          setError(message.message);
          setIsExporting(false);
          worker.terminate();
          return;
        }

        setProgress(1);
        worker.terminate();

        void (async () => {
          try {
            const api = window.transpose;
            if (!api) throw new Error("El guardado solo está disponible en la app de escritorio.");
            const payload = message.data;
            const result = await api.saveMp3(
              `${sanitizeFileName(fileName)}.mp3`,
              payload.buffer.slice(
                payload.byteOffset,
                payload.byteOffset + payload.byteLength,
              ) as ArrayBuffer,
            );
            if (result.saved && result.filePath) setSavedPath(result.filePath);
          } catch (saveError) {
            setError(
              saveError instanceof Error ? saveError.message : "No pudimos guardar el archivo.",
            );
          } finally {
            setIsExporting(false);
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

      worker.postMessage(
        {
          channels,
          sampleRate: buffer.sampleRate,
          length: buffer.length,
          semitones,
          tempo,
          bitrate,
        },
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
  }, []);

  const revealSaved = useCallback(() => {
    if (savedPath) void window.transpose?.revealFile(savedPath);
  }, [savedPath]);

  return { exportMp3, cancel, isExporting, progress, error, savedPath, revealSaved };
}
