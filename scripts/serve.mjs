import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
const root = resolve("dist"),
  types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".wasm": "application/wasm",
    ".svg": "image/svg+xml",
    ".json": "application/json",
  };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/DataCanvas/")) {
      res.writeHead(404);
      return res.end("Not found");
    }
    let file = resolve(
      root,
      decodeURIComponent(url.pathname.slice("/DataCanvas/".length)) ||
        "index.html",
    );
    if (!file.startsWith(root + "/") && file !== root)
      throw new Error("Invalid path");
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(4173, "0.0.0.0");
