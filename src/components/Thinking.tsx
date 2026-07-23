import React, { createContext, useContext, useState, useEffect, useRef, useMemo, memo } from 'react';
import { Atom, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';
import { BlurText } from './BlurText';
import { CodeBlock } from './ai-elements/code-block';

const reasoningMarkdownComponents = {
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    const codeString = String(children).replace(/\n$/, '');
    if (!inline && (match || codeString.includes('\n'))) {
      return (
        <CodeBlock 
          code={codeString} 
          language={match ? match[1] : "text"} 
          className="my-2"
        />
      );
    }
    return (
      <code className="px-1 py-0.5 rounded bg-zinc-800/80 font-mono text-xs text-violet-300 border border-zinc-700/40" {...props}>
        {children}
      </code>
    );
  },
  h1: ({ children }: any) => <h1 className="text-sm font-bold text-zinc-300 mt-2 mb-1">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-xs font-bold text-zinc-300 mt-2 mb-1">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-xs font-semibold text-zinc-300 mt-1.5 mb-1">{children}</h3>,
  p: ({ children }: any) => <p className="leading-relaxed mb-1.5 text-zinc-400 text-xs">{children}</p>,
};

interface ReasoningContextValue {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration: number | undefined;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export const useReasoning = () => {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error("Reasoning components must be used within Reasoning");
  }
  return context;
};

export interface ReasoningProps {
  children?: React.ReactNode;
  isStreaming?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
  className?: string;
  thoughtText?: string;
  isDarkMode?: boolean;
}

const AUTO_CLOSE_DELAY = 1000;
const MS_IN_S = 1000;

// Shimmer Effect Component while streaming/thinking
export const Shimmer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center gap-1 font-normal text-zinc-400 animate-pulse">
    {children}
  </span>
);

export const Reasoning = memo(({
  className,
  isStreaming = false,
  open: openProp,
  defaultOpen,
  onOpenChange,
  duration: durationProp,
  children,
  thoughtText,
  isDarkMode = true
}: ReasoningProps) => {
  const resolvedDefaultOpen = defaultOpen ?? isStreaming;
  const isExplicitlyClosed = defaultOpen === false;

  const [isOpen, setIsOpen] = useState<boolean>(resolvedDefaultOpen);
  const [duration, setDuration] = useState<number | undefined>(durationProp);

  const hasEverStreamedRef = useRef(isStreaming);
  const [hasAutoClosed, setHasAutoClosed] = useState(false);
  const startTimeRef = useRef<number | null>(null);

  // Track when streaming starts and compute duration in seconds
  useEffect(() => {
    if (isStreaming) {
      hasEverStreamedRef.current = true;
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }
    } else if (startTimeRef.current !== null) {
      const elapsed = Math.ceil((Date.now() - startTimeRef.current) / MS_IN_S);
      setDuration(elapsed > 0 ? elapsed : 1);
      startTimeRef.current = null;
    }
  }, [isStreaming]);

  // Auto-open when streaming starts (unless explicitly closed)
  useEffect(() => {
    if (isStreaming && !isOpen && !isExplicitlyClosed) {
      setIsOpen(true);
    }
  }, [isStreaming, isOpen, isExplicitlyClosed]);

  // Auto-close 1 sec after streaming ends (once only)
  useEffect(() => {
    if (hasEverStreamedRef.current && !isStreaming && isOpen && !hasAutoClosed) {
      const timer = setTimeout(() => {
        setIsOpen(false);
        setHasAutoClosed(true);
      }, AUTO_CLOSE_DELAY);

      return () => clearTimeout(timer);
    }
  }, [isStreaming, isOpen, hasAutoClosed]);

  const handleOpenChange = (newOpen: boolean) => {
    setIsOpen(newOpen);
    if (onOpenChange) onOpenChange(newOpen);
  };

  const contextValue = useMemo(
    () => ({ duration, isOpen, isStreaming, setIsOpen: handleOpenChange }),
    [duration, isOpen, isStreaming]
  );

  return (
    <ReasoningContext.Provider value={contextValue}>
      <div className={clsx("not-prose mb-3 w-full", className)}>
        {/* MINIMALIST REASONING TRIGGER / HEADER */}
        <button
          type="button"
          onClick={() => handleOpenChange(!isOpen)}
          className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors duration-200 cursor-pointer select-none py-1 group bg-transparent border-0 outline-none"
        >
          <Atom className="w-4 h-4 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
          
          <div className="flex-1 text-left font-sans text-xs text-zinc-400">
            {isStreaming ? (
              <Shimmer>Thinking...</Shimmer>
            ) : duration !== undefined ? (
              <span>Thought for {duration} seconds</span>
            ) : (
              <span>Thought for a few seconds</span>
            )}
          </div>

          <ChevronDown
            className={clsx(
              "w-4 h-4 transition-transform duration-200 text-zinc-400 group-hover:text-zinc-200",
              isOpen ? "rotate-180" : "rotate-0"
            )}
          />
        </button>

        {/* MINIMALIST REASONING STREAM CONTENT */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden w-full mt-2 origin-top"
            >
              <div className="text-xs leading-relaxed font-sans text-zinc-400 selection:bg-zinc-800 selection:text-zinc-200 py-1">
                {thoughtText ? (
                  <div className="prose prose-invert prose-xs max-w-none break-words text-zinc-400 font-sans leading-relaxed space-y-2">
                    {isStreaming ? (
                      <BlurText 
                        text={thoughtText} 
                        delay={10} 
                        animateBy="words" 
                        direction="top" 
                        stepDuration={0.1} 
                      />
                    ) : (
                      <Markdown remarkPlugins={[remarkGfm]} components={reasoningMarkdownComponents}>
                        {thoughtText}
                      </Markdown>
                    )}
                  </div>
                ) : (
                  children
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ReasoningContext.Provider>
  );
});

// Backward-compatible exports matching standard Chain of Thought APIs
export const Thinking = Reasoning;
export const ThinkingHeader = memo(({ children }: { children?: React.ReactNode }) => null);
export const ThinkingContent = memo(({ thoughtText }: { thoughtText?: string }) => null);

Reasoning.displayName = "Reasoning";
