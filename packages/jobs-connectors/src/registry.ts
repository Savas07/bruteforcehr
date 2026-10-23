import { adzuna } from "./connectors/adzuna";
import { arbeitnow } from "./connectors/arbeitnow";
import { ashby } from "./connectors/ashby";
import { bundesagentur } from "./connectors/bundesagentur";
import { careersPage } from "./connectors/careers-page";
import { greenhouse } from "./connectors/greenhouse";
import { himalayas } from "./connectors/himalayas";
import { jooble } from "./connectors/jooble";
import { kariyer } from "./connectors/kariyer";
import { lever } from "./connectors/lever";
import { personio } from "./connectors/personio";
import { recruitee } from "./connectors/recruitee";
import { reed } from "./connectors/reed";
import { remoteok } from "./connectors/remoteok";
import { remotive } from "./connectors/remotive";
import { smartrecruiters } from "./connectors/smartrecruiters";
import { themuse } from "./connectors/themuse";
import { usajobs } from "./connectors/usajobs";
import { workable } from "./connectors/workable";
import type { BoardConnector, SearchConnector } from "./types";

/** Keyword-searchable sources (job boards and APIs), in report order (docs/adr/0005-job-sources-scraping.md). */
export const SEARCH_CONNECTORS: readonly SearchConnector[] = [
  arbeitnow,
  remotive,
  remoteok,
  himalayas,
  themuse,
  bundesagentur,
  kariyer,
  adzuna,
  jooble,
  usajobs,
  reed,
];

/** ATS boards and careers pages read for followed companies, by `WatchedCompany.ats`. */
export const BOARD_CONNECTORS: readonly BoardConnector[] = [
  greenhouse,
  lever,
  ashby,
  smartrecruiters,
  workable,
  recruitee,
  personio,
  careersPage,
];

/** Every secret name a keyed source reads (Secret Manager; docs/runbooks/jobs.md). */
export const CONNECTOR_SECRET_NAMES: readonly string[] = [
  ...new Set(SEARCH_CONNECTORS.flatMap((connector) => connector.secrets)),
];
