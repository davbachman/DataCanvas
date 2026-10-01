import {
  dependencies,
  topological,
  type Project,
  type Ref,
} from "../domain/model";
export function Overview({
  project,
  onOpen,
  onInspect,
}: {
  project: Project;
  onOpen: (kind: string, id: string) => void;
  onInspect: (ref: Ref) => void;
}) {
  const levels = new Map<string, number>();
  project.sources.forEach((s) => levels.set(s.id, 0));
  let cycle = "";
  try {
    for (const id of topological(project)) {
      const r = project.recipes.find((r) => r.id === id)!;
      levels.set(
        id,
        1 + Math.max(0, ...dependencies(r).map((d) => levels.get(d.id) || 0)),
      );
    }
  } catch (e) {
    cycle = (e as Error).message;
    project.recipes.forEach((r) => levels.set(r.id, 1));
  }
  project.charts.forEach((c) =>
    levels.set(c.id, (levels.get(c.inputRecipeId) || 0) + 1),
  );
  const counts: Record<number, number> = {};
  const nodes = [
    ...project.sources.map((s) => ({ ...s, kind: "source" })),
    ...project.recipes.map((r) => ({ ...r, kind: "recipe" })),
    ...project.charts.map((c) => ({ ...c, kind: "chart" })),
  ].map((n) => {
    const level = levels.get(n.id) || 0,
      index = counts[level] || 0;
    counts[level] = index + 1;
    return { ...n, x: 30 + level * 270, y: 40 + index * 115 };
  });
  const edges = [
    ...project.recipes.flatMap((r) =>
      dependencies(r).map((d) => ({ from: d.id, to: r.id, ref: d })),
    ),
    ...project.charts.map((c) => ({
      from: c.inputRecipeId,
      to: c.id,
      ref: { kind: "recipe" as const, id: c.inputRecipeId },
    })),
  ];
  return (
    <section className="overview">
      <div className="editor-heading">
        <div>
          <div className="eyebrow">Follow the data</div>
          <h2>One project. Connected ideas.</h2>
          <p className="muted">
            Open an object to edit it. Select a connection to inspect the
            referenced table.
          </p>
        </div>
      </div>
      {cycle && <p className="error-box">{cycle}</p>}
      <div className="graph-scroll">
        <svg
          role="img"
          aria-label="Read-only dependency overview"
          width={Math.max(...nodes.map((n) => n.x + 250), 800)}
          height={Math.max(...nodes.map((n) => n.y + 130), 500)}
        >
          {edges.map((e, i) => {
            const a = nodes.find((n) => n.id === e.from),
              b = nodes.find((n) => n.id === e.to);
            if (!a || !b) return null;
            return (
              <g
                key={i}
                role="button"
                tabIndex={0}
                aria-label={`Inspect connection from ${a.name} to ${b.name}`}
                onClick={() => onInspect(e.ref)}
                onKeyDown={(k) => k.key === "Enter" && onInspect(e.ref)}
              >
                <path
                  className="graph-hit"
                  d={`M${a.x + 215},${a.y + 36} C${a.x + 250},${a.y + 36} ${b.x - 35},${b.y + 36} ${b.x},${b.y + 36}`}
                />
                <path
                  className="graph-edge"
                  d={`M${a.x + 215},${a.y + 36} C${a.x + 250},${a.y + 36} ${b.x - 35},${b.y + 36} ${b.x},${b.y + 36}`}
                />
              </g>
            );
          })}
          {nodes.map((n) => (
            <g
              role="button"
              tabIndex={0}
              aria-label={`Open ${n.name}`}
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              onClick={() => onOpen(n.kind, n.id)}
              onKeyDown={(e) => e.key === "Enter" && onOpen(n.kind, n.id)}
            >
              <rect
                width="215"
                height="75"
                rx="8"
                className={"graph-node " + n.kind}
              />
              <text x="16" y="24" className="graph-kind">
                {n.kind.toUpperCase()}
              </text>
              <text x="16" y="49" className="graph-name">
                {n.name.length > 25 ? n.name.slice(0, 24) + "…" : n.name}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}
