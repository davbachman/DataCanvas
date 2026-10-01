import { writeFile } from "node:fs/promises";
import { example, exampleInfo } from "../src/examples";
import { packBundle } from "../src/persistence/bundle";
for (const info of exampleInfo)
  await writeFile(
    `public/examples/${info.id}.datacanvas`,
    packBundle(await example(info.id)),
  );
