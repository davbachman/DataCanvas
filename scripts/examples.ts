import { writeFile } from "node:fs/promises";
import { example, exampleInfo } from "../src/examples";
import { packBundle } from "../src/persistence/bundle";
const selected = new Set(process.argv.slice(2));
for (const info of exampleInfo.filter(
  (info) => !selected.size || selected.has(info.id),
))
  await writeFile(
    `public/examples/${info.id}.datacanvas`,
    packBundle(await example(info.id)),
  );
