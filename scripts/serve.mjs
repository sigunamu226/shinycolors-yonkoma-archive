#!/usr/bin/env node
/** 動作確認用の簡易静的サーバ。本番(GitHub Pages)では使わない。 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 8000);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  // 末尾が "/" のパスは index.html に解決する（GitHub Pages と同じ挙動）
  const wanted = urlPath.endsWith("/") ? urlPath + "index.html" : urlPath;
  const rel = normalize(wanted).replace(/^(\.\.[/\\])+/, "");
  try {
    const body = await readFile(join(ROOT, rel));
    res.writeHead(200, {
      "Content-Type": TYPES[extname(rel)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404");
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
