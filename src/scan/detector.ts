/**
 * Barcode reading with zxing-wasm behind the BarcodeDetector API (the
 * ponyfill reads GS1 DataMatrix everywhere, iOS included). The wasm ships with
 * the app instead of coming from a CDN, so scanning works offline and under
 * the CSP.
 */
import { BarcodeDetector, prepareZXingModule } from "barcode-detector/ponyfill";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

let detector: BarcodeDetector | null = null;

export function getDetector(): BarcodeDetector {
  if (!detector) {
    prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith(".wasm") ? new URL(wasmUrl, location.href).href : prefix + path,
      },
    });
    detector = new BarcodeDetector({
      // Code 39 carries the German PZN barcode.
      formats: ["data_matrix", "ean_13", "upc_a", "ean_8", "code_128", "upc_e", "code_39"],
    });
  }
  return detector;
}

/** The first code found in an image (a photo of a box), or null. */
export async function detectIn(source: ImageBitmapSource): Promise<string | null> {
  const codes = await getDetector().detect(source);
  return codes[0]?.rawValue ?? null;
}
