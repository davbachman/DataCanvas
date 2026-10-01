import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { openDB } from "idb";
import { type Bundle, CanvasError, validateProject } from "../domain/model";
import { validateBundle } from "../engine/core";
export function packBundle(bundle: Bundle): Uint8Array {
  return zipSync(
    {
      "manifest.json": strToU8(JSON.stringify(bundle.project, null, 2)),
      ...bundle.assets,
    },
    { level: 6 },
  );
}
export function unpackBundle(bytes: Uint8Array): Bundle {
  if (bytes.length > 64 * 1024 * 1024)
    throw new CanvasError(
      "RESOURCE_LIMIT",
      "Archive exceeds 64 MiB compressed limit.",
    );
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (
          f.name.startsWith("/") ||
          f.name.includes("\\") ||
          f.name.split("/").includes("..")
        )
          throw new CanvasError("VALIDATION", "Unsafe archive path");
        total += f.originalSize;
        if (total > 256 * 1024 * 1024)
          throw new CanvasError(
            "RESOURCE_LIMIT",
            "Archive exceeds 256 MiB decompressed limit",
          );
        return true;
      },
    });
  } catch (e) {
    throw e instanceof CanvasError
      ? e
      : new CanvasError("VALIDATION", "Invalid .datacanvas ZIP archive");
  }
  if (!files["manifest.json"])
    throw new CanvasError("VALIDATION", "Missing manifest.json");
  let value: unknown;
  try {
    value = JSON.parse(strFromU8(files["manifest.json"]));
  } catch {
    throw new CanvasError("VALIDATION", "Malformed project manifest");
  }
  const project = validateProject(value);
  delete files["manifest.json"];
  const bundle = { project, assets: files };
  validateBundle(bundle);
  return bundle;
}
const database = () =>
  openDB("data-canvas", 1, {
    upgrade(db) {
      db.createObjectStore("projects");
      db.createObjectStore("settings");
    },
  });
export async function autosave(bundle: Bundle) {
  const db = await database();
  const tx = db.transaction(["projects", "settings"], "readwrite");
  await tx
    .objectStore("projects")
    .put({ bundle, savedAt: Date.now() }, bundle.project.projectId);
  await tx.objectStore("settings").put(bundle.project.projectId, "current");
  await tx.done;
}
export async function recover() {
  const db = await database();
  const id = await db.get("settings", "current");
  if (!id) return null;
  return (await db.get("projects", id))?.bundle as Bundle | null;
}
export async function recoveries(): Promise<
  { bundle: Bundle; savedAt: number }[]
> {
  return (await database()).getAll("projects");
}
export function download(
  name: string,
  data: BlobPart | Uint8Array,
  type = "application/octet-stream",
) {
  const blob = new Blob(
    [data instanceof Uint8Array ? new Uint8Array(data) : data],
    { type },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
