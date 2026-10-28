# Medoc

Scan a medicine box, read its official leaflet, keep your medicine cabinet and treatments, and ask an AI about them. It is a PWA that runs in your browser and works offline. You bring your own model, and everything you enter stays on your device.

**→ [maxgfr.github.io/medoc-ai](https://maxgfr.github.io/medoc-ai/)** · French and English · successor of [medoc](https://github.com/maxgfr/medoc)

> Not a medical device. The information comes from public databases and may be incomplete or out of date. AI answers can be wrong. Ask your doctor or pharmacist.

## What it does

- **Scan**: the camera reads the GS1 DataMatrix on the box (pack code, expiry, lot and serial number), the German IFA DataMatrix (PZN, lot, expiry, serial), or an EAN/UPC/PZN barcode. You can also type a code. A box is looked up in every country. With a photo, the app looks for a code first; if there is none, your model reads the box and you pick the medicine among the matches.
- **Search**: in every country at once by default, or in one country (picked on the search page or in Settings).
- **Medicine page**: active substances, packs with price and reimbursement, prescription conditions, HAS assessment, generic group, shortages and ANSM safety information, and the official documents (leaflet, SmPC, EPAR, DailyMed…).
- **Leaflet in the app**: the leaflet and SmPC text, split into sections. France uses text scraped by the Action; the US uses openFDA labels fetched live.
- **Cabinet**: each box with its lot and expiry date, read from the DataMatrix, and its quantity. Filters show expired boxes, boxes expiring within 30 days, boxes with an alert, and used-up boxes.
- **Treatments**: doses, days and dates, a _Today_ screen to record each dose, and adherence. Reminders come as notifications while the app is open, plus an **`.ics` export with alarms**: a serverless web app cannot ring when it is closed, but your phone's calendar can.
- **Alerts**: shortages, supply tensions, discontinuations and safety information that concern your boxes and treatments, plus expiry alerts.
- **Family profiles**: each person has their own cabinet and treatments, all on one device. You can back everything up and restore it as JSON.
- **AI (BYOK, through [llm-connect](https://github.com/maxgfr/llm-models/tree/main/packages/llm-connect))**: a plain-language summary of the leaflet, questions answered from the leaflet and the SmPC, and the interactions between a person's medicines (SmPC sections 4.3 and 4.5). Every answer cites the sections it relies on. You can use OpenAI, Anthropic, Google, Mistral, any OpenAI-compatible provider, or a local server (Ollama, LM Studio).

## Countries and data

| Country           | Source                                                                                                                                                                                                                                                                                                            | Licence                                                                                     | In the index                                                                                                                     | Leaflet text                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 🇫🇷 France         | [Base de données publique des médicaments](https://base-donnees-publique.medicaments.gouv.fr/telechargement) (ANSM, HAS, UNCAM) + [EMA](https://www.ema.europa.eu/en/medicines/download-medicine-data) EPAR links                                                                                                 | Free reuse ([conditions](https://base-donnees-publique.medicaments.gouv.fr/telechargement)) | ~15,900 specialties, ~41,800 CIP13/CIP7 codes, shortages, safety information, MITM                                               | Scraped from each specialty's BDPM page, a few thousand per day                             |
| 🇩🇪 Germany        | BfArM [shortage database](https://anwendungen.pharmnet-bund.de/lieferengpassmeldungen/faces/public/meldungen.xhtml) and [PZN lists](https://www.bfarm.de/DE/Arzneimittel/Arzneimittelinformationen/Lieferengpaesse/ALBVVG/_node.html) (§ 35 Abs. 5a and § 129 Abs. 2b SGB V) + EMA centrally authorised medicines | Official notices and openly published data                                                  | **Partial**: ~1,400 products by PZN (children's and urgency lists, shortages), ~1,400 EU-authorised medicines, current shortages | EMA's therapeutic indication; links to the German product information (EMA) and Gelbe Liste |
| 🇺🇸 United States  | [openFDA](https://open.fda.gov/) NDC directory                                                                                                                                                                                                                                                                    | Public domain                                                                               | ~114,500 products, ~215,000 package NDCs                                                                                         | Live from openFDA (`drug/label`), linked to DailyMed                                        |
| 🇬🇧 United Kingdom | [NHSBSA dm+d](https://www.nhsbsa.nhs.uk/pharmacies-gp-practices-and-appliance-contractors/nhs-dictionary-medicines-and-devices-dmd) via TRUD                                                                                                                                                                      | Open Government Licence v3.0                                                                | AMPs and their GTINs                                                                                                             | None (links to MHRA Products and EMC)                                                       |

Germany's full register cannot be published: BfArM's AMIce terms forbid copying and redistributing it, and the IFA sells PZN data. The German index is therefore built from what is openly published, and a scanned PZN outside it links to a lookup on Gelbe Liste.

The **GitHub Action** (`.github/workflows/pages.yml`) builds the index twice a day and publishes it with the app. You can also **build it in the browser**: in _Settings → Medicine data_, select the BDPM `.txt` files (or a dm+d zip). The same parsers run in a worker, and the result replaces the published index on that device.

### Keeping the data current

- **Every source is downloaded again on every run**, twice a day. French leaflets are re-read from the BDPM every 2 days for marketed medicines and every 7 days for the others. Leaflets of withdrawn specialties are deleted. US labels are always read live.
- **A broken source never replaces good data.** If a download fails, or a new index loses more than 15% of its medicines (a truncated file), the previous index stays published and is marked stale. The run then fails, so GitHub sends a notification. The app shows the date of each index, and a banner when one is stale or more than two days old.
- **The app reads the latest published files.** Every read revalidates with the server; the service worker answers only when offline. An installed app checks for a new index when it comes back to the foreground, at most every 30 minutes, and every 6 hours while it stays open.
- **Nothing is lost if the Actions cache goes.** The index and the leaflet state are backed up in the `data-backup` release after each run and restored from it when the cache is gone. Each scheduled run also re-enables the workflow, which GitHub otherwise disables after 60 days without activity.

The UK needs a free [TRUD](https://isd.digital.nhs.uk/trud) account subscribed to the dm+d items. Its API key goes in the `TRUD_API_KEY` repository secret. Without it, the UK is skipped.

### Published files (`data/<country>/`)

| File                 | Content                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `manifest.json`      | version, date, sources, counts, attribution                                                      |
| `search.json`        | compact search index (MiniSearch). Not published for the US, where names are searched on openFDA |
| `codes/<00-ff>.json` | pack code → medicine id, in 256 shards                                                           |
| `meds/<00-ff>.json`  | medicine records, in 256 shards                                                                  |
| `alerts.json`        | shortages and safety information                                                                 |
| `docs/<id>.json.gz`  | leaflet and SmPC sections (France)                                                               |

## Adding a country

1. `shared/countries/<cc>/parse.ts`: pure parsers from the source files to `Medicine` records and a `code → id` map (`shared/schema.ts`), with tests on real extracts.
2. `indexer/countries/<cc>.ts`: download the source and return a `CountryIndex`, then register it in `indexer/run.ts`.
3. Add `<cc>` to `COUNTRIES` in `shared/schema.ts`.
4. `src/countries/<cc>.ts`: which barcode keys the country's packs carry, and where its leaflet text comes from. Then register it in `src/countries/registry.ts`.
5. Add the country's name to `src/i18n/en.ts` and `fr.ts`.

## Development

```bash
bun install
bun run index --country fr --docs-limit 50   # builds public/data/fr (add us, uk or all)
bun run dev
bun run test          # unit tests (parsers, GS1, schedule, .ics, alerts, i18n, AI with a mock model)
bun run test:e2e      # Playwright, on a fixture index
bun run typecheck && bun run lint
```

Stack:
- **Runtime and build**: Bun, Vite, React, Tailwind, `vite-plugin-pwa`.
- **Data and search**: `idb`, MiniSearch.
- **Scanning**: `barcode-detector` with `zxing-wasm`. The wasm ships with the app.
- **AI**: AI SDK with `llm-connect` and `llm-models`.

## License

MIT. Data from the sources above, under their own licences.
