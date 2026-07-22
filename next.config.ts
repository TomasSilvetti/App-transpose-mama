import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Electron carga la UI desde el sistema de archivos, sin servidor Next detrás.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
