import { greenhouse } from "./connectors/greenhouse";
import type { BoardConnector, SearchConnector } from "./types";

/** Keyword-searchable sources (job boards and APIs), in report order. */
export const SEARCH_CONNECTORS: readonly SearchConnector[] = [];

/** ATS boards read for followed companies, by `WatchedCompany.ats`. */
export const BOARD_CONNECTORS: readonly BoardConnector[] = [greenhouse];
