import { useState, type FC } from "react";
import { X, Copy, Check, Terminal } from "lucide-react";
import { ChatMessage, ModelOption } from "../types";

interface ExportCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  currentModel: ModelOption;
}

export const ExportCodeModal: FC<ExportCodeModalProps> = ({
  isOpen,
  onClose,
  messages,
  currentModel,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const modelArg = currentModel.isCustom ? `\n  model: "${currentModel.id}",` : "";
  const generatedCode = `import { Conductor } from "llm-conductor";

// Initialize Conductor with ${currentModel.name}
const conductor = new Conductor({
  provider: "${currentModel.provider}",${modelArg}
  apiKey: process.env.${currentModel.provider.toUpperCase()}_API_KEY!,
});

async function main() {
${messages
  .filter((m) => m.role === "user" || m.role === "assistant")
  .map((m) => `  conductor.${m.role}("${m.content.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}");`)
  .join("\n")}

  // 1. Full response with metadata
  // const response = await conductor.run();
  // console.log(response.content);

  // 2. Real-time streaming (supports reasoning deltas)
  for await (const chunk of conductor.stream()) {
    if (chunk.type === "reasoning_delta") {
      process.stdout.write("[Thinking] " + chunk.delta);
    } else if (chunk.type === "text_delta") {
      process.stdout.write(chunk.delta);
    }
  }
}

main().catch(console.error);
`;

  const copyCode = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-surface border border-black/[0.08] dark:border-white/[0.08] rounded-2xl shadow-elevated overflow-hidden text-zinc-900 dark:text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
            <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">TypeScript Conductor Snippet</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Code Content */}
        <div className="p-5 pb-6 text-xs">
          <p className="text-zinc-600 dark:text-zinc-400 mb-3 leading-relaxed">
            Copy and run this code directly in your Node.js or TypeScript backend using <code className="text-zinc-900 dark:text-zinc-200 font-mono">llm-conductor</code>:
          </p>
          <div className="relative border border-black/[0.08] dark:border-white/[0.08] rounded-xl bg-[#f4f4f6] dark:bg-[#09090b] overflow-hidden mb-1">
            <button
              onClick={copyCode}
              className="absolute right-3 top-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-black/[0.06] hover:bg-black/[0.1] text-zinc-800 dark:bg-white/[0.08] dark:hover:bg-white/[0.14] dark:text-zinc-200 text-[11px] font-mono transition-colors shadow-sm"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied" : "Copy Code"}</span>
            </button>
            <pre className="p-4 pt-10 overflow-x-auto font-mono text-zinc-800 dark:text-zinc-300 max-h-96 leading-relaxed selection:bg-black/10 dark:selection:bg-white/15">
              <code>{generatedCode}</code>
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-black/20">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-900 text-white hover:bg-black dark:bg-zinc-100 dark:hover:bg-white dark:text-black font-medium text-xs transition-colors shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
