# Export Overhaul (JSON / Excel / PDF) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring all three exporters back in sync with the reworked editor and overhaul the PDF into a paginating, full-fidelity print artifact with a round-info cover page.

**Architecture:** Task 0 (Foundation) lands first and sequentially: it merges the dead `round.meta` into `round.scouting`, threads an `ExportOptions` arg through the exporters, fixes the shared `cells.ts` to use the editor's per-sheet column model, and extracts a shared CX-pairing helper. Once Task 0 is merged, Tasks 1 (JSON), 2 (Excel), and 3 (PDF) touch disjoint files and may run in parallel.

**Tech Stack:** TypeScript, Next.js, Zustand, Dexie (IndexedDB), `pdf-lib` (PDF), `fflate` (xlsx zip-surgery), Vitest.

**Reference spec:** `docs/superpowers/specs/2026-06-05-export-overhaul-design.md`

**Test runner:** `npx vitest run <path>` for a file, add `-t "<name>"` for a single test.

---

## File Structure

**Task 0 — Foundation (sequential, blocking):**
- Modify: `src/lib/model/types.ts` — remove `RoundMeta`, remove `Round.meta`.
- Modify: `src/lib/model/normalize.ts` — fold legacy `meta` → `scouting`, drop `meta`.
- Modify: `src/lib/store/useRoundStore.ts` — `createRound` stops taking/writing `meta`.
- Modify: `src/components/RoundSetup.tsx` — drop `meta: {}` from the call.
- Modify: `src/lib/persistence/autosave.ts` — `RoundSummary` drops `meta`.
- Modify: `src/lib/persistence/io.ts` — bump `FILE_VERSION` to 2, drop `meta` validation, migrate v1.
- Create: `src/lib/export/options.ts` — `ExportOptions` interface + default.
- Modify: `src/lib/export/cells.ts` — `buildExportSheets(round, opts)`, use `columnsForSheet`/`CX_COLUMNS`, expand `ExportCell`/`ExportSheet`.
- Create: `src/lib/export/cx.ts` — shared CX period/pairing helper.
- Modify: `src/lib/export/xlsx.ts` — `buildXlsx`/`downloadXlsx` take `opts`; `patchCx` uses `cx.ts`.
- Modify: `src/lib/export/pdf.ts` — `buildPdf`/`downloadPdf` signatures take `opts` (impl rewritten in Task 3).
- Modify: `src/components/ExportMenu.tsx` — read settings, pass `opts`.

**Task 1 — JSON:** `src/lib/persistence/io.ts`, `src/lib/persistence/io.test.ts`.

**Task 2 — Excel:** `src/lib/export/xlsx.ts`, `src/lib/export/xlsx.test.ts`, `src/lib/export/cells.test.ts`.

**Task 3 — PDF:** `src/lib/export/pdf.ts`, `src/lib/export/pdf.test.ts`.

---

## Task 0a: Remove `RoundMeta`, fold into `scouting`

**Files:**
- Modify: `src/lib/model/types.ts`
- Modify: `src/lib/model/normalize.ts`
- Modify: `src/lib/model/normalize.test.ts`
- Modify: `src/lib/store/useRoundStore.ts:62` and `:223`
- Modify: `src/components/RoundSetup.tsx:18`
- Modify: `src/lib/persistence/autosave.ts:16-21,40-48`

- [ ] **Step 1: Write the failing test** for the legacy-meta fold in `normalize.test.ts`. Append:

```ts
import { normalizeRound } from "./normalize";

it("folds legacy round.meta into scouting and drops meta", () => {
  const legacy = {
    id: "r",
    createdAt: 0,
    updatedAt: 0,
    role: "aff",
    format: { id: "f", name: "P", prepSeconds: { aff: 0, neg: 0 }, speeches: [] },
    meta: { tournament: "TOC", judge: "Smith", roundLabel: "Octos" },
    scouting: undefined,
    sheets: [],
    nodes: [],
    groups: [],
    timers: {
      activeSpeechId: null, speechRemaining: null, running: false,
      prepRemaining: { aff: 0, neg: 0 }, prepRunning: null,
    },
  } as unknown as Parameters<typeof normalizeRound>[0];

  const r = normalizeRound(legacy);
  expect(r.scouting.tournament).toBe("TOC");
  expect(r.scouting.judge).toBe("Smith");
  expect(r.scouting.round).toBe("Octos");
  expect((r as unknown as { meta?: unknown }).meta).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/model/normalize.test.ts -t "folds legacy"`
Expected: FAIL (`meta` still present / scouting fields undefined).

- [ ] **Step 3: Remove `RoundMeta` from `types.ts`.** Delete the `RoundMeta` interface (lines ~80-88) and the `meta: RoundMeta;` field from `Round` (line ~124). Leave `Scouting` as the single metadata home.

- [ ] **Step 4: Update `normalizeRound`** in `src/lib/model/normalize.ts`. Replace the body so it folds legacy `meta` then deletes it:

```ts
export function normalizeRound(raw: Round): Round {
  const r = { ...raw } as Round & { topic?: unknown; cx?: unknown; meta?: Record<string, string> };
  delete r.topic;
  delete r.cx;
  if (!r.scouting) r.scouting = emptyScouting();
  // Fold legacy round.meta (removed field) forward into scouting.
  const legacyMeta = r.meta;
  if (legacyMeta) {
    if (legacyMeta.tournament && !r.scouting.tournament) r.scouting.tournament = legacyMeta.tournament;
    if (legacyMeta.judge && !r.scouting.judge) r.scouting.judge = legacyMeta.judge;
    if (legacyMeta.roundLabel && !r.scouting.round) r.scouting.round = legacyMeta.roundLabel;
  }
  delete r.meta;
  r.sheets = r.sheets.map((s) => ({ ...s, kind: s.kind ?? "flow" }));
  if (Array.isArray(r.nodes)) {
    r.nodes = r.nodes.map((n) => ({ ...n, bold: n.bold ?? false }));
  }
  if (!Array.isArray(r.groups)) r.groups = [];
  if (!r.sheets.some((s) => s.kind === "cx")) {
    r.sheets = [makeCxSheet(), ...r.sheets];
  }
  return r;
}
```

