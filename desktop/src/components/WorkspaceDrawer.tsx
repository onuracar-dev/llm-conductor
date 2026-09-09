import { useState, useMemo, type FC } from "react";
import {
  FolderOpen,
  Folder,
  FileCode,
  FileText,
  Code2,
  Search,
  X,
  RefreshCw,
  FolderX,
  Copy,
  Check,
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { WorkspaceFile, ChatSession } from "../types";
import { SidebarToggleIcon } from "./SidebarToggleIcon";

interface WorkspaceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  workspacePath?: string;
  files: WorkspaceFile[];
  isLoadingFiles?: boolean;
  onOpenProject: () => void;
  onCloseProject: () => void;
  onRefreshFiles: () => void;
  onSelectFile?: (file: WorkspaceFile) => void;
  // Integrated Chat Sessions
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession?: (id: string, title: string) => void;
}

export const WorkspaceDrawer: FC<WorkspaceDrawerProps> = ({
  isOpen,
  onClose,
  workspacePath,
  files,
  isLoadingFiles,
  onOpenProject,
  onCloseProject,
  onRefreshFiles,
  onSelectFile,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
}) => {
  const [activeTab, setActiveTab] = useState<"files" | "chats">("files");
  const [fileSearchQuery, setFileSearchQuery] = useState("");
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [copiedPath, setCopiedPath] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [isOtherWorkspacesOpen, setIsOtherWorkspacesOpen] = useState(false);

  const folderName = useMemo(() => {
    if (!workspacePath) return "";
    const parts = workspacePath.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts[parts.length - 1] || workspacePath;
  }, [workspacePath]);

  const shortPath = useMemo(() => {
    if (!workspacePath) return "";
    const parts = workspacePath.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts.slice(-2).join("/");
  }, [workspacePath]);

  // Normalize path string helper
  const normalizePath = (p?: string) =>
    (p || "").replace(/\\/g, "/").toLowerCase().replace(/\/$/, "");

  const currentNormPath = normalizePath(workspacePath);

  // Filter & Group Chat Sessions: Current Project vs Other Projects
  const { currentWorkspaceSessions, otherSessions } = useMemo(() => {
    const q = chatSearchQuery.trim().toLowerCase();
    const filtered = sessions.filter((s) =>
      q ? s.title.toLowerCase().includes(q) : true
    );

    const current: ChatSession[] = [];
    const others: ChatSession[] = [];

    for (const session of filtered) {
      const sessionNormPath = normalizePath(session.workspacePath);
      if (currentNormPath && sessionNormPath === currentNormPath) {
        current.push(session);
      } else if (!currentNormPath && !sessionNormPath) {
        current.push(session);
      } else {
        others.push(session);
      }
    }

    return {
      currentWorkspaceSessions: current,
      otherSessions: others,
    };
  }, [sessions, chatSearchQuery, currentNormPath]);

  const filteredFiles = useMemo(() => {
    if (!fileSearchQuery.trim()) return files;
    const q = fileSearchQuery.toLowerCase();
    return files.filter(
      (f) =>
        f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
    );
  }, [files, fileSearchQuery]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTimestamp = (ts: number) => {
    const diffMs = Date.now() - ts;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  const getSessionFolderName = (p?: string) => {
    if (!p) return "General";
    const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts[parts.length - 1] || p;
  };

  const copyWorkspacePath = () => {
    if (!workspacePath) return;
    navigator.clipboard.writeText(workspacePath);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1800);
  };

  const handleStartRename = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
  };

  const handleSaveRename = (sessionId: string) => {
    if (editingTitle.trim() && onRenameSession) {
      onRenameSession(sessionId, editingTitle.trim());
    }
    setEditingSessionId(null);
  };

  const getFileIcon = (fileName: string, isDir: boolean) => {
    if (isDir) {
      return <Folder className="w-3.5 h-3.5 text-amber-500/90 shrink-0" />;
    }
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    if (["html", "htm"].includes(ext)) {
      return <Code2 className="w-3.5 h-3.5 text-orange-500 shrink-0" />;
    }
    if (["ts", "tsx"].includes(ext)) {
      return <Code2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
    }
    if (["js", "jsx", "mjs", "cjs"].includes(ext)) {
      return <Code2 className="w-3.5 h-3.5 text-yellow-500 shrink-0" />;
    }
    if (["json", "yaml", "yml", "toml"].includes(ext)) {
      return <FileCode className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
    }
    if (["css", "scss", "less"].includes(ext)) {
      return <FileCode className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
    }
    if (["md", "txt", "license"].includes(ext)) {
      return <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />;
    }
    return <FileCode className="w-3.5 h-3.5 text-zinc-400 shrink-0" />;
  };

  return (
    <aside
      className={`h-full bg-surface/95 dark:bg-[#0c0c0e]/95 backdrop-blur-2xl flex flex-col shrink-0 select-none z-30 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden will-change-[width,opacity] ${
        isOpen
          ? "w-80 border-r border-black/[0.08] dark:border-white/[0.08] opacity-100 shadow-2xl"
          : "w-0 border-r-0 border-transparent opacity-0 pointer-events-none"
      }`}
    >
      <div
        className={`w-80 h-full flex flex-col shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isOpen ? "translate-x-0" : "-translate-x-12"
        }`}
      >
        {/* 1. Drawer Header */}
        <div className="h-11 px-3 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between shrink-0 bg-black/[0.01] dark:bg-white/[0.01]">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-md bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Folder className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate tracking-tight"
                  title={workspacePath || "No Project Open"}
                >
                  {folderName || "Workspace"}
                </span>
                {workspacePath && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-zinc-500">
                    {files.length}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {workspacePath && (
              <button
                type="button"
                onClick={onRefreshFiles}
                className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors"
                title="Refresh project files"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isLoadingFiles ? "animate-spin text-zinc-600 dark:text-zinc-300" : ""}`}
                />
              </button>
            )}
            {/* Collapse Sidebar Button with matching exact user icon */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors"
              title="Collapse sidebar (Ctrl+B)"
            >
              <SidebarToggleIcon isOpen={true} className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 2. Apple/Dieter Rams Segmented Switcher: Files vs Chats */}
        <div className="px-3 py-1.5 border-b border-black/[0.06] dark:border-white/[0.06] bg-black/[0.01] dark:bg-white/[0.01]">
          <div className="grid grid-cols-2 p-0.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("files")}
              className={`flex items-center justify-center gap-1.5 py-1 rounded-md transition-all ${
                activeTab === "files"
                  ? "bg-surface dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm font-semibold"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              <Folder className="w-3.5 h-3.5 text-amber-500" />
              <span>Files</span>
              {workspacePath && (
                <span className="text-[10px] font-mono px-1 py-0.2 rounded-full bg-black/[0.04] dark:bg-white/[0.08] text-zinc-500">
                  {files.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("chats")}
              className={`flex items-center justify-center gap-1.5 py-1 rounded-md transition-all ${
                activeTab === "chats"
                  ? "bg-surface dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm font-semibold"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
              <span>Chats</span>
              <span className="text-[10px] font-mono px-1 py-0.2 rounded-full bg-black/[0.04] dark:bg-white/[0.08] text-zinc-500">
                {currentWorkspaceSessions.length}
              </span>
            </button>
          </div>
        </div>

        {/* 3. Tab Content */}
        {activeTab === "chats" ? (
          /* CHATS TAB */
          <div className="flex-1 flex flex-col min-h-0 animate-tab-content">
            {/* Action Bar: New Chat Button & Search */}
            <div className="p-2 border-b border-black/[0.06] dark:border-white/[0.06] space-y-1.5">
              <button
                type="button"
                onClick={onNewSession}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-950 text-xs font-medium transition-all shadow-sm group active:scale-[0.99]"
              >
                <Plus className="w-3.5 h-3.5 transition-transform group-hover:rotate-90 duration-200" />
                <span>New Conversation</span>
              </button>

              <div className="relative">
                <Search className="w-3 h-3 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search conversations..."
                  value={chatSearchQuery}
                  onChange={(e) => setChatSearchQuery(e.target.value)}
                  className="w-full pl-7 pr-7 py-1 text-xs rounded-lg bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
                />
                {chatSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setChatSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-3 text-xs">
              {/* Current Workspace Sessions Section */}
              <div>
                <div className="flex items-center justify-between px-2 py-1 text-[11px] font-mono text-zinc-500 tracking-tight">
                  <div className="flex items-center gap-1">
                    <Folder className="w-3 h-3 text-amber-500" />
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300 truncate max-w-[170px]">
                      {folderName || "Current Workspace"}
                    </span>
                  </div>
                  <span>{currentWorkspaceSessions.length}</span>
                </div>

                <div className="space-y-1 mt-1">
                  {currentWorkspaceSessions.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-zinc-400 bg-black/[0.02] dark:bg-white/[0.02] rounded-lg border border-dashed border-black/[0.06] dark:border-white/[0.06]">
                      No conversations in this workspace yet.
                    </div>
                  ) : (
                    currentWorkspaceSessions.map((session) => {
                      const isActive = session.id === activeSessionId;
                      return (
                        <div
                          key={session.id}
                          onClick={() => onSelectSession(session.id)}
                          className={`group relative flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-all border ${
                            isActive
                              ? "bg-black/[0.05] dark:bg-white/[0.08] border-black/[0.08] dark:border-white/[0.1] text-zinc-950 dark:text-zinc-100 font-medium shadow-xs"
                              : "bg-transparent border-transparent hover:bg-black/[0.03] dark:hover:bg-white/[0.04] text-zinc-700 dark:text-zinc-300"
                          }`}
                        >
                          {/* Active accent pill */}
                          {isActive && (
                            <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-zinc-800 dark:bg-zinc-200" />
                          )}

                          <div className="min-w-0 flex-1 pl-1">
                            {editingSessionId === session.id ? (
                              <input
                                type="text"
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveRename(session.id);
                                  if (e.key === "Escape") setEditingSessionId(null);
                                }}
                                onBlur={() => handleSaveRename(session.id)}
                                autoFocus
                                className="w-full bg-surface text-xs font-medium px-1.5 py-0.5 rounded border border-zinc-400 dark:border-zinc-500 outline-none text-zinc-900 dark:text-zinc-100"
                              />
                            ) : (
                              <div
                                onDoubleClick={(e) => handleStartRename(session, e)}
                                className="font-medium truncate text-xs"
                              >
                                {session.title}
                              </div>
                            )}
                            <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono mt-0.5">
                              <span>{formatTimestamp(session.updatedAt)}</span>
                              <span>•</span>
                              <span>{session.messages?.length || 0} msgs</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => handleStartRename(session, e)}
                              className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
                              title="Rename chat"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteSession(session.id);
                              }}
                              className="p-1 rounded text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10"
                              title="Delete chat"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Other Workspaces / Projects Section (Collapsible) */}
              {otherSessions.length > 0 && (
                <div className="border-t border-black/[0.06] dark:border-white/[0.06] pt-2">
                  <button
                    type="button"
                    onClick={() => setIsOtherWorkspacesOpen(!isOtherWorkspacesOpen)}
                    className="w-full flex items-center justify-between px-2 py-1 text-[11px] font-mono text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      {isOtherWorkspacesOpen ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      <span>Other Projects & Chats</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/[0.04] dark:bg-white/[0.06]">
                      {otherSessions.length}
                    </span>
                  </button>

                  {isOtherWorkspacesOpen && (
                    <div className="space-y-1 mt-1 pl-1">
                      {otherSessions.map((session) => {
                        const isActive = session.id === activeSessionId;
                        const targetFolder = getSessionFolderName(session.workspacePath);
                        return (
                          <div
                            key={session.id}
                            onClick={() => onSelectSession(session.id)}
                            className={`group relative flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-all border ${
                              isActive
                                ? "bg-black/[0.05] dark:bg-white/[0.08] border-black/[0.08] dark:border-white/[0.1] text-zinc-950 dark:text-zinc-100 font-medium"
                                : "bg-transparent border-transparent hover:bg-black/[0.03] dark:hover:bg-white/[0.04] text-zinc-700 dark:text-zinc-300"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-black/[0.06] dark:bg-white/[0.08] text-zinc-500 truncate max-w-[80px]">
                                  {targetFolder}
                                </span>
                                <span className="font-medium truncate text-xs">
                                  {session.title}
                                </span>
                              </div>
                              <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                                {formatTimestamp(session.updatedAt)}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteSession(session.id);
                              }}
                              className="p-1 rounded text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Delete chat"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* FILES TAB */
          !workspacePath ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-10 h-10 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.08] flex items-center justify-center mb-3">
                <Folder className="w-5 h-5 text-zinc-500" />
              </div>
              <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
                No Workspace Opened
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed mb-4">
                Bind Conductor to any local folder to start inspecting, editing, and executing autonomous code.
              </p>
              <button
                type="button"
                onClick={onOpenProject}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-950 text-xs font-medium shadow-sm transition-all"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Select Folder</span>
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 animate-tab-content">
              {/* Path subtitle row with copy icon */}
              <div className="flex items-center justify-between px-3 py-1.5 bg-black/[0.02] dark:bg-white/[0.02] border-b border-black/[0.04] dark:border-white/[0.04] text-[10px] text-zinc-500 font-mono">
                <span className="truncate pr-2" title={workspacePath}>
                  {shortPath}
                </span>
                <button
                  type="button"
                  onClick={copyWorkspacePath}
                  className="hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors p-0.5"
                  title={copiedPath ? "Copied!" : "Copy full folder path"}
                >
                  {copiedPath ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>

              {/* Search Input */}
              <div className="p-2 border-b border-black/[0.06] dark:border-white/[0.06]">
                <div className="relative">
                  <Search className="w-3 h-3 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search files..."
                    value={fileSearchQuery}
                    onChange={(e) => setFileSearchQuery(e.target.value)}
                    className="w-full pl-7 pr-7 py-1 text-xs rounded-lg bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
                  />
                  {fileSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setFileSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* File Tree List */}
              <div className="flex-1 overflow-y-auto px-1.5 py-1.5 space-y-0.5 text-xs">
                {filteredFiles.length === 0 ? (
                  <div className="p-6 text-center text-xs text-zinc-400">
                    {isLoadingFiles ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <RefreshCw className="w-3 h-3 animate-spin text-zinc-500 dark:text-zinc-400" />
                        <span>Indexing files...</span>
                      </div>
                    ) : (
                      <span>No files matching query</span>
                    )}
                  </div>
                ) : (
                  filteredFiles.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => onSelectFile?.(file)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.05] text-left transition-colors group cursor-pointer"
                      title="Click to reference @file in prompt"
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        {getFileIcon(file.name, file.is_dir)}
                        <span className="text-zinc-700 dark:text-zinc-300 font-medium truncate group-hover:text-zinc-950 dark:group-hover:text-white">
                          {file.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-zinc-400 font-mono group-hover:hidden">
                          {file.is_dir ? "folder" : formatFileSize(file.size)}
                        </span>
                        <span className="text-[10px] text-zinc-600 dark:text-zinc-300 font-mono font-medium hidden group-hover:inline">
                          + @chat
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Footer: Switch/Unlink Folder */}
              <div className="p-2 border-t border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between bg-surface/50">
                <button
                  type="button"
                  onClick={onOpenProject}
                  className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Switch Folder</span>
                </button>
                <button
                  type="button"
                  onClick={onCloseProject}
                  className="text-[11px] font-medium text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1 px-2 py-1 rounded hover:bg-rose-500/10 transition-colors"
                  title="Disconnect this project folder"
                >
                  <FolderX className="w-3.5 h-3.5" />
                  <span>Unlink</span>
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </aside>
  );
};
