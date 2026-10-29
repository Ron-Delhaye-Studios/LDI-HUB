import type { NextConfig } from 'next';
const config: NextConfig = {
  output: 'export',
  basePath: '/LDI-HUB',
  trailingSlash: true,
  images: { unoptimized: true },
  // Use the installed TS 5 compiler API for build checks.
  experimental: { useTypeScriptCli: false },
};
export default config;