- [ ] **Step 5: Update `createRound`** in `src/lib/store/useRoundStore.ts`. Change the action type (line ~62) from `createRound(input: { role: Role; format: Format; meta: RoundMeta }): void;` to `createRound(input: { role: Role; format: Format }): void;`. Update the impl (line ~223) signature to `createRound({ role, format }) {` and **remove the `meta,` line** from the `round` object literal. Remove the now-unused `RoundMeta` import at the top of the file.

- [ ] **Step 6: Update `RoundSetup.tsx:18`** — change to:

```tsx
createRound({ role, format: makeFormatByKey("policy") });
```

- [ ] **Step 7: Update `autosave.ts`** — in `RoundSummary` (line ~16) delete the `meta: Round["meta"];` line, and in `listRounds` (line ~47) delete the `meta: r.meta,` line.

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/lib/model/normalize.test.ts -t "folds legacy"`
Expected: PASS.

- [ ] **Step 9: Typecheck the whole repo** to catch every remaining `meta` reference.

Run: `npx tsc --noEmit`
Expected: No errors referencing `meta` / `RoundMeta`. (Pre-existing unrelated errors noted in project memory may remain; do not introduce new ones.) `io.test.ts` will still reference `meta` — that is fixed in Task 1.

- [ ] **Step 10: Commit**

```bash
git add src/lib/model/types.ts src/lib/model/normalize.ts src/lib/model/normalize.test.ts src/lib/store/useRoundStore.ts src/components/RoundSetup.tsx src/lib/persistence/autosave.ts
git commit -m "refactor(model): merge dead round.meta into scouting"
```

---

## Task 0b: `ExportOptions` plumbing + expanded export cells

**Files:**
- Create: `src/lib/export/options.ts`
- Modify: `src/lib/export/cells.ts`
- Modify: `src/lib/export/cells.test.ts`
- Modify: `src/lib/export/xlsx.ts` (signatures only)
- Modify: `src/lib/export/pdf.ts` (signatures only)
- Modify: `src/components/ExportMenu.tsx`

- [ ] **Step 1: Create `src/lib/export/options.ts`:**

```ts
/** User display settings that affect export output. Sourced from the store. */
export interface ExportOptions {
  /** Apply argument numbering (matches the on-screen autoNumber setting). */
  autoNumber: boolean;
  /** Render drop markers (PDF only; Excel ignores this). */
  labelDrops: boolean;
}

/** Conservative default used by callers/tests that don't pass options. */
export const DEFAULT_EXPORT_OPTIONS: ExportOptions = { autoNumber: true, labelDrops: true };
```

- [ ] **Step 2: Write the failing test** in `cells.test.ts`. Add `import { buildExportSheets } from "./cells";` (already present) and append:

```ts
it("omits numbering when autoNumber is off", () => {
  const [es] = buildExportSheets(round(), { autoNumber: false, labelDrops: false });
  expect(es.cells.find((c) => c.text === "Root")).toBeTruthy(); // no "1. " prefix
});

it("applies numbering when autoNumber is on", () => {
  const [es] = buildExportSheets(round(), { autoNumber: true, labelDrops: false });
  expect(es.cells.some((c) => c.text.startsWith("1. "))).toBe(true);
});

it("carries nodeId, rowSpan and bold on cells", () => {
  const [es] = buildExportSheets(round(), { autoNumber: true, labelDrops: true });
  const root = es.cells.find((c) => c.nodeId === "p");
  expect(root).toBeTruthy();
  expect(typeof root!.rowSpan).toBe("number");
  expect(root!.bold).toBe(false);
});

it("flags dropped cells only when labelDrops is on", () => {
  const on = buildExportSheets(round(), { autoNumber: true, labelDrops: true })[0];
  const off = buildExportSheets(round(), { autoNumber: true, labelDrops: false })[0];
  expect(off.cells.every((c) => c.dropped === false)).toBe(true);
  // The "Resp" child is conceded, not dropped; assert the field exists and is boolean.
  expect(typeof on.cells[0].dropped).toBe("boolean");
});
```

Also update the existing test that calls `buildExportSheets(round())` (the current single-arg call) to pass `DEFAULT_EXPORT_OPTIONS`:

```ts
import { DEFAULT_EXPORT_OPTIONS } from "./options";
// ...existing call becomes:
const sheets = buildExportSheets(round(), DEFAULT_EXPORT_OPTIONS);
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/export/cells.test.ts`
Expected: FAIL (wrong arity / missing fields).

- [ ] **Step 4: Rewrite `src/lib/export/cells.ts`** to expand the cell shape, thread options, use the editor's column model, and compute drops:

```ts
/**
 * Bridges the round model to placed export cells used by both the Excel and PDF
 * exporters. One ExportSheet per flow sheet; cells carry the same row/col the
 * on-screen grid uses (via columnsForSheet / CX_COLUMNS), plus numbering overlay,
 * flattened decorations, drop flags, and node identity for group brackets.
 */

import type { Round, Sheet, Speech } from "@/lib/model/types";
import { buildLayout } from "@/lib/grid/layout";
import { columnsForSheet } from "@/lib/grid/columns";
import { CX_COLUMNS } from "@/lib/model/cxColumns";
import { numberFor } from "@/lib/model/numbering";
import { detectDrops } from "@/lib/model/drops";
import type { ExportOptions } from "./options";

