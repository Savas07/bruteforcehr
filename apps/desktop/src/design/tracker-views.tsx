/**
 * The Tracker's Table and Calendar views and the CSV import in the design build, on the design
 * tracker store (`DesignTrackerProviders`), so moves, imports and Undo behave as in the app.
 * `?csv=<step>` opens the import on a step with the Turkish Excel sample (Windows-1254,
 * semicolons, a title row): `pick`, `columns`, `statuses`, `preview`, or `workbook` (an .xlsx
 * dropped by mistake).
 */
import { useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { buildTrackerCalendarModel } from "../features/tracker-calendar/model";
import TrackerCalendarScreen from "../features/tracker-calendar/Screen";
import { openCsvImport } from "../features/tracker-csv";
import { buildTrackerTableModel } from "../features/tracker-table/model";
import TrackerTableScreen from "../features/tracker-table/Screen";
import trExcelCsv from "@bfhr/fixtures/csv/tr-excel-windows-1254.csv?inline";
import { csvDesignStates, type CsvDesignState } from "./matrix";
import { DesignTrackerScreen } from "./tracker";

export function DesignTrackerTable() {
  return (
    <>
      <DesignTrackerScreen id="tracker-table" build={buildTrackerTableModel} view={TrackerTableScreen} />
      <DesignCsvImport />
    </>
  );
}

export function DesignTrackerCalendar() {
  return <DesignTrackerScreen id="tracker-calendar" build={buildTrackerCalendarModel} view={TrackerCalendarScreen} />;
}

/** The bytes of a `data:` URL (Vite `?inline` asset). */
function dataUrlBytes(url: string): Uint8Array {
  const binary = atob(url.slice(url.indexOf(",") + 1));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** An .xlsx starts with a ZIP header: what a user drops when they forget to save as CSV. */
const WORKBOOK_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);

function DesignCsvImport() {
  const search: Readonly<Record<string, unknown>> = useSearch({ strict: false });
  const step = csvDesignStates.find((state) => state === search["csv"]) ?? null;
  useEffect(() => {
    if (step === null) return;
    const open: Readonly<Record<CsvDesignState, () => void>> = {
      pick: () => openCsvImport(),
      workbook: () => openCsvImport({ file: { name: "Applications 2026.xlsx", bytes: WORKBOOK_BYTES } }),
      columns: () => openCsvImport({ file: { name: "takip.csv", bytes: dataUrlBytes(trExcelCsv) }, step: "columns" }),
      statuses: () => openCsvImport({ file: { name: "takip.csv", bytes: dataUrlBytes(trExcelCsv) }, step: "statuses" }),
      preview: () => openCsvImport({ file: { name: "takip.csv", bytes: dataUrlBytes(trExcelCsv) }, step: "preview" }),
    };
    open[step]();
  }, [step]);
  return null;
}
