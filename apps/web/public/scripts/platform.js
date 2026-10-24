/* global document */
// Download buttons follow the visitor's system (website.md › Decision — Desktop). Loaded as a classic
// blocking script in <head> (not inline, so the CSP allows only same-origin scripts): the matching
// variant shows without a layout shift; nothing is stored or sent.
(() => {
  const ua = navigator.userAgent;
  // `userAgentData.platform` says "macOS" / "Windows"; `navigator.platform` "MacIntel" / "Win32".
  const platform = navigator.userAgentData?.platform ?? navigator.platform ?? "";
  const isMac = /^mac/i.test(platform);
  // iPadOS reports a Mac platform; touch support tells them apart.
  const os =
    /iPhone|iPad|iPod/.test(ua) || (isMac && navigator.maxTouchPoints > 1)
      ? "ios"
      : isMac
        ? "mac"
        : /^win/i.test(platform)
          ? "windows"
          : undefined;
  if (os !== undefined) document.documentElement.dataset.os = os;
})();
