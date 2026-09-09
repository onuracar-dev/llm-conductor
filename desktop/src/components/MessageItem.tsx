import { useState, type FC } from "react";
import { Copy, Check, Terminal, AlertTriangle, Zap } from "lucide-react";
import { ChatMessage } from "../types";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallBadge } from "./ToolCallBadge";
import { DiffViewer } from "./DiffViewer";

interface MessageItemProps {
  message: ChatMessage;
  isStreaming?: boolean;
  onApproveDiff?: (messageId: string, diffPath: string) => void;
  onRejectDiff?: (messageId: string, diffPath: string) => void;
  onContinue?: (messageId: string) => void;
}

export const MessageItem: FC<MessageItemProps> = ({
  message,
  isStreaming = false,
  onApproveDiff,
  onRejectDiff,
  onContinue,
}) => {
  const [copied, setCopied] = useState(false);

  const copyContent = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isUser = message.role === "user";

  // Render inline markdown elements (bold, inline code)
  const renderInlineText = (text: string) => {
    // Split by inline code first: `...`
    const codeParts = text.split(/(`[^`]+`)/g);

    return codeParts.map((codePart, i) => {
      if (codePart.startsWith("`") && codePart.endsWith("`")) {
        return (
          <code
            key={i}
            className="px-1.5 py-0.5 rounded bg-black/[0.05] dark:bg-white/[0.07] text-zinc-800 dark:text-zinc-200 font-mono text-[11px] border border-black/[0.08] dark:border-white/[0.08]"
          >
            {codePart.slice(1, -1)}
          </code>
        );
      }

      // Split by bold: **...**
      const boldParts = codePart.split(/(\*\*[^*]+\*\*)/g);
      return boldParts.map((boldPart, j) => {
        if (boldPart.startsWith("**") && boldPart.endsWith("**")) {
          return (
            <strong key={`${i}-${j}`} className="font-semibold text-zinc-900 dark:text-zinc-100">
              {boldPart.slice(2, -2)}
            </strong>
          );
        }
        return <span key={`${i}-${j}`}>{boldPart}</span>;
      });
    });
  };

  // Clean code block formatter without heavy deps
  const renderFormattedContent = (rawContent: string) => {
    // If text has an unclosed code block (e.g. streaming or truncated), auto-close it so it renders inside the code container
    const backtickCount = (rawContent.match(/```/g) || []).length;
    const isUnclosed = backtickCount % 2 !== 0;
    const content = isUnclosed ? `${rawContent}\n\`\`\`` : rawContent;

    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      if (part.startsWith("```") && part.endsWith("```")) {
        const lines = part.slice(3, -3).trim().split("\n");
        const language = lines[0]?.match(/^[a-zA-Z0-9_-]+$/) ? lines[0] : "";
        const code = language ? lines.slice(1).join("\n") : lines.join("\n");

        return (
          <div key={index} className="my-3 rounded-xl overflow-hidden border border-black/[0.08] dark:border-white/[0.08] bg-[#f4f4f6] dark:bg-[#0c0c0e] text-xs font-mono shadow-subtle">
            <div className="flex items-center justify-between px-3.5 py-2 bg-black/[0.02] dark:bg-white/[0.03] border-b border-black/[0.06] dark:border-white/[0.06] text-zinc-600 dark:text-zinc-400">
              <div className="flex items-center gap-1.5 text-[11px] font-medium">
                <Terminal className="w-3 h-3 text-zinc-500" />
                <span>{language || "code"}</span>
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(code)}
                className="hover:text-zinc-900 dark:hover:text-zinc-200 text-[10px] flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-black/[0.05] dark:hover:bg-white/[0.05] transition-colors"
                title="Copy code"
              >
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </button>
            </div>
            <pre className="p-4 overflow-x-auto text-zinc-800 dark:text-zinc-200 leading-relaxed selection:bg-black/10 dark:selection:bg-white/15">
              <code>{code}</code>
            </pre>
          </div>
        );
      }

      return (
        <span key={index} className="whitespace-pre-wrap leading-relaxed">
          {renderInlineText(part)}
        </span>
      );
    });
  };

  if (isUser) {
    return (
      <div className="w-full flex justify-end my-3 px-4 animate-message-user">
        <div className="max-w-2xl bg-surface-elevated border border-black/[0.08] dark:border-white/[0.08] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 shadow-subtle leading-relaxed">
          {message.steered && (
            <div className="flex items-center gap-1 text-[10px] font-mono text-amber-600 dark:text-amber-400 mb-1.5 pb-1 border-b border-amber-500/20">
              <Zap className="w-3 h-3" />
              <span>Steered Mid-Flight</span>
            </div>
          )}
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full my-4 px-4 group animate-message-assistant">
      <div className="max-w-3xl mx-auto">
        {/* Model header info */}
        <div className="flex items-center justify-between text-xs text-zinc-500 font-mono mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" />
            <span className="font-medium text-zinc-600 dark:text-zinc-400">{message.model || "Assistant"}</span>
            {message.usage && (
              <span className="text-[10px] text-zinc-400 dark:text-zinc-600 ml-1">
                • {message.usage.totalTokens.toLocaleString()} tokens (${message.usage.costUSD.toFixed(4)})
              </span>
            )}
          </div>

          <button
            onClick={copyContent}
            className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-zinc-900 hover:bg-black/[0.05] dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-white/[0.05] rounded transition-all apple-tap"
            title="Copy response"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Reasoning block if present */}
        {message.reasoning && (
          <ThinkingBlock
            reasoning={message.reasoning}
            isStreaming={isStreaming && !message.content && (!message.toolCalls || message.toolCalls.length === 0)}
            durationMs={message.thinkingDurationMs}
          />
        )}

        {/* Tool Call Badges if present */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {message.toolCalls.map((tc) => (
              <ToolCallBadge key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {/* File Diffs if present */}
        {message.fileDiffs && message.fileDiffs.length > 0 && (
          <div className="space-y-2 mb-3">
            {message.fileDiffs.map((diff) => (
              <DiffViewer
                key={diff.path}
                diff={diff}
                onApprove={(p) => onApproveDiff?.(message.id, p)}
                onReject={(p) => onRejectDiff?.(message.id, p)}
              />
            ))}
          </div>
        )}

        {/* Assistant Content */}
        {message.content && (
          <div className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed selection:bg-black/10 dark:selection:bg-white/15">
            {renderFormattedContent(message.content)}
            {isStreaming && (
              <span className="inline-block w-1.5 h-4 bg-zinc-500 dark:bg-zinc-400 ml-1 animate-pulse align-middle" />
            )}
          </div>
        )}

        {/* Token limit cutoff notice */}
        {message.finishReason && (message.finishReason === "MAX_TOKENS" || message.finishReason === "length") && (
          <div className="mt-3 flex items-center justify-between px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
              <span>Response reached token limit. The code output was truncated.</span>
            </div>
            {onContinue && (
              <button
                onClick={() => onContinue(message.id)}
                className="px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 dark:text-amber-200 font-medium transition-colors text-[11px] apple-tap-sm"
              >
                Continue Generating
              </button>
            )}
          </div>
        )}

        {!message.content && isStreaming && !message.reasoning && (
          <div className="flex items-center gap-2.5 text-xs text-zinc-400 font-mono py-1.5">
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 dark:bg-zinc-400 animate-breathing-dot-1" />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 dark:bg-zinc-400 animate-breathing-dot-2" />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 dark:bg-zinc-400 animate-breathing-dot-3" />
            </span>
            <span className="text-shimmer font-medium">Formulating response...</span>
          </div>
        )}
      </div>
    </div>
  );
};
