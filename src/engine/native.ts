import { DuckDBInstance } from "@duckdb/node-api";
import type { DB } from "../compiler/sql";
export async function nativeDB(memory = "512MB"): Promise<DB> {
  const instance = await DuckDBInstance.create(":memory:", {
    enable_external_access: "false",
    allow_unsigned_extensions: "false",
    memory_limit: memory,
    threads: "2",
  });
  const connection = await instance.connect();
  return {
    insertTextRows: async (name, columns, rows, sourceId) => {
      const appender = await connection.createAppender(name);
      try {
        for (let i = 0; i < rows.length; i++) {
          for (const value of rows[i]) {
            if (value === null) appender.appendNull();
            else appender.appendVarchar(value);
          }
          appender.appendVarchar(`${sourceId}:${i + 1}`);
          appender.endRow();
        }
        appender.flushSync();
      } finally {
        appender.closeSync();
      }
    },
    query: async (sql) => (await connection.runAndReadAll(sql)).getRowObjects(),
    exec: async (sql) => {
      await connection.run(sql);
    },
    close: async () => {
      connection.closeSync();
      instance.closeSync();
    },
  };
}