export interface ExportCell {
  /** Source node id (lets the PDF match ArgGroup memberIds). */
  nodeId: string;
  /** 0-based column index within the sheet's VISIBLE columns. */
  col: number;
  /** Speech name (used by Excel to resolve the template column). */
  speechName: string;
  /** 0-based body row (header excluded). */
  row: number;
  /** Number of leaf rows this cell spans. */
  rowSpan: number;
  /** Display text, numbering prefix applied when autoNumber is on. */
  text: string;
  /** Emphasis. */
  bold: boolean;
  /** conceded → strikethrough. */
  crossed: boolean;
  /** extended → arrow marker. */
  extended: boolean;
  /** Dropped (only true when labelDrops is on; PDF renders, Excel ignores). */
  dropped: boolean;
}

export interface ExportSheet {
  sheet: Sheet;
  /** The visible speech columns for this sheet (flow → columnsForSheet, cx → CX_COLUMNS). */
  columns: Speech[];
  cells: ExportCell[];
  /** Number of body rows the flow occupies. */
  rowCount: number;
}

export function buildExportSheets(round: Round, opts: ExportOptions): ExportSheet[] {
  return round.sheets
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((sheet) => {
      const columns = sheet.kind === "cx" ? CX_COLUMNS : columnsForSheet(round.format, sheet);
      const sheetNodes = round.nodes.filter((n) => n.sheetId === sheet.id);
      const { placed, totalRows } = buildLayout(sheetNodes, columns);
      const droppedIds =
        opts.labelDrops && sheet.kind !== "cx"
          ? new Set(detectDrops(sheetNodes, round.format, sheet.id))
          : new Set<string>();

      const cells: ExportCell[] = placed.map((p) => {
        const num = opts.autoNumber ? numberFor(sheetNodes, p.node.id) : null;
        const prefix = num !== null ? `${num}. ` : "";
        return {
          nodeId: p.node.id,
          col: p.col,
          speechName: columns[p.col]?.name ?? "",
          row: p.startRow,
          rowSpan: p.rowSpan,
          text: prefix + p.node.text,
          bold: p.node.bold,
          crossed: p.node.statuses.includes("conceded"),
          extended: p.node.statuses.includes("extended"),
          dropped: droppedIds.has(p.node.id),
        };
      });

      return { sheet, columns, cells, rowCount: totalRows };
    });
}
```

- [ ] **Step 5: Update `xlsx.ts` signatures** so it compiles against the new arity. Change `buildXlsx(round: Round, templateBytes: Uint8Array)` to `buildXlsx(round: Round, templateBytes: Uint8Array, opts: ExportOptions)`, and inside it change `buildExportSheets(round)` to `buildExportSheets(round, opts)`. Change `downloadXlsx(round: Round)` to `downloadXlsx(round: Round, opts: ExportOptions)` and pass `opts` into `buildXlsx`. Add `import type { ExportOptions } from "./options";`.

- [ ] **Step 6: Update `pdf.ts` signatures** (impl rewritten in Task 3). Change `buildPdf(round: Round)` to `buildPdf(round: Round, opts: ExportOptions)`, `downloadPdf(round: Round)` to `downloadPdf(round: Round, opts: ExportOptions)`, change the internal `buildExportSheets(round)` call to `buildExportSheets(round, opts)`, and add `import type { ExportOptions } from "./options";`. (The drawing still uses only `text/crossed/extended` for now; that's fine — Task 3 replaces it.)

- [ ] **Step 7: Update `ExportMenu.tsx`** to read settings from the store and pass them down:

```tsx
import { DEFAULT_EXPORT_OPTIONS, type ExportOptions } from "@/lib/export/options";
// inside the component:
const autoNumber = useRoundStore((s) => s.autoNumber);
const labelDrops = useRoundStore((s) => s.labelDrops);
const opts: ExportOptions = { autoNumber, labelDrops };
// JSON stays: run((r) => downloadRoundFile(r))
// Excel: run((r) => downloadXlsx(r, opts))
// PDF:   run((r) => downloadPdf(r, opts))
```

(`DEFAULT_EXPORT_OPTIONS` import is optional here; keep only if used.)

- [ ] **Step 8: Run the cells tests**

Run: `npx vitest run src/lib/export/cells.test.ts`
Expected: PASS.

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. `xlsx.test.ts` / `pdf.test.ts` callers may now fail arity — fixed in Tasks 2/3.

- [ ] **Step 10: Commit**

```bash
git add src/lib/export/options.ts src/lib/export/cells.ts src/lib/export/cells.test.ts src/lib/export/xlsx.ts src/lib/export/pdf.ts src/components/ExportMenu.tsx
git commit -m "feat(export): thread ExportOptions + sync cells with editor column model"
```

---

## Task 0c: Extract shared CX pairing helper

**Files:**
- Create: `src/lib/export/cx.ts`
- Create: `src/lib/export/cx.test.ts`
- Modify: `src/lib/export/xlsx.ts` (`patchCx` consumes the helper)

- [ ] **Step 1: Write the failing test** `src/lib/export/cx.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { cxPeriods, CX_PERIODS } from "./cx";
import type { Round } from "@/lib/model/types";
import { emptyScouting } from "@/lib/model/normalize";

function round(): Round {
  return {
    id: "r", createdAt: 0, updatedAt: 0, role: "aff",
    format: { id: "f", name: "P", prepSeconds: { aff: 0, neg: 0 }, speeches: [] },
    scouting: emptyScouting(),
    sheets: [{ id: "cx", title: "CX", group: "aff", order: -1, kind: "cx" }],
    nodes: [
      { id: "q", sheetId: "cx", speechId: "cx-1ac-q", parentId: null, order: 0, text: "Q1", statuses: [], bold: false },
      { id: "a", sheetId: "cx", speechId: "cx-1ac-r", parentId: "q", order: 0, text: "A1", statuses: [], bold: false },
    ],
    groups: [],
    timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 0, neg: 0 }, prepRunning: null },
  } as Round;
}

