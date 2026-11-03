// Tiny static server for working on the app locally. The app itself has no
// backend; this only serves the files in app/.
//
//   npm start            -> http://localhost:5173
//   HOST=0.0.0.0 npm start   to open it from your phone on the same Wi-Fi
//   (service workers and install need HTTPS on a phone, so use the hosted
//   GitHub Pages version for day-to-day use)

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "app");
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = path.join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
}).listen(port, host, () => console.log(`Finance Tracker on http://${host === "0.0.0.0" ? "localhost" : host}:${port}`));
