import { CV_FIXTURES_DE } from "./cvs-de";
import { CV_FIXTURES_EN } from "./cvs-en";
import { CV_FIXTURES_TR } from "./cvs-tr";
import type { CvFixture } from "./types";

/** All 16 synthetic import fixtures: 6 English, 5 Turkish, 5 German (10 PDF, 6 DOCX). */
export const CV_FIXTURES: readonly CvFixture[] = [...CV_FIXTURES_EN, ...CV_FIXTURES_TR, ...CV_FIXTURES_DE];