describe("cxPeriods", () => {
  it("pairs questions with their response children per period", () => {
    const periods = cxPeriods(round());
    expect(periods).toHaveLength(CX_PERIODS.length);
    const firstAc = periods[0];
    expect(firstAc.label).toBe("1AC CX");
    expect(firstAc.pairs).toEqual([{ question: "Q1", response: "A1" }]);
  });

  it("returns empty pairs when there is no cx sheet", () => {
    const r = { ...round(), sheets: [] } as Round;
    expect(cxPeriods(r).every((p) => p.pairs.length === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/export/cx.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `src/lib/export/cx.ts`:**

```ts
/**
 * Shared cross-examination pairing. The CX sheet stores nodes as Question
 * (speechId 'cx-<period>-q') with a Response child (speechId 'cx-<period>-r').
 * Both the Excel CX sheet and the PDF CX layout consume this.
 */
import type { Round } from "@/lib/model/types";

export interface CxPeriodDef {
  /** Question column id. */
  qId: string;
  /** Response column id. */
  rId: string;
  /** Human label, e.g. "1AC CX". */
  label: string;
}

export const CX_PERIODS: CxPeriodDef[] = [
  { qId: "cx-1ac-q", rId: "cx-1ac-r", label: "1AC CX" },
  { qId: "cx-1nc-q", rId: "cx-1nc-r", label: "1NC CX" },
  { qId: "cx-2ac-q", rId: "cx-2ac-r", label: "2AC CX" },
  { qId: "cx-2nc-q", rId: "cx-2nc-r", label: "2NC CX" },
];

export interface CxPair {
  question: string;
  response: string;
}

export interface CxPeriod extends CxPeriodDef {
  pairs: CxPair[];
}

/** Resolve ordered Question/Response pairs for each CX period. */
export function cxPeriods(round: Round): CxPeriod[] {
  const cxSheet = round.sheets.find((s) => s.kind === "cx");
  const cxNodes = cxSheet ? round.nodes.filter((n) => n.sheetId === cxSheet.id) : [];
  return CX_PERIODS.map((p) => {
    const questions = cxNodes
      .filter((n) => n.speechId === p.qId)
      .sort((a, b) => a.order - b.order);
    const pairs = questions.map((q) => {
      const resp = cxNodes.find((n) => n.parentId === q.id && n.speechId === p.rId);
      return { question: q.text, response: resp?.text ?? "" };
    });
    return { ...p, pairs };
  });
}
```

- [ ] **Step 4: Refactor `patchCx` in `xlsx.ts`** to source pairs from `cxPeriods`, keeping the Excel-specific column/style mapping local. Replace the period-building block (the `PERIODS` const and `perPeriod` map, lines ~88-108) with:

```ts
import { cxPeriods } from "./cx";
// ...
function patchCx(cxXml: string, round: Round): string {
  // Excel-specific column + style mapping, keyed by CX period order.
  const CELLS = [
    { qCol: "A", rCol: "B", qStyle: 23, rStyle: 27 },
    { qCol: "C", rCol: "D", qStyle: 29, rStyle: 25 },
    { qCol: "E", rCol: "F", qStyle: 23, rStyle: 27 },
    { qCol: "G", rCol: "H", qStyle: 29, rStyle: 23 },
  ];
  const FIRST_DATA_ROW = 3;

  const perPeriod = cxPeriods(round).map((p, i) => ({ ...p, ...CELLS[i] }));
  const maxRows = Math.max(0, ...perPeriod.map((p) => p.pairs.length));
  if (maxRows === 0) return cxXml;
  // ...rest unchanged (makeCell loop using p.qCol/p.rCol/p.qStyle/p.rStyle/p.pairs)...
}
```

Keep the remainder of `patchCx` (the `makeCell`, row loop, dimension update) exactly as-is — only the period source changed.

- [ ] **Step 5: Run the cx + xlsx tests**

Run: `npx vitest run src/lib/export/cx.test.ts src/lib/export/xlsx.test.ts`
Expected: cx PASS. xlsx may fail on `buildXlsx` arity (now needs `opts`) — that is finalized in Task 2; if the existing xlsx test calls `buildXlsx(round, bytes)`, temporarily pass `DEFAULT_EXPORT_OPTIONS` so the suite is green:

```ts
import { DEFAULT_EXPORT_OPTIONS } from "./options";
// buildXlsx(round, bytes) → buildXlsx(round, bytes, DEFAULT_EXPORT_OPTIONS)
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/export/cx.ts src/lib/export/cx.test.ts src/lib/export/xlsx.ts src/lib/export/xlsx.test.ts
git commit -m "refactor(export): extract shared CX pairing helper"
```

- [ ] **Step 7: Full suite gate before parallel dispatch**

Run: `npx vitest run`
Expected: all green (or only the pre-existing failures documented in project memory). This is the clean base for Tasks 1–3.

---

## Task 1: JSON export (parallel; depends on Task 0)

**Files:**
- Modify: `src/lib/persistence/io.ts`
- Modify: `src/lib/persistence/io.test.ts`

- [ ] **Step 1: Update the test fixture** in `io.test.ts`. Remove `meta` from `makeRound` (delete the `meta: { ... }` line — `Round` no longer has it). Delete the obsolete test `'throws "Invalid round file" when round.meta is missing'` (line ~174) entirely.

- [ ] **Step 2: Write the failing tests** for v2 + lossless round-trip + v1 migration. Append to `io.test.ts`:

```ts
it("exports version 2", () => {
  expect(exportRoundJSON(makeRound())).toContain('"version": 2');
});

it("round-trips a rich round losslessly", () => {
  const r = makeRound({
    scouting: { ...emptyScouting(), tournament: "TOC", judge: "Lee", round: "Octos" },
    groups: [{ id: "g1", sheetId: "sheet_001", label: "Bundle", memberIds: ["node_001"] }],
    nodes: [
      {
        id: "node_001", sheetId: "sheet_001", speechId: "speech_001", parentId: null,
        order: 0, text: "Solvency", statuses: ["extended"], bold: true, numberOverride: 4,
      },
    ],
  });
  const back = importRoundJSON(exportRoundJSON(r));
  expect(back).toEqual(r);
});

it("migrates a legacy v1 file, folding meta into scouting", () => {
  const v1 = JSON.stringify({
    version: 1,
    round: { ...makeRound(), meta: { tournament: "Old", judge: "J", roundLabel: "R3" } },
  });
  const r = importRoundJSON(v1);
  expect(r.scouting.tournament).toBe("Old");
  expect(r.scouting.judge).toBe("J");
  expect(r.scouting.round).toBe("R3");
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/persistence/io.test.ts`
Expected: FAIL (version is 1; v1 rejected).

- [ ] **Step 4: Update `io.ts`.** Bump the version and accept v1 with migration. Replace the version constant and the version checks:

```ts
export const FILE_VERSION = 2;
/** Versions importRoundJSON can read (older are migrated via normalizeRound). */
const SUPPORTED_VERSIONS = new Set([1, 2]);
```

In `importRoundJSON`, replace step 4 (`if (envelope.version !== FILE_VERSION)`) with:

```ts
if (!SUPPORTED_VERSIONS.has(envelope.version)) {
  throw new Error(`Unsupported file version: ${envelope.version}`);
}
```

And in step 6 (required-fields check), **remove** the two `meta` lines:

```ts
// delete these:
//   typeof r.meta !== "object" ||
//   r.meta === null
```

`normalizeRound(round as Round)` at the end already folds any legacy `meta` into `scouting` (Task 0a) and drops it, so v1 files migrate automatically.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/persistence/io.test.ts`
Expected: PASS.

- [ ] **Step 6: Update the header comment** in `io.ts` near `exportRoundJSON` to document the deliberate exclusion of display settings:

```ts
/**
 * Serialize a Round to a JSON string with version envelope.
 * NOTE: display settings (autoNumber, labelDrops) are intentionally NOT included —
 * they are per-device user preferences in localStorage, not round data.
 */
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/persistence/io.ts src/lib/persistence/io.test.ts
git commit -m "feat(export): JSON v2 with lossless round-trip and v1 migration"
```

---

## Task 2: Excel export (parallel; depends on Task 0)

**Files:**
- Modify: `src/lib/export/xlsx.test.ts`
- Modify: `src/lib/export/xlsx.ts` (only if Task 0b/0c left anything; mainly verification + tests)

- [ ] **Step 1: Write the failing test** for numbering honoring `autoNumber`. The xlsx test already builds bytes from the template; assert on the produced XML. Add to `xlsx.test.ts` (mirror the existing fixture/template-loading pattern in that file):

```ts
import { DEFAULT_EXPORT_OPTIONS } from "./options";

it("includes numbering prefixes when autoNumber is on", () => {
  const bytes = buildXlsx(roundWithNumberedArgs(), templateBytes, { autoNumber: true, labelDrops: false });
  const xml = findFlowSheetXml(bytes); // helper used by existing tests to read a generated sheet
  expect(xml).toMatch(/>1\. /);
});

it("omits numbering prefixes when autoNumber is off", () => {
  const bytes = buildXlsx(roundWithNumberedArgs(), templateBytes, { autoNumber: false, labelDrops: false });
  const xml = findFlowSheetXml(bytes);
  expect(xml).not.toMatch(/>\d+\. /);
});
```

If the existing test file lacks a `roundWithNumberedArgs()` / `findFlowSheetXml()` helper, build them from the patterns already in `xlsx.test.ts` (it already unzips output via `fflate` and locates sheets — reuse that). The fixture needs a sheet with ≥2 sibling root nodes so numbering produces `1. ` / `2. `.

- [ ] **Step 2: Run tests to verify they fail or that the harness is wired**

Run: `npx vitest run src/lib/export/xlsx.test.ts -t "numbering"`
Expected: the two new tests run; the "off" case FAILS first if numbering is still always applied. (After Task 0b it should already pass — if so, this test now guards the behavior.)

- [ ] **Step 3: Verify the implementation.** No new production code is expected — Task 0b already routed `autoNumber` through `buildExportSheets`. If the "off" test fails, confirm `cells.ts` gates the prefix on `opts.autoNumber` (it should) and that `xlsx.ts` forwards `opts` into `buildExportSheets`.

- [ ] **Step 4: Verify Info-sheet metadata** still maps after the merge. Add a test asserting tournament/judge land in the Info sheet from `scouting`:

```ts
it("writes scouting metadata into the Info sheet", () => {
  const r = roundWithScouting({ tournament: "TOC", judge: "Lee" });
  const bytes = buildXlsx(r, templateBytes, DEFAULT_EXPORT_OPTIONS);
  const info = findSheetXmlByName(bytes, "Info"); // reuse existing locator or read infoPart
  expect(info).toContain("TOC");
  expect(info).toContain("Lee");
});
```

- [ ] **Step 5: Run the full xlsx suite**

Run: `npx vitest run src/lib/export/xlsx.test.ts src/lib/export/xlsxParts.test.ts`
Expected: PASS (no Excel-repair invariants broken).

- [ ] **Step 6: Commit**

```bash
git add src/lib/export/xlsx.test.ts src/lib/export/xlsx.ts
git commit -m "test(export): Excel honors autoNumber; Info sheet maps scouting"
```

---

## Task 3: PDF export — complete overhaul (parallel; depends on Task 0)

This rewrites `src/lib/export/pdf.ts`: a round-info cover page, flowing/paginating flow sheets with measured row heights, full fidelity (merged group headers, bold, conceded, extended, numbering, arg-group brackets, drops), and a dedicated CX layout.

**Files:**
- Modify: `src/lib/export/pdf.ts`
- Modify: `src/lib/export/pdf.test.ts`

**Layout model (read before coding):**
- One landscape US-letter page (792×612), `MARGIN = 28`.
- Cover page first, always. Then each `ExportSheet` (sorted by order, already sorted by `buildExportSheets`).
- Flow sheet: columns = `es.columns`; equal width across the content area; aff blue, neg red.
- Rows = the leaf-row grid from `buildLayout` (carried on cells as `row` + `rowSpan`). Each leaf row gets a **measured height** = enough for the tallest single-row cell on it; multi-row cells top up the last row of their span. No truncation — text wraps within the column.
- Pagination walks leaf rows; a row that doesn't fit starts a new page that **repeats the column headers** (no title). Page-break only at leaf-row boundaries. A multi-row cell is anchored at its start row's page; to keep clash bands intact, prefer breaking between root bands — if a single band is taller than a page, allow row-level breaks (last resort).

- [ ] **Step 1: Write failing tests** in `pdf.test.ts`. Replace/extend with structural assertions (PDF tests check page count and embedded text, not pixels). Use `pdf-lib` to reload the output:

```ts
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildPdf } from "./pdf";
import { DEFAULT_EXPORT_OPTIONS } from "./options";
import type { Round } from "@/lib/model/types";
import { emptyScouting } from "@/lib/model/normalize";

function baseRound(over: Partial<Round> = {}): Round {
  return {
    id: "r", createdAt: 0, updatedAt: 0, role: "aff",
    format: {
      id: "f", name: "Policy", prepSeconds: { aff: 0, neg: 0 },
      speeches: [
        { id: "s0", name: "1AC", side: "aff", seconds: 0 },
        { id: "s1", name: "1NC", side: "neg", seconds: 0 },
      ],
    },
    scouting: { ...emptyScouting(), tournament: "TOC", judge: "Lee" },
    sheets: [{ id: "sh", title: "Case", group: "aff", order: 0, kind: "flow" }],
    nodes: [],
    groups: [],
    timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 0, neg: 0 }, prepRunning: null },
    ...over,
  } as Round;
}

describe("buildPdf", () => {
  it("always emits a cover page even for an empty round", async () => {
    const doc = await PDFDocument.load(await buildPdf(baseRound({ sheets: [] }), DEFAULT_EXPORT_OPTIONS));
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("paginates a tall sheet across multiple pages", async () => {
    const nodes = Array.from({ length: 120 }, (_, i) => ({
      id: `n${i}`, sheetId: "sh", speechId: "s0", parentId: null, order: i,
      text: `Argument number ${i} with enough text to occupy a row`, statuses: [], bold: false,
    }));
    const doc = await PDFDocument.load(await buildPdf(baseRound({ nodes }), DEFAULT_EXPORT_OPTIONS));
    // cover + at least 2 body pages
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
  });

  it("produces a valid PDF for a CX sheet", async () => {
    const r = baseRound({
      sheets: [{ id: "cx", title: "CX", group: "aff", order: -1, kind: "cx" }],
      nodes: [
        { id: "q", sheetId: "cx", speechId: "cx-1ac-q", parentId: null, order: 0, text: "Why?", statuses: [], bold: false },
        { id: "a", sheetId: "cx", speechId: "cx-1ac-r", parentId: "q", order: 0, text: "Because", statuses: [], bold: false },
      ],
    });
    const doc = await PDFDocument.load(await buildPdf(r, DEFAULT_EXPORT_OPTIONS));
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2); // cover + cx
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/export/pdf.test.ts`
Expected: FAIL (no cover page yet / single page per sheet).

- [ ] **Step 3: Rewrite `src/lib/export/pdf.ts` — preamble, helpers, measurement.**

```ts
/**
 * PDF exporter. Page 1 is a round-info cover; then each flow sheet flows across
 * as many landscape pages as it needs (no truncation), with measured row heights.
 * Aff columns blue, neg red. CX sheets use a dedicated Question/Response layout.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Round, Speech } from "@/lib/model/types";
import { buildExportSheets, type ExportSheet, type ExportCell } from "./cells";
import type { ExportOptions } from "./options";
import { cxPeriods } from "./cx";
import { teamCode } from "@/lib/model/teamCode";
import { exportFilename, downloadBlob, isoDate } from "./download";

const PAGE_W = 792, PAGE_H = 612, MARGIN = 28;
const HEADER_H = 18, FONT_SIZE = 7, LINE_H = FONT_SIZE + 1.5, CELL_PAD = 3, MIN_ROW_H = 14;
const AFF = rgb(0.09, 0.55, 0.82);
const NEG = rgb(0.78, 0.16, 0.16);
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.5, 0.5, 0.5);

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** Per-leaf-row heights so every cell (incl. multi-row spans) fits its wrapped text. */
function measureRowHeights(cells: ExportCell[], totalRows: number, colW: number, font: PDFFont): number[] {
  const h = new Array(totalRows).fill(MIN_ROW_H);
  // Pass 1: single-row cells set the base height.
  for (const c of cells) {
    if (c.rowSpan !== 1) continue;
    const need = wrap(prefixed(c), font, FONT_SIZE, colW - 2 * CELL_PAD).length * LINE_H + CELL_PAD;
    h[c.row] = Math.max(h[c.row], need);
  }
  // Pass 2: multi-row cells top up the last row of their span if still short.
  for (const c of cells) {
    if (c.rowSpan <= 1) continue;
    const need = wrap(prefixed(c), font, FONT_SIZE, colW - 2 * CELL_PAD).length * LINE_H + CELL_PAD;
    let have = 0;
    for (let r = c.row; r < c.row + c.rowSpan; r++) have += h[r];
    if (need > have) h[c.row + c.rowSpan - 1] += need - have;
  }
  return h;
}

function prefixed(c: ExportCell): string {
  return (c.extended ? "→ " : "") + c.text + (c.dropped ? "  ⚠ dropped" : "");
}
```

- [ ] **Step 4: Add the cover-page renderer.**

```ts
function drawCover(page: PDFPage, font: PDFFont, bold: PDFFont, round: Round): void {
  const sc = round.scouting;
  let y = PAGE_H - MARGIN - 10;
  const line = (label: string, value: string, f = font, size = 11) => {
    if (!value || !value.trim()) return;
    page.drawText(label ? `${label}: ${value}` : value, { x: MARGIN, y, size, font: f, color: INK });
    y -= size + 8;
  };
  line("", "Debate Flow", bold, 20);
  y -= 6;
  line("", round.format.name + (round.role ? ` — ${round.role.toUpperCase()}` : ""), font, 12);
  y -= 10;
  line("Tournament", sc.tournament ?? "");
  line("Round", sc.round ?? "");
  line("Date", sc.date || isoDate(round.createdAt));
  line("Judge", sc.judge ?? "");
  y -= 6;
  const affCode = teamCode(sc.affSchool ?? "", sc.aff.first, sc.aff.second);
  const negCode = teamCode(sc.negSchool ?? "", sc.neg.first, sc.neg.second);
  if (affCode) line("Aff", `${affCode}${sc.affSchool ? ` (${sc.affSchool})` : ""}`);
  const name = (d: { first: string; last: string }) => `${d.first} ${d.last}`.trim();
  if (name(sc.aff.first) || name(sc.aff.second)) line("  Debaters", `${name(sc.aff.first)}, ${name(sc.aff.second)}`, font, 10);
  if (negCode) line("Neg", `${negCode}${sc.negSchool ? ` (${sc.negSchool})` : ""}`);
  if (name(sc.neg.first) || name(sc.neg.second)) line("  Debaters", `${name(sc.neg.first)}, ${name(sc.neg.second)}`, font, 10);
  if (sc.decision?.vote) {
    y -= 6;
    line("Decision", sc.decision.vote.toUpperCase(), bold);
    if (sc.decision.rfd) {
      const lines = wrap(sc.decision.rfd, font, 10, PAGE_W - 2 * MARGIN);
      for (const ln of lines) { page.drawText(ln, { x: MARGIN, y, size: 10, font, color: INK }); y -= 13; }
    }
  }
}
```

- [ ] **Step 5: Add the flow-sheet renderer with pagination + headers + brackets.**

```ts
function drawColumnHeaders(page: PDFPage, bold: PDFFont, columns: Speech[], colW: number): void {
  // Merge consecutive speeches that share a group into one header span.
  let c = 0;
  while (c < columns.length) {
    const g = columns[c].group;
    let span = 1;
    if (g) while (c + span < columns.length && columns[c + span].group === g) span++;
    const label = g ?? columns[c].name;
    page.drawText(label, {
      x: MARGIN + c * colW + 2,
      y: PAGE_H - MARGIN - FONT_SIZE - 2,
      size: FONT_SIZE + 1,
      font: bold,
      color: columns[c].side === "aff" ? AFF : NEG,
    });
    c += span;
  }
}

function drawFlowSheet(doc: PDFDocument, font: PDFFont, bold: PDFFont, es: ExportSheet, round: Round): void {
  const columns = es.columns;
  const cols = Math.max(1, columns.length);
  const colW = (PAGE_W - 2 * MARGIN) / cols;
  const rowH = measureRowHeights(es.cells, es.rowCount, colW, font);
  const bodyTop = PAGE_H - MARGIN - HEADER_H;
  const bodyBottom = MARGIN;

  // Compute the page break row indices: a row starts a new page when it would overflow.
  const pageStarts: number[] = [0];
  let cursor = bodyTop;
  for (let r = 0; r < es.rowCount; r++) {
    if (cursor - rowH[r] < bodyBottom && r !== pageStarts[pageStarts.length - 1]) {
      pageStarts.push(r);
      cursor = bodyTop;
    }
    cursor -= rowH[r];
  }

  // y offset (top) of each row within its page.
  const rowTopOnPage: number[] = new Array(es.rowCount).fill(0);
  const rowPage: number[] = new Array(es.rowCount).fill(0);
  let pageIdx = 0, top = bodyTop;
  for (let r = 0; r < es.rowCount; r++) {
    if (pageIdx + 1 < pageStarts.length && pageStarts[pageIdx + 1] === r) { pageIdx++; top = bodyTop; }
    rowTopOnPage[r] = top;
    rowPage[r] = pageIdx;
    top -= rowH[r];
  }

  const pages: PDFPage[] = [];
  const pageCount = pageStarts.length;
  for (let p = 0; p < pageCount; p++) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.drawText(es.sheet.title, { x: MARGIN, y: PAGE_H - MARGIN + 6, size: 10, font: bold, color: INK });
    drawColumnHeaders(page, bold, columns, colW);
    pages.push(page);
  }

  for (const cell of es.cells) {
    const page = pages[rowPage[cell.row]];
    const x = MARGIN + cell.col * colW + CELL_PAD;
    const yTop = rowTopOnPage[cell.row] - FONT_SIZE - CELL_PAD;
    const lines = wrap(prefixed(cell), font, FONT_SIZE, colW - 2 * CELL_PAD);
    const f = cell.bold ? bold : font;
    lines.forEach((ln, li) => {
      const y = yTop - li * LINE_H;
      page.drawText(ln, { x, y, size: FONT_SIZE, font: f, color: cell.dropped ? NEG : INK });
      if (cell.crossed) {
        const w = f.widthOfTextAtSize(ln, FONT_SIZE);
        page.drawLine({ start: { x, y: y + FONT_SIZE * 0.3 }, end: { x: x + w, y: y + FONT_SIZE * 0.3 }, thickness: 0.5, color: INK });
      }
    });
  }

  // Argument-group brackets: a vertical line + label spanning the group's member cells.
  const cellByNode = new Map(es.cells.map((c) => [c.nodeId, c] as const));
  for (const group of round.groups.filter((g) => g.sheetId === es.sheet.id)) {
    const members = group.memberIds.map((id) => cellByNode.get(id)).filter(Boolean) as ExportCell[];
    if (members.length === 0) continue;
    // Only bracket members that landed on the same page (skip cross-page groups gracefully).
    const byPage = new Map<number, ExportCell[]>();
    for (const m of members) {
      const pg = rowPage[m.row];
      (byPage.get(pg) ?? byPage.set(pg, []).get(pg)!).push(m);
    }
    for (const [pg, ms] of byPage) {
      const page = pages[pg];
      const col = ms[0].col;
      const x = MARGIN + col * colW + 1;
      const yTopRow = Math.max(...ms.map((m) => rowTopOnPage[m.row]));
      const yBotRow = Math.min(...ms.map((m) => rowTopOnPage[m.row] - rowH[m.row]));
      page.drawLine({ start: { x, y: yTopRow }, end: { x, y: yBotRow }, thickness: 0.6, color: MUTED });
      if (group.label) page.drawText(group.label, { x: x + 2, y: yBotRow + 1, size: FONT_SIZE - 1, font, color: MUTED });
    }
  }
}
```

- [ ] **Step 6: Add the CX renderer.**

```ts
function drawCxSheet(doc: PDFDocument, font: PDFFont, bold: PDFFont, es: ExportSheet, round: Round): void {
  const periods = cxPeriods(round);
  const colW = (PAGE_W - 2 * MARGIN) / 2; // Question | Response
  let page = doc.addPage([PAGE_W, PAGE_H]);
  page.drawText(es.sheet.title, { x: MARGIN, y: PAGE_H - MARGIN + 6, size: 10, font: bold, color: INK });
  let y = PAGE_H - MARGIN - HEADER_H;

  const ensure = (need: number) => {
    if (y - need < MARGIN) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN - HEADER_H; }
  };

  for (const period of periods) {
    if (period.pairs.length === 0) continue;
    ensure(LINE_H * 2);
    page.drawText(period.label, { x: MARGIN, y, size: FONT_SIZE + 2, font: bold, color: INK });
    y -= LINE_H + 4;
    page.drawText("Question", { x: MARGIN, y, size: FONT_SIZE, font: bold, color: NEG });
    page.drawText("Response", { x: MARGIN + colW, y, size: FONT_SIZE, font: bold, color: AFF });
    y -= LINE_H + 2;
    for (const pair of period.pairs) {
      const qLines = wrap(pair.question, font, FONT_SIZE, colW - 2 * CELL_PAD);
      const rLines = wrap(pair.response, font, FONT_SIZE, colW - 2 * CELL_PAD);
      const rows = Math.max(qLines.length, rLines.length);
      ensure(rows * LINE_H + 4);
      for (let i = 0; i < rows; i++) {
        if (qLines[i]) page.drawText(qLines[i], { x: MARGIN, y: y - i * LINE_H, size: FONT_SIZE, font, color: INK });
        if (rLines[i]) page.drawText(rLines[i], { x: MARGIN + colW, y: y - i * LINE_H, size: FONT_SIZE, font, color: INK });
      }
      y -= rows * LINE_H + 4;
    }
    y -= 6;
  }
}
```

- [ ] **Step 7: Wire `buildPdf` / `downloadPdf`.**

```ts
export async function buildPdf(round: Round, opts: ExportOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  drawCover(doc.addPage([PAGE_W, PAGE_H]), font, bold, round);

  for (const es of buildExportSheets(round, opts)) {
    if (es.sheet.kind === "cx") drawCxSheet(doc, font, bold, es, round);
    else drawFlowSheet(doc, font, bold, es, round);
  }
  return doc.save();
}

export async function downloadPdf(round: Round, opts: ExportOptions): Promise<void> {
  const bytes = await buildPdf(round, opts);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  downloadBlob(blob, exportFilename(round.role, round.createdAt, "pdf"));
}
```

Confirm `isoDate` is exported from `./download` (it is — alongside `exportFilename` and `downloadBlob`).

- [ ] **Step 8: Run the PDF tests**

Run: `npx vitest run src/lib/export/pdf.test.ts`
Expected: PASS (cover page present; tall sheet ≥3 pages; CX renders).

- [ ] **Step 9: Typecheck + full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean (modulo documented pre-existing failures).

- [ ] **Step 10: Manual verification.** Run the app (`npm run dev`), open a multi-sheet round with long arguments, groups, drops, and CX, and export PDF. Confirm: cover page shows all metadata; long cells wrap (no clipping); a tall sheet spans multiple pages with column headers repeated; bold/conceded/extended/drop markers render; group brackets appear; numbering toggles with the Auto-number setting; CX shows Q/R pairs.

- [ ] **Step 11: Commit**

```bash
git add src/lib/export/pdf.ts src/lib/export/pdf.test.ts
git commit -m "feat(export): overhaul PDF — cover page, paginating sheets, full fidelity, CX layout"
```

---

## Self-Review notes (for the executor)

- **Spec coverage:** 0a→decision 1 (merge meta); 0b→decisions 2 & 6 (options, numbering, bold) & part of 3; 0c→decision 7 prep; Task 1→JSON + FILE_VERSION migration; Task 2→Excel numbering + Info; Task 3→decisions 3,4,5,6,7 (drops PDF-only, cover page, headers-only continuation, full fidelity, CX). Dispatch structure (decision 8) is the Task 0-then-parallel ordering.
- **Type consistency:** `ExportOptions {autoNumber,labelDrops}`; `ExportCell` adds `nodeId,rowSpan,bold,dropped`; `ExportSheet` adds `columns`; `buildExportSheets(round, opts)`; `buildXlsx(round, bytes, opts)`; `buildPdf(round, opts)`; `cxPeriods(round)`/`CX_PERIODS`. These names are used identically across tasks.
- **Edge case (rows taller than a page):** the `pageStarts` loop forces at least one row per page (`r !== pageStarts[last]`), so a single oversized row occupies its own page and may overflow the bottom margin — the accepted last-resort behavior from the spec.
- **Group brackets across a page break:** rendered per-page (members grouped by `rowPage`), degrading gracefully rather than drawing a broken bracket.

---

## Execution Handoff

Task 0 (0a→0b→0c) is sequential and blocking. After Task 0 is merged and `npx vitest run` is green, Tasks 1, 2, and 3 touch disjoint files (`io.*`, `xlsx.*`, `pdf.*`) and may be dispatched in parallel.
