// Throwaway: captures the import dialog's later steps on the design dev server (deleted after the critique).
import { webkit, chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const base = "http://localhost:5199/";
const out = "../../artifacts/screens/desktop/harness/jobs-import-adhoc";
const [, , round = "r1", sizesArg = "1280x800", enginesArg = "webkit", axeArg = ""] = process.argv;
const scenarios = [
  { name: "review", url: "https://boards.greenhouse.io/lindenhof/jobs/4821", state: "populated" },
  { name: "error", url: "https://jobs.blocked.example/7", state: "populated" },
  { name: "manual", url: "https://jobs.blocked.example/7", state: "populated", manual: true },
  { name: "manual-invalid", url: "https://jobs.blocked.example/7", state: "populated", manual: true, submit: true },
  { name: "offline", url: "https://boards.greenhouse.io/lindenhof/jobs/4821", state: "offline" },
  { name: "reading", url: "https://boards.greenhouse.io/lindenhof/jobs/4821", state: "populated", reading: true },
];
for (const engineName of enginesArg.split(",")) {
  const engine = engineName === "webkit" ? webkit : chromium;
  const browser = await engine.launch();
  for (const size of sizesArg.split(",")) {
    const [width, height] = size.split("x").map(Number);
    for (const theme of ["light", "dark"]) {
      for (const s of scenarios) {
        const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme }); const page = await context.newPage();
        await page.goto(`${base}#/jobs?import=1&fixture=populated&state=${s.state === "offline" ? "offline" : "ready"}&theme=${theme}`);
        const input = page.getByLabel("Link to the posting");
        await input.waitFor();
        await input.fill(s.url);
        if (s.state !== "offline") {
          await input.press("Enter");
          if (s.reading) await page.waitForTimeout(300);
          else if (s.name === "review") await page.getByText("Check the details we read").waitFor();
          else await page.getByText("You can enter the details yourself").first().waitFor();
        }
        if (s.manual) await page.getByRole("button", { name: "Enter it yourself" }).first().click();
        if (s.submit) await page.getByRole("button", { name: "Save job" }).first().click();
        await page.waitForTimeout(200);
        await page.screenshot({ path: `${out}/${round}-${engineName}-${s.name}-${theme}-${size}.png` });
        if (axeArg === "axe") {
          const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
          const counts = result.violations.map((v) => `${v.id}:${v.impact}:${v.nodes.length}`);
          console.log(engineName, size, theme, s.name, counts.join(" ") || "clean");
        }
        await context.close();
      }
    }
  }
  await browser.close();
}
console.log("done");
