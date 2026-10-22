import { onRequest } from "firebase-functions/v2/https";

export const health = onRequest((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.set("Allow", "GET, HEAD").status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  res.set("Cache-Control", "no-store").json({
    ok: true,
    version: __BFHR_VERSION__,
    time: new Date().toISOString(),
  });
});
