/**
 * Suggestions that exist before the user asks for any: the design build seeds fixture suggestions
 * (design-suggestions.ts) so critiques see tracked changes; the app starts with none and only
 * shows what `cvAssist` returned.
 */
import { createContext } from "react";
import type { CvSuggestionInput } from "./suggestions";

export const CvSuggestionSeedContext = createContext<readonly CvSuggestionInput[]>([]);
