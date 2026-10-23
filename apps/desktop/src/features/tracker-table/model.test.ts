import {
  detectTableDateOrder,
  guessColumnMapping,
  guessedStatusMap,
  planImport,
  readSpreadsheet,
  statusValues,
} from "@bfhr/core";
import { emptyDataset, FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMemoryTrackerStore } from "../../data/tracker/memory";
import { createAppIntl } from "../../i18n/intl";
import { fixtureContext } from "../../shared/model/fixture-context";
import { newApplications, statusLabels } from "../tracker-csv/model";
import {
  buildTrackerTableModel,
  DEFAULT_FILTERS,
  filterRows,
  planBulkMove,
  type TableColumnId,
  tableCsv,
} from "./model";
import { DEFAULT_COLUMNS } from "./prefs";

const ctx = fixtureContext(populatedDataset);
const model = buildTrackerTableModel(populatedDataset, ctx);
const encoder = new TextEncoder();

describe("buildTrackerTableModel", () => {
  it("has a row per application, most recent activity first", () => {
    expect(model.rows).toHaveLength(populatedDataset.applications.length);
    expect(model.firstUse).toBe(false);
    const sorts = model.rows.map((row) => row.lastActivity.sort);
    expect([...sorts].sort((a, b) => b - a)).toEqual(sorts);
    expect(model.today).toBe("2026-10-22");
  });

  it("formats each cell from the application", () => {
    const application = populatedDataset.applications.find((candidate) => candidate.appliedAt !== null && candidate.cvId);
    if (!application) throw new Error("fixture without an applied application");
    const row = model.rows.find((candidate) => candidate.applicationId === application.id);
    expect(row?.company.name).toBe(application.company);
    expect(row?.status.key).toBe(application.status);
    expect(row?.appliedAt?.exportValue).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(row?.cv).toBe(populatedDataset.cvs.find((cv) => cv.id === application.cvId)?.title);
  });

  it("is first use without applications", () => {
    expect(buildTrackerTableModel(emptyDataset, fixtureContext(emptyDataset)).firstUse).toBe(true);
  });
});

describe("filterRows", () => {
  it("scopes to open or closed applications and filters by status and text", () => {
    const active = filterRows(model.rows, DEFAULT_FILTERS, null);
    expect(active.every((row) => row.status.phase !== "closed")).toBe(true);
    const closed = filterRows(model.rows, { ...DEFAULT_FILTERS, scope: "closed" }, null);
    expect(closed.length + active.length).toBe(model.rows.length);
    const interviewing = filterRows(model.rows, { scope: "all", statuses: ["interviewing"], query: "" }, null);
    expect(interviewing.every((row) => row.status.key === "interviewing")).toBe(true);
    const first = model.rows[0];
    if (!first) throw new Error("no rows");
    const word = first.company.name.split(" ")[0]?.toUpperCase() ?? "";
    expect(filterRows(model.rows, { scope: "all", statuses: [], query: word }, null)).toContain(first);
    expect(filterRows(model.rows, { scope: "all", statuses: [], query: "" }, new Set([first.applicationId]))).toEqual([first]);
  });
});

describe("planBulkMove", () => {
  it("splits a selection by what the state machine allows", () => {
    const plan = planBulkMove(
      [
        { id: "a", status: "applied" },
        { id: "b", status: "screening" },
        { id: "c", status: "interviewing" },
        { id: "d", status: "offer" },
      ],
      "accepted",
    );
    expect(plan).toEqual({ movable: ["d"], already: [], refused: ["a", "b", "c"] });
    expect(planBulkMove([{ id: "a", status: "applied" }], "applied").already).toEqual(["a"]);
  });
});

