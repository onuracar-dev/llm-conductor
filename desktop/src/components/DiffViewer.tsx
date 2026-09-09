import { useMemo, type FC } from "react";
import { Check, X, FilePlus, FileEdit } from "lucide-react";
import { FileDiff } from "../types";

interface DiffViewerProps {
  diff: FileDiff;
  onApprove: (path: string) => void;
  onReject: (path: string) => void;
}

interface DiffLine {
  type: "added" | "removed" | "unchanged";
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

export const DiffViewer: FC<DiffViewerProps> = ({ diff, onApprove, onReject }) => {
  // Simple LCS or line comparison for clean visual diff
  const { lines, additions, deletions } = useMemo(() => {
    const oldLines = diff.oldContent ? diff.oldContent.split("\n") : [];
    const newLines = diff.newContent ? diff.newContent.split("\n") : [];

    if (diff.isNewFile || oldLines.length === 0) {
      const added: DiffLine[] = newLines.map((content, idx) => ({
        type: "added",
        newLineNumber: idx + 1,
        content,
      }));
      return { lines: added, additions: added.length, deletions: 0 };
    }

    const result: DiffLine[] = [];
    let addCount = 0;
    let delCount = 0;

    // LCS table for computing minimal edit script
    const m = oldLines.length;
    const n = newLines.length;
    
    // For very large files, limit LCS computation to prevent freezing
    if (m * n > 250000) {
      // Fallback simple line-by-line diff for massive files
      for (let i = 0; i < Math.max(m, n); i++) {
        if (i < m && i < n && oldLines[i] === newLines[i]) {
          result.push({ type: "unchanged", oldLineNumber: i + 1, newLineNumber: i + 1, content: oldLines[i] });
        } else {
          if (i < m) {
            delCount++;
            result.push({ type: "removed", oldLineNumber: i + 1, content: oldLines[i] });
          }
          if (i < n) {
            addCount++;
            result.push({ type: "added", newLineNumber: i + 1, content: newLines[i] });
          }
        }
      }
      return { lines: result, additions: addCount, deletions: delCount };
    }

    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldLines[i - 1] === newLines[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    let i = m;
    let j = n;
    const backtrack: DiffLine[] = [];

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        backtrack.push({
          type: "unchanged",
          oldLineNumber: i,
          newLineNumber: j,
          content: oldLines[i - 1],
        });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        addCount++;
        backtrack.push({
          type: "added",
          newLineNumber: j,
          content: newLines[j - 1],
        });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        delCount++;
        backtrack.push({
          type: "removed",
          oldLineNumber: i,
          content: oldLines[i - 1],
        });
        i--;
      }
    }

    backtrack.reverse();
    return { lines: backtrack, additions: addCount, deletions: delCount };
  }, [diff.oldContent, diff.newContent, diff.isNewFile]);

  return (
    <div className="my-3 rounded-xl border border-black/[0.1] dark:border-white/[0.1] bg-surface overflow-hidden shadow-subtle text-xs">
      {/* Diff Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-black/[0.02] dark:bg-white/[0.03] border-b border-black/[0.08] dark:border-white/[0.08]">
        <div className="flex items-center gap-2 min-w-0">
          {diff.isNewFile ? (
            <FilePlus className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          ) : (
            <FileEdit className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          )}
          <span className="font-mono font-medium text-zinc-800 dark:text-zinc-200 truncate">
            {diff.path}
          </span>
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            {diff.isNewFile ? (
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px]">
                New file
              </span>
            ) : null}
            <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span>
            <span className="text-rose-600 dark:text-rose-400">-{deletions}</span>
          </div>
        </div>

        {/* Approval Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {diff.approved === undefined ? (
            <>
              <button
                type="button"
                onClick={() => onReject(diff.path)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-all apple-tap-sm"
              >
                <X className="w-3 h-3" />
                <span>Reject</span>
              </button>
              <button
                type="button"
                onClick={() => onApprove(diff.path)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-950 font-medium text-xs shadow-sm transition-all apple-tap-sm"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Approve & Apply</span>
              </button>
            </>
          ) : diff.approved ? (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
              <Check className="w-3 h-3" />
              Applied
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-500/10 text-zinc-500 text-xs font-medium">
              <X className="w-3 h-3" />
              Rejected
            </span>
          )}
        </div>
      </div>

      {/* Diff Code Body */}
      <div className="overflow-x-auto max-h-72 overflow-y-auto font-mono text-[11px] leading-snug divide-y divide-black/[0.03] dark:divide-white/[0.03]">
        {lines.map((line, idx) => {
          const isAdd = line.type === "added";
          const isDel = line.type === "removed";

          return (
            <div
              key={idx}
              className={`flex items-start px-3 py-0.5 ${
                isAdd
                  ? "bg-emerald-500/[0.08] text-emerald-800 dark:text-emerald-300"
                  : isDel
                  ? "bg-rose-500/[0.08] text-rose-800 dark:text-rose-300 line-through decoration-rose-400/50"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-black/[0.01] dark:hover:bg-white/[0.01]"
              }`}
            >
              {/* Line numbers */}
              <div className="w-8 shrink-0 select-none text-right pr-2 text-zinc-400 dark:text-zinc-600 text-[10px]">
                {line.oldLineNumber || ""}
              </div>
              <div className="w-8 shrink-0 select-none text-right pr-3 text-zinc-400 dark:text-zinc-600 text-[10px]">
                {line.newLineNumber || ""}
              </div>

              {/* Marker */}
              <div className="w-4 select-none font-bold shrink-0 text-center">
                {isAdd ? "+" : isDel ? "-" : " "}
              </div>

              {/* Content */}
              <pre className="flex-1 overflow-x-visible whitespace-pre">
                <code>{line.content || " "}</code>
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
};
