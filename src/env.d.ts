/// <reference types="astro/client" />

type Runtime = import('@astrojs/cloudflare').Runtime<import('./lib/env').RuntimeEnv>;

declare namespace App {
  interface Locals extends Runtime {}
}
