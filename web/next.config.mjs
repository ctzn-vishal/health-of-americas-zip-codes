/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: precomputed JSON in public/data + public PMTiles via MapLibre range requests.
  // No server, no secrets in the bundle.
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
  // Allow opening the exported site from the filesystem / any sub-path host.
  trailingSlash: true,
};

export default nextConfig;
