import { cn } from "@/lib/utils";

/**
 * Generic server-rendered data table (DRY table for the domain modules).
 * Columns declare a header + an accessor returning a renderable value.
 */

export interface DataColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  mono?: boolean;
  render: (row: T) => React.ReactNode;
}

export function DataTable<T>({
  rows,
  columns,
  testId,
  emptyMessage = "No records yet.",
}: {
  rows: T[];
  columns: DataColumn<T>[];
  testId?: string;
  emptyMessage?: string;
}) {
  return (
    <div className="glass overflow-hidden rounded-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid={testId}>
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    "px-4 py-3 font-medium",
                    column.align === "right" && "text-right",
                    column.align === "center" && "text-center",
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={index}
                className="border-b border-border/60 last:border-0 hover:bg-secondary/30"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-4 py-3",
                      column.align === "right" && "text-right tabular-nums",
                      column.align === "center" && "text-center",
                      column.mono && "font-mono text-xs",
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <div className="px-4 py-12 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      )}
    </div>
  );
}
