export class WorkerClient {
  worker: Worker;
  generation = 0;
  counter = 0;
  pending = new Map<
    number,
    {
      resolve: (v: any) => void;
      reject: (e: Error) => void;
      progress?: (s: string) => void;
    }
  >();
  constructor() {
    this.worker = this.create();
  }
  create() {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = ({ data }) => {
      if (data.generation !== this.generation) return;
      const p = this.pending.get(data.id);
      if (!p) return;
      if (data.progress) {
        p.progress?.(data.progress);
        return;
      }
      this.pending.delete(data.id);
      data.error ? p.reject(new Error(data.error)) : p.resolve(data.result);
    };
    worker.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(new Error(e.message));
      this.pending.clear();
    };
    return worker;
  }
  request(
    kind: string,
    payload: Record<string, any>,
    progress?: (s: string) => void,
  ) {
    return new Promise<any>((resolve, reject) => {
      const id = ++this.counter;
      this.pending.set(id, { resolve, reject, progress });
      this.worker.postMessage({
        id,
        generation: this.generation,
        kind,
        ...payload,
      });
    });
  }
  invalidate() {
    if (this.pending.size) this.cancel();
    else this.generation++;
  }
  cancel() {
    this.generation++;
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(new Error("Canceled"));
    this.pending.clear();
    this.worker = this.create();
  }
  dispose() {
    this.cancel();
    this.worker.terminate();
  }
}
