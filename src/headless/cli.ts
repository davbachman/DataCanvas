#!/usr/bin/env node
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from "node:worker_threads";
import { load, inspect, run } from "./api";
import { validateBundle } from "../engine/core";
const exitCodes: Record<string, number> = {
  VALIDATION: 2,
  CYCLE: 2,
  DRAFT: 2,
  SOURCE: 3,
  SCHEMA: 3,
  EXECUTION: 4,
  BLOCKED: 4,
  QUERY_POLICY: 4,
  CANCELED: 5,
  RESOURCE_LIMIT: 6,
};
const emit = (v: unknown) =>
  JSON.stringify(v, (_, v) =>
    typeof v === "bigint" ? { type: "integer", value: String(v) } : v,
  );
async function main() {
  const [command, path, ...args] = process.argv.slice(2);
  if (!["validate", "inspect", "run"].includes(command) || !path) {
    process.stdout.write(
      emit({
        status: "error",
        code: "VALIDATION",
        message:
          "Usage: npm run runner -- validate|inspect|run PROJECT.datacanvas [--outputs id,id] [--source-overrides manifest.json] [--out DIR] [--timeout-ms 60000] [--memory-mb 512] [--max-rows 1000000]",
      }) + "\n",
    );
    process.exitCode = 2;
    return;
  }
  const options = Object.fromEntries(
    Array.from({ length: Math.ceil(args.length / 2) }, (_, i) => [
      args[i * 2],
      args[i * 2 + 1],
    ]),
  );
  try {
    const bundle = await load(path);
    validateBundle(bundle);
    if (command === "validate") {
      console.log(
        emit({
          status: "valid",
          schemaVersion: bundle.project.schemaVersion,
          projectId: bundle.project.projectId,
        }),
      );
      return;
    }
    if (command === "inspect") {
      console.log(emit(inspect(bundle)));
      return;
    }
    const timeout = Number(options["--timeout-ms"] || 60000),
      memory = Number(options["--memory-mb"] || 512),
      max = Number(options["--max-rows"] || 1000000);
    if (![timeout, memory, max].every((v) => Number.isInteger(v) && v > 0))
      throw Object.assign(new Error("Limits must be positive integers"), {
        code: "VALIDATION",
      });
    const overrides = options["--source-overrides"]
      ? JSON.parse(await readFile(options["--source-overrides"], "utf8"))
      : undefined;
    // Run in a separate process so a native DuckDB query can be terminated by the caller's wall-clock limit.
    const { fork } = await import("node:child_process");
    const child = fork(new URL("./process.ts", import.meta.url), [], {
      execArgv: ["--import", "tsx", `--max-old-space-size=${memory}`],
      stdio: ["ignore", "inherit", "inherit", "ipc"],
      serialization: "advanced",
    });
    const result: any = await new Promise((resolve, reject) => {
      const canceled = () => {
        clearTimeout(timer);
        child.kill("SIGKILL");
        reject(
          Object.assign(new Error("Canceled by caller"), { code: "CANCELED" }),
        );
      };
      process.once("SIGINT", canceled);
      process.once("SIGTERM", canceled);
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(
          Object.assign(new Error(`Execution exceeded ${timeout} ms`), {
            code: "RESOURCE_LIMIT",
          }),
        );
      }, timeout);
      child.on("message", (message: any) => {
        process.removeListener("SIGINT", canceled);
        process.removeListener("SIGTERM", canceled);
        clearTimeout(timer);
        child.disconnect();
        message.error
          ? reject(
              Object.assign(new Error(message.error), { code: message.code }),
            )
          : resolve(message.result);
      });
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("exit", (code, signal) => {
        process.removeListener("SIGINT", canceled);
        process.removeListener("SIGTERM", canceled);
        if (signal || (code && code !== 0)) {
          clearTimeout(timer);
          reject(
            Object.assign(new Error(`Runner exited ${code}`), {
              code: "RESOURCE_LIMIT",
            }),
          );
        }
      });
      child.send({
        bundle,
        options: {
          outputIds: options["--outputs"]?.split(","),
          sourceOverrides: overrides,
          memory: `${memory}MB`,
          maxOutputRows: max,
          maxSourceRows: max,
          previewRows: max,
        },
      });
    });
    const out = resolve(options["--out"] || "data-canvas-results");
    await mkdir(out, { recursive: true });
    await writeFile(resolve(out, "result.json"), emit(result));
    console.log(
      emit({
        status: result.status,
        resultVersion: 1,
        resultPath: resolve(out, "result.json"),
        errors: result.errors,
      }),
    );
    if (result.status === "failed")
      process.exitCode = exitCodes[result.errors[0]?.code] || 4;
  } catch (e) {
    const code = (e as any).code || "EXECUTION";
    console.log(emit({ status: "error", code, message: (e as Error).message }));
    process.exitCode = exitCodes[code] || 4;
  }
}
await main();
