import { Table, vectorFromArray, Utf8 } from "apache-arrow";
import * as duckdb from "@duckdb/duckdb-wasm";
import wasmUrl from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import workerUrl from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import type { DB } from "../compiler/sql";
export async function wasmDB(): Promise<DB> {
  const worker = new Worker(workerUrl);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  await db.instantiate(wasmUrl);
  await db.open({
    query: {
      castBigIntToDouble: false,
      castDecimalToDouble: false,
      castTimestampToDate: true,
    },
  });
  const c = await db.connect();
  await c.query(
    "SET enable_external_access=false; SET threads=1; SET memory_limit='512MB'",
  );
  return {
    insertTextRows: async (name, columns, rows, sourceId) => {
      for (let i = 0; i < rows.length; i += 10000) {
        const batch = rows.slice(i, i + 10000);
        const arrays = Object.fromEntries(
          columns.map((id, index) => [
            id,
            vectorFromArray(
              batch.map((row) => row[index]),
              new Utf8(),
            ),
          ]),
        );
        arrays.__rid = vectorFromArray(
          batch.map((_, j) => `${sourceId}:${i + j + 1}`),
          new Utf8(),
        );
        await c.insertArrowTable(new Table(arrays), { name, create: false });
      }
    },
    query: async (sql) =>
      (await c.query(sql))
        .toArray()
        .map((r) => Object.fromEntries(Object.entries(r.toJSON()))),
    exec: async (sql) => {
      await c.query(sql);
    },
    close: async () => {
      await c.close();
      await db.terminate();
      worker.terminate();
    },
  };
}
