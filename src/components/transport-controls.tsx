"use client";

import { Pause, Play, RotateCcw, SkipBack, SkipForward, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { formatTime } from "@/lib/utils";

type TransportControlsProps = {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  disabled: boolean;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  onSkip: (delta: number) => void;
  onVolumeChange: (value: number) => void;
};

export function TransportControls({
  isPlaying,
  currentTime,
  duration,
  volume,
  disabled,
  onToggle,
  onSeek,
  onSkip,
  onVolumeChange,
}: TransportControlsProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Slider
          aria-label="Posición de la canción"
          min={0}
          max={Math.max(duration, 0.1)}
          step={0.1}
          value={Math.min(currentTime, duration)}
          onValueChange={onSeek}
          disabled={disabled}
        />
        <div className="flex justify-between text-xs tabular-nums text-ink-muted">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Volver al inicio"
          disabled={disabled}
          onClick={() => onSeek(0)}
        >
          <RotateCcw className="size-5" aria-hidden />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Retroceder 10 segundos"
          disabled={disabled}
          onClick={() => onSkip(-10)}
        >
          <SkipBack className="size-5" aria-hidden />
        </Button>
        <Button
          variant="primary"
          size="icon-lg"
          aria-label={isPlaying ? "Pausar" : "Reproducir"}
          disabled={disabled}
          onClick={onToggle}
        >
          {isPlaying ? (
            <Pause className="size-7" aria-hidden />
          ) : (
            <Play className="size-7 translate-x-0.5" aria-hidden />
          )}
        </Button>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Adelantar 10 segundos"
          disabled={disabled}
          onClick={() => onSkip(10)}
        >
          <SkipForward className="size-5" aria-hidden />
        </Button>
        <div className="flex w-11 items-center justify-center">
          <Volume2 className="size-5 text-ink-muted" aria-hidden />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="w-20 shrink-0 text-xs uppercase tracking-wide text-ink-muted">Volumen</span>
        <Slider
          aria-label="Volumen"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onValueChange={onVolumeChange}
          disabled={disabled}
        />
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-muted">
          {Math.round(volume * 100)}%
        </span>
      </div>
    </div>
  );
}
