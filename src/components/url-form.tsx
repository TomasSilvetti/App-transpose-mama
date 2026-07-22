"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Search } from "lucide-react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { parseVideoId, urlFormSchema, type UrlFormValues } from "@/lib/youtube";

type UrlFormProps = {
  onSubmit: (videoId: string) => void;
  isLoading: boolean;
};

export function UrlForm({ onSubmit, isLoading }: UrlFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UrlFormValues>({
    resolver: zodResolver(urlFormSchema),
    defaultValues: { url: "" },
  });

  const submit = handleSubmit(({ url }) => {
    const videoId = parseVideoId(url);
    if (videoId) onSubmit(videoId);
  });

  return (
    <form onSubmit={submit} noValidate className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label htmlFor="url" className="sr-only">
            Link de YouTube
          </label>
          <input
            id="url"
            type="text"
            inputMode="url"
            autoComplete="off"
            placeholder="Pegá el link de YouTube…"
            aria-invalid={Boolean(errors.url)}
            className="h-12 w-full rounded-xl border border-border-subtle bg-surface-input px-4 text-sm text-ink placeholder:text-ink-muted/70 focus:border-accent focus:outline-none"
            {...register("url")}
          />
        </div>
        <Button type="submit" variant="primary" size="md" disabled={isLoading} className="h-12 sm:w-40">
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Search className="size-4" aria-hidden />
          )}
          {isLoading ? "Cargando" : "Cargar canción"}
        </Button>
      </div>
      {errors.url ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errors.url.message}
        </p>
      ) : null}
    </form>
  );
}