describe("CSV import → table → bulk move → export round trip", () => {
  const intl = createAppIntl({ language: "en", locale: "en-GB" });
  const bytes = new Uint8Array(
    readFileSync(path.join(import.meta.dirname, "../../../../../packages/fixtures/csv/tr-excel-windows-1254.csv")),
  );

  it("imports the Turkish Excel file, moves the rows and exports what the table shows", () => {
    const store = createMemoryTrackerStore({ ...emptyDataset, profile: populatedDataset.profile }, () => FIXTURE_NOW);
    const table = readSpreadsheet(bytes, "takip.csv");
    const mapping = guessColumnMapping(table);
    const plan = planImport(table, {
      mapping,
      statusMap: { ...guessedStatusMap(statusValues(table, mapping, statusLabels(intl))), belki: "saved" },
      defaultStatus: "applied",
      dateOrder: detectTableDateOrder(table, mapping, "dmy"),
      keepUnmappedInNotes: true,
      now: FIXTURE_NOW,
      existing: [],
    });
    const chosen = new Set(plan.rows.filter((row) => row.includeByDefault).map((row) => row.rowNumber));
    const items = newApplications(plan, chosen, "takip.csv", FIXTURE_NOW);
    const created = store.repository.createApplications(items);
    expect(created.ids.applicationIds).toHaveLength(7);

    const read = () => {
      const state = store.source.getState();
      if (state.status !== "ready") throw new Error("store not ready");
      return state.data;
    };
    const events = read().applicationEvents;
    expect(events).toHaveLength(7);
    const kervanEvent = events.find((event) => event.evidence?.reason === "Imported from takip.csv · row 3");
    expect(kervanEvent).toMatchObject({ type: "created", actor: "user", toStatus: "interviewing", fromStatus: null });
    expect(kervanEvent?.occurredAt).toEqual(new Date("2026-09-12T12:00:00Z"));

    const ctxEmpty = fixtureContext(emptyDataset);
    let rows = buildTrackerTableModel(read(), ctxEmpty).rows;
    expect(rows.map((row) => row.company.name).sort()).toEqual([
      "Anadolu Yazılım",
      "Boğaziçi Fintech",
      "Ege Lojistik",
      "Kervan Teknoloji",
      "Kuzey Oyun",
      "Marmara Bank",
      "Trakya Medya",
    ]);

    // Bulk: every open application to Screening (one batch, one event each).
    const applications = read().applications;
    const bulk = planBulkMove(applications, "screening");
    store.repository.moveStatus(
      bulk.movable.flatMap((id) => applications.filter((application) => application.id === id).map((application) => ({ application, to: "screening" as const }))),
    );
    rows = buildTrackerTableModel(read(), ctxEmpty).rows;
    const statuses = Object.fromEntries(rows.map((row) => [row.company.name, row.status.key]));
    expect(statuses).toMatchObject({
      "Kervan Teknoloji": "screening",
      "Anadolu Yazılım": "screening",
      "Ege Lojistik": "screening",
      "Kuzey Oyun": "screening",
      "Marmara Bank": "screening",
    });
    // Outcomes are side exits; moving them back is a reopen, which bulk allows too (user actor).
    expect(read().applicationEvents.filter((event) => event.type === "status_changed")).toHaveLength(bulk.movable.length);

    // Export with every column, then read the file back as an import would.
    const columns: readonly TableColumnId[] = [...DEFAULT_COLUMNS, "channel", "priority", "added"];
    const csv = tableCsv(rows, columns, intl);
    const exported = readSpreadsheet(encoder.encode(csv), "export.csv");
    expect(exported.encoding).toBe("utf-8");
    expect(exported.headers).toContain("Company");
    expect(exported.rows).toHaveLength(rows.length);
    const back = guessColumnMapping(exported);
    expect(back.slice(0, 4)).toEqual(["company", "role", "status", "appliedAt"]);
    const replanned = planImport(exported, {
      mapping: back,
      statusMap: guessedStatusMap(statusValues(exported, back, statusLabels(intl))),
      defaultStatus: "applied",
      dateOrder: "dmy",
      keepUnmappedInNotes: false,
      now: FIXTURE_NOW,
      existing: [],
    });
    expect(replanned.blocked).toBe(0);
    const reimported = replanned.rows.map(({ draft }) => [draft?.company, draft?.role, draft?.status, draft?.appliedAt?.toISOString().slice(0, 10)]);
    expect(reimported).toEqual(
      rows.map((row) => [row.company.name, row.role, row.status.key, row.appliedAt?.exportValue]),
    );
  });
});
