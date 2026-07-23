"use client";

import React, { useState, useCallback, useRef, useEffect, memo } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import clsx from "clsx";

export interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

export const CodeBlock = memo(({ code, language = "text", className }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code", err);
    }
  }, [code]);

  return (
    <div className={clsx("my-3 w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-xl", className)}>
      {/* HEADER WITH FIXED LANGUAGE NAME BADGE & COPY BUTTON */}
      <div className="flex items-center justify-between border-b border-zinc-800/90 bg-zinc-900/90 px-3.5 py-1.5 text-xs text-zinc-400">
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-violet-400">
          {language}
        </span>

        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded-md bg-zinc-800/80 px-2 py-1 text-[10px] font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
        >
          {copied ? (
            <>
              <CheckIcon size={12} className="text-emerald-400" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <CopyIcon size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* CODE DISPLAY */}
      <div className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-zinc-200 selection:bg-violet-500/30">
        <pre className="m-0 bg-transparent p-0">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
});

CodeBlock.displayName = "CodeBlock";
