export interface IndexerContext {
  outDir: string;
  cacheDir: string;
  env: Record<string, string | undefined>;
  /** Leaflet scraping budget (France); undefined skips it. */
  docs?: { limit: number; minutes: number };
}
