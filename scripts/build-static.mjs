import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await mkdir(join(dist, "server"), { recursive: true });

for (const entry of ["index.html", "styles.css", "script.js", "assets", ".openai"]) {
  await cp(join(root, entry), join(dist, entry), { recursive: true });
}

const assetFiles = await readdir(join(root, "assets"));
const assets = {};
for (const file of assetFiles) {
  const bytes = await readFile(join(root, "assets", file));
  assets[`/assets/${file}`] = {
    contentType: contentType(file),
    base64: bytes.toString("base64")
  };
}

const textRoutes = {
  "/": { contentType: "text/html; charset=utf-8", body: await readFile(join(root, "index.html"), "utf8") },
  "/index.html": { contentType: "text/html; charset=utf-8", body: await readFile(join(root, "index.html"), "utf8") },
  "/styles.css": { contentType: "text/css; charset=utf-8", body: await readFile(join(root, "styles.css"), "utf8") },
  "/script.js": { contentType: "application/javascript; charset=utf-8", body: await readFile(join(root, "script.js"), "utf8") }
};

await writeFile(join(dist, "server", "index.js"), `const textRoutes = ${JSON.stringify(textRoutes)};
const assets = ${JSON.stringify(assets)};

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname.endsWith("/") && url.pathname !== "/" ? url.pathname.slice(0, -1) : url.pathname;
    const text = textRoutes[pathname] || (!pathname.includes(".") ? textRoutes["/"] : null);
    if (text) return new Response(text.body, { headers: { "content-type": text.contentType } });

    const asset = assets[pathname];
    if (asset) {
      return new Response(decodeBase64(asset.base64), {
        headers: {
          "content-type": asset.contentType,
          "cache-control": "public, max-age=31536000, immutable"
        }
      });
    }

    return new Response("Not found", { status: 404 });
  }
};
`);

function contentType(file) {
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  if (file.endsWith(".gif")) return "image/gif";
  if (file.endsWith(".pdf")) return "application/pdf";
  if (file.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}
