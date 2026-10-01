import { run } from "./api";
process.once("message", async ({ bundle, options }: any) => {
  try {
    const result = await run(bundle, {
      ...options,
      onProgress: (message: string) => process.stderr.write(message + "\n"),
    });
    process.send?.({ result });
  } catch (e) {
    process.send?.({
      error: (e as Error).message,
      code: (e as any).code || "EXECUTION",
    });
  }
});
