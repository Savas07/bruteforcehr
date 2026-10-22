import { ScreenTitle } from "../shared/ui/ScreenTitle";
import { designHash, type DesignScreenName, designScreenPaths, designStates } from "./matrix";

const screenTitles: Record<DesignScreenName, string> = {
  demo: "Shared components demo",
  today: "Today",
  "job-detail": "Job detail",
  "cv-editor": "CV editor",
  "tracker-board": "Tracker board",
  "mail-review": "Mail review",
};

/** `#/design`: every screen in every forced state, one click away (design builds only). */
export function DesignIndex() {
  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-8 pt-5 pb-8">
      <ScreenTitle title="Design build" />
      <p className="text-fg-secondary mt-1 max-w-180 text-callout">
        Fixture data from @bfhr/fixtures. Each link forces a state with{" "}
        <code className="font-mono">?fixture</code> and <code className="font-mono">?state</code>; add{" "}
        <code className="font-mono">&amp;theme=dark</code> to override the system appearance.
      </p>
      <table className="mt-6 border-collapse text-callout">
        <thead>
          <tr>
            <th scope="col" className="text-fg-secondary py-2 pr-6 text-left font-medium">
              Screen
            </th>
            {designStates.map((state) => (
              <th key={state} scope="col" className="text-fg-secondary px-3 py-2 text-left font-medium">
                {state}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-line-subtle divide-y">
          {(Object.keys(designScreenPaths) as DesignScreenName[]).map((screen) => (
            <tr key={screen}>
              <th scope="row" className="py-2 pr-6 text-left font-medium">
                {screenTitles[screen]}
              </th>
              {designStates.map((state) => (
                <td key={state} className="px-3 py-2">
                  <a
                    className="text-fg-link underline-offset-2 hover:underline"
                    href={designHash(screen, state)}
                    aria-label={`${screenTitles[screen]}, ${state}`}
                  >
                    Open
                  </a>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
