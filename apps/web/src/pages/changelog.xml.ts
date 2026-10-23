/** Atom feed of the Changelog (website.md › Changelog: Campsite "Changelog RSS"), built with the site. */
import type { APIRoute } from "astro";
import { getReleases } from "../releases.ts";
import { SITE_NAME } from "../site.ts";

const escapeXml = (text: string): string =>
  text.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0).toString()};`);

export const GET: APIRoute = async ({ site }) => {
  if (site === undefined) throw new Error("astro.config `site` is required for the changelog feed");
  const releases = await getReleases();
  const changelog = new URL("/changelog/", site).href;
  const self = new URL("/changelog.xml", site).href;
  // An empty feed still needs an <updated>; the build time is the honest value then.
  const updated = (releases[0]?.publishedAt ?? new Date()).toISOString();

  const entries = releases.map((release) => {
    const title = `Version ${release.version}${release.prerelease ? " (Beta)" : ""}`;
    return [
      "  <entry>",
      `    <id>${escapeXml(release.htmlUrl)}</id>`,
      `    <title>${escapeXml(title)}</title>`,
      `    <link rel="alternate" type="text/html" href="${escapeXml(`${changelog}#${release.anchor}`)}"/>`,
      `    <published>${release.publishedAt.toISOString()}</published>`,
      `    <updated>${release.publishedAt.toISOString()}</updated>`,
      `    <content type="html">${escapeXml(release.notesHtml)}</content>`,
      "  </entry>",
    ].join("\n");
  });

  const feed = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <id>${escapeXml(changelog)}</id>`,
    `  <title>${escapeXml(`${SITE_NAME} changelog`)}</title>`,
    `  <link rel="alternate" type="text/html" href="${escapeXml(changelog)}"/>`,
    `  <link rel="self" type="application/atom+xml" href="${escapeXml(self)}"/>`,
    `  <author><name>${escapeXml(SITE_NAME)}</name></author>`,
    `  <updated>${updated}</updated>`,
    ...entries,
    "</feed>",
    "",
  ].join("\n");

  return new Response(feed, { headers: { "Content-Type": "application/atom+xml; charset=utf-8" } });
};
