"use client";

import { useEffect, useRef } from "react";

/**
 * Desfase máximo tolerado antes de reacomodar el video contra el reloj del audio.
 * En karaoke la letra se sigue con la vista, así que conviene ajustado; corregir de más
 * produce saltos visibles, por eso no baja de ~0.1s.
 */
const DRIFT_TOLERANCE = 0.15;

type VideoStageProps = {
  src: string;
  currentTime: number;
  isPlaying: boolean;
  tempo: number;
};

/**
 * Muestra el video mudo siguiendo al motor de audio. El audio manda: es el que lleva la
 * transposición, así que el video se acomoda a su reloj y no al revés.
 */
export function VideoStage({ src, currentTime, isPlaying, tempo }: VideoStageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Bajar la velocidad estira el audio; el video tiene que estirarse igual para no desfasarse.
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = tempo;
  }, [tempo]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.currentTime = currentTime;
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
    // currentTime queda fuera a propósito: solo interesa su valor al arrancar o frenar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // Corrige la deriva acumulada sin tocar el video en cada actualización, que lo haría tartamudear.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (Math.abs(video.currentTime - currentTime) > DRIFT_TOLERANCE) {
      video.currentTime = currentTime;
    }
  }, [currentTime]);

  return (
    <video
      ref={videoRef}
      src={src}
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      className="h-full w-full bg-black object-contain"
    />
  );
}
