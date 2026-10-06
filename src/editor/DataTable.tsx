import { useState } from "react";
import type { TableResult } from "../engine/core";
import { displayValue } from "../engine/core";
export function DataTable({
  table,
  onSelect,
  selected,
  compact = false,
}: {
  table: TableResult | undefined;
  onSelect?: (index: number) => void;
  selected?: number;
  compact?: boolean;
}) {
  const [page, setPage] = useState(0);
  if (!table)
    return (
      <div className="empty-state small">
        <span className="empty-symbol">▦</span>
        <h3>A table will appear here</h3>
        <p>Run your recipe or select an evaluated step.</p>
      </div>
    );
  const pageSize = 100,
    max = Math.max(0, Math.ceil(table.rows.length / pageSize) - 1),
    current = Math.min(page, max);
  return (
    <div className={"data-table " + (compact ? "compact" : "")}>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th className="row-number">#</th>
              {table.columns.map((c) => (
                <th
                  key={c.id}
                  title={`${c.type}${c.type === "timestamp" ? " · " + (c.timeBasis || "utc") + (c.timeZone ? " / " + c.timeZone : "") : ""} · ${c.role}${c.units ? " · " + c.units : ""}`}
                >
                  <span className="type-icon">
                    {c.type === "text"
                      ? "Aa"
                      : c.type === "date"
                        ? "◷"
                        : c.type === "boolean"
                          ? "◐"
                          : "#"}
                  </span>
                  {c.name}
                  {c.units && <small> {c.units}</small>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows
              .slice(current * pageSize, (current + 1) * pageSize)
              .map((row, i) => (
                <tr
                  key={i}
                  className={
                    selected === i + current * pageSize ? "selected" : ""
                  }
                  onClick={() => onSelect?.(i + current * pageSize)}
                  tabIndex={onSelect ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSelect?.(i + current * pageSize);
                  }}
                >
                  <td className="row-number">{current * pageSize + i + 1}</td>
                  {table.columns.map((c) => (
                    <td
                      key={c.id}
                      className={
                        row[c.id] === null
                          ? "null-value"
                          : c.role === "quantitative"
                            ? "numeric"
                            : ""
                      }
                      title={displayValue(row[c.id])}
                    >
                      {displayValue(row[c.id])}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
        {table.rowCount === 0 && (
          <p className="empty-table">Valid empty result · 0 rows</p>
        )}
      </div>
      <div className="table-footer">
        <span>
          Showing {Math.min(current * pageSize + 1, table.rows.length)}–
          {Math.min((current + 1) * pageSize, table.rows.length)} of{" "}
          <strong>{table.rowCount.toLocaleString()}</strong> rows ·{" "}
          {table.columns.length} columns
        </span>
        <span>{table.ordered ? "Explicit sort" : "Preview order only"}</span>
        {max > 0 && (
          <span>
            <button
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </button>
            <button
              disabled={current === max}
              onClick={() => setPage(current + 1)}
            >
              Next
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
export function Profiles({
  table,
  loadDistribution,
}: {
  table?: TableResult;
  loadDistribution?: (tableId: string, columnId: string) => Promise<any[]>;
}) {
  const [distributions, setDistributions] = useState<Record<string, any[]>>({});
  const [error, setError] = useState("");
  return (
    <div className="profiles">
      {table?.profiles.map((p) => {
        const c = table.columns.find((c) => c.id === p.columnId)!;
        return (
          <article key={p.columnId}>
            <h4>
              {c.name} <span>{c.type}</span>
            </h4>
            <div className="quality-bar">
              <i
                style={{
                  width: `${table.rowCount ? (100 * (table.rowCount - p.missing)) / table.rowCount : 0}%`,
                }}
              />
            </div>
            <dl>
              <dt>Nonmissing</dt>
              <dd>{table.rowCount - p.missing}</dd>
              <dt>Missing</dt>
              <dd>{p.missing}</dd>
              <dt>Distinct (nonmissing)</dt>
              <dd>{p.distinct}</dd>
              <dt>Minimum</dt>
              <dd>{displayValue(p.min)}</dd>
              <dt>Maximum</dt>
              <dd>{displayValue(p.max)}</dd>
            </dl>
            <button
              className="distribution-button"
              onClick={async () => {
                try {
                  const values = await loadDistribution?.(table!.id, c.id);
                  setDistributions((d) => ({ ...d, [c.id]: values || [] }));
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Inspect distribution
            </button>
            {distributions[c.id] && (
              <div className="distribution">
                <small>12 most frequent values · exact full-table counts</small>
                {distributions[c.id].map((d, i) => (
                  <div key={i}>
                    <span title={displayValue(d.value)}>
                      {displayValue(d.value)}
                    </span>
                    <i
                      style={{
                        width: `${(d.count / Math.max(...distributions[c.id].map((x) => x.count))) * 70}px`,
                      }}
                    />
                    <b>{d.count}</b>
                  </div>
                ))}
              </div>
            )}
            {error && <small>{error}</small>}
          </article>
        );
      })}
    </div>
  );
}
