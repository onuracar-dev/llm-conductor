import { useState, type FC } from "react";
import { X, Plus, Search, MessageSquare, Trash2, Calendar } from "lucide-react";
import { ChatSession } from "../types";

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession?: (id: string, title: string) => void;
}

export const HistoryDrawer: FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}) => {
  const [search, setSearch] = useState("");

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <aside
      className={`h-full bg-surface/95 backdrop-blur-2xl flex flex-col shrink-0 select-none z-40 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden will-change-[width,opacity] ${
        isOpen
          ? "w-80 border-r border-black/[0.06] dark:border-white/[0.06] opacity-100 shadow-2xl"
          : "w-0 border-r-0 border-transparent opacity-0 pointer-events-none"
      }`}
    >
      <div className="w-80 h-full flex flex-col shrink-0">
        {/* Header */}
        <div className="h-11 px-3.5 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-purple-500/10 dark:bg-purple-500/15 border border-purple-500/20 flex items-center justify-center">
              <MessageSquare className="w-3 h-3 text-purple-600 dark:text-purple-400" />
            </div>
            <span className="font-semibold text-xs text-zinc-800 dark:text-zinc-200">
              Chat History
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-zinc-500">
              {sessions.length}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onNewSession}
              className="p-1 rounded-md text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
              title="New Chat Session"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
              title="Close history"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-2 border-b border-black/[0.04] dark:border-white/[0.04]">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] rounded-lg pl-8 pr-2.5 py-1 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-purple-500/50"
            />
          </div>
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredSessions.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-500">
              {search ? "No sessions found" : "No saved sessions yet"}
            </div>
          ) : (
            filteredSessions.map((s) => {
              const isActive = s.id === activeSessionId;
              const dateStr = new Date(s.updatedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              });

              return (
                <div
                  key={s.id}
                  onClick={() => onSelectSession(s.id)}
                  className={`group relative flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                    isActive
                      ? "bg-purple-500/[0.08] dark:bg-purple-500/[0.12] border border-purple-500/30 text-purple-900 dark:text-purple-100"
                      : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04] border border-transparent text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="text-xs font-medium truncate mb-1">
                      {s.title || "Untitled Session"}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-2.5 h-2.5" />
                        {dateStr}
                      </span>
                      <span>•</span>
                      <span>{s.messages.length} msgs</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(s.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition-opacity"
                    title="Delete session"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-2.5 border-t border-black/[0.06] dark:border-white/[0.06] text-[10px] text-zinc-500 text-center font-mono">
          Stored securely in local app storage
        </div>
      </div>
    </aside>
  );
};
