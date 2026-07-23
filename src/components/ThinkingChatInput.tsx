import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus,
  Paperclip,
  Mic, 
  Globe, 
  Sparkles, 
  Search, 
  Zap, 
  CloudSun, 
  BookOpen, 
  Calculator, 
  Clock, 
  Coins, 
  Check, 
  ChevronDown, 
  ArrowUp, 
  Loader, 
  Activity,
  X
} from 'lucide-react';
import { Attachment } from '@/lib/gemini';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';

export interface ThinkingChatInputProps {
  onSend: (text: string, attachments: Attachment[]) => void;
  disabled?: boolean;
  value: string;
  onChange: (val: string) => void;
  selectedTool?: string;
  onToolSelect?: (tool: string) => void;
  attachments: Attachment[];
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  bgColor?: string;
}

export function ThinkingChatInput({ 
  onSend, 
  disabled, 
  value, 
  onChange, 
  selectedTool = '', 
  onToolSelect,
  attachments,
  setAttachments,
  bgColor
}: ThinkingChatInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);

  const availableTools = [
    { id: '', label: 'Autonomous Intelligence', icon: <Sparkles className="w-3.5 h-3.5" />, color: 'text-violet-400' },
    { id: 'detailed_google_search', label: 'Detailed Web Search', icon: <Search className="w-3.5 h-3.5" />, color: 'text-blue-400' },
    { id: 'fast_google_search', label: 'Fast Web Search', icon: <Zap className="w-3.5 h-3.5" />, color: 'text-amber-400' },
    { id: 'get_accurate_weather', label: 'Weather Forecast', icon: <CloudSun className="w-3.5 h-3.5" />, color: 'text-sky-400' },
    { id: 'read_webpage_content', label: 'Read Webpage', icon: <BookOpen className="w-3.5 h-3.5" />, color: 'text-emerald-400' },
    { id: 'evaluate_math_expression', label: 'Math Calculator', icon: <Calculator className="w-3.5 h-3.5" />, color: 'text-rose-400' },
    { id: 'get_current_time_and_date', label: 'Time & Date', icon: <Clock className="w-3.5 h-3.5" />, color: 'text-zinc-400' },
    { id: 'get_crypto_price', label: 'Crypto Price', icon: <Coins className="w-3.5 h-3.5" />, color: 'text-yellow-400' },
  ];

  const currentToolObj = availableTools.find((t) => t.id === selectedTool) || availableTools[0];
  const isWebSearchActive = selectedTool === 'fast_google_search' || selectedTool === 'detailed_google_search';

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [value]);

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowActionMenu(false);
      }
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setShowTools(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(audioBlob);
        });
        setAttachments((prev) => [...prev, { mimeType: 'audio/webm', data, url: URL.createObjectURL(audioBlob) }]);
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
      };
      mediaRecorder.start();
      setIsRecording(true);
      setShowActionMenu(false);
    } catch (err) {
      toast.error('Microphone access denied.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleSend = () => {
    if (disabled) return;
    if (value.trim() || attachments.length > 0) {
      onSend(value, attachments);
      onChange('');
      setAttachments([]);
      setShowTools(false);
      setShowActionMenu(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAttachments: Attachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });
      newAttachments.push({ mimeType: file.type, data, url: URL.createObjectURL(file) });
    }
    setAttachments((prev) => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowActionMenu(false);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => {
      const newAtt = [...prev];
      URL.revokeObjectURL(newAtt[index].url);
      newAtt.splice(index, 1);
      return newAtt;
    });
  };

  const toggleWebSearch = () => {
    if (isWebSearchActive) {
      onToolSelect?.('');
    } else {
      onToolSelect?.('fast_google_search');
    }
  };

  return (
    <div className="relative w-full max-w-3xl mx-auto px-1 sm:px-4 pb-1 sm:pb-3">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        multiple 
        accept="image/*,video/*,audio/*" 
      />

      {/* DEDICATED THINKING MODE PROMPT INPUT CONTAINER */}
      <div 
        style={bgColor ? { backgroundColor: bgColor } : undefined}
        className={clsx(
          "liquid-glass flex flex-col gap-1.5 p-2.5 sm:p-3.5 rounded-[24px] sm:rounded-[28px] transition-all duration-300 relative",
          !bgColor && "bg-zinc-900/40",
          disabled 
            ? "opacity-60 grayscale shadow-none" 
            : "focus-within:ring-2 focus-within:ring-violet-500/30"
        )}
      >
        
        {/* HEADER: ATTACHMENTS DISPLAY */}
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex flex-wrap gap-2 px-1 pb-1 overflow-hidden"
            >
              {attachments.map((att, idx) => (
                <motion.div 
                  key={idx} 
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.85, opacity: 0 }}
                  className="relative group flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-xl border border-zinc-800 bg-zinc-950/80 text-zinc-200 shadow-xs transition-colors duration-300"
                >
                  {att.mimeType.startsWith('image/') ? (
                    <img src={att.url} className="h-6 w-6 object-cover rounded-lg" />
                  ) : (
                    <div className="h-6 w-6 flex items-center justify-center rounded-lg bg-violet-500/20 text-violet-400">
                      <Mic size={12} />
                    </div>
                  )}
                  <span className="text-xs font-semibold max-w-[110px] truncate">
                    {att.mimeType.startsWith('image/') ? 'Image Attachment' : 'Audio Stream'}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="p-0.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-full transition-colors"
                  >
                    <X size={12} />
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* BODY: AUTO-RESIZING TEXTAREA */}
        <div className="w-full min-h-[36px] px-1.5 flex items-center">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Winky anything... (Thinking Mode)"
            className="w-full max-h-36 min-h-[36px] py-1 bg-transparent resize-none focus:outline-none font-medium leading-relaxed text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 selection:bg-violet-500/30 transition-colors duration-300"
            rows={1}
            disabled={disabled}
          />
        </div>

        {/* FOOTER: TOOLBAR ACTIONS & SUBMIT */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-800/40">
          
          {/* LEFT: PROMPT INPUT TOOLS */}
          <div className="flex items-center gap-1.5 flex-wrap">
            
            {/* 1. ACTION MENU (+) TRIGGER & DROPDOWN */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setShowActionMenu(!showActionMenu)}
                className="p-2 rounded-2xl bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all duration-300 active:scale-95 flex items-center justify-center"
                disabled={disabled}
                title="Add Attachments & Media"
              >
                <Plus size={18} className={clsx("transition-transform duration-300", showActionMenu && "rotate-45")} />
              </button>

              <AnimatePresence>
                {showActionMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute bottom-[calc(100%+12px)] left-0 w-52 p-1.5 rounded-2xl shadow-2xl backdrop-blur-2xl border border-zinc-800 bg-zinc-900/95 text-zinc-100 shadow-[0_20px_50px_rgba(0,0,0,0.6)] z-50 space-y-0.5"
                  >
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors text-left hover:bg-zinc-800 text-zinc-200"
                    >
                      <Paperclip size={15} className="text-violet-400" />
                      <span>Upload Files</span>
                    </button>

                    <button
                      type="button"
                      onClick={isRecording ? stopRecording : startRecording}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors text-left hover:bg-zinc-800 text-zinc-200"
                    >
                      <Mic size={15} className="text-emerald-400" />
                      <span>{isRecording ? 'Stop Recording' : 'Record Audio'}</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 2. FAST WEB SEARCH TOGGLE BUTTON */}
            <button
              type="button"
              onClick={toggleWebSearch}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-bold transition-all duration-300 active:scale-95 border",
                isWebSearchActive
                  ? "bg-violet-600/20 border-violet-500/50 text-violet-300 ring-1 ring-violet-500/30"
                  : "bg-zinc-800/40 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              )}
              disabled={disabled}
            >
              <Globe size={14} className={isWebSearchActive ? "text-violet-400 animate-pulse" : ""} />
              <span>Search</span>
            </button>

            {/* 3. COGNITIVE DIRECTIVES / MODEL SELECTOR DROPDOWN */}
            <div className="relative" ref={toolsRef}>
              <button
                type="button"
                onClick={() => setShowTools(!showTools)}
                className={clsx(
                  "flex items-center gap-2 px-3 py-1.5 rounded-2xl text-xs font-bold transition-all duration-300 active:scale-95 border",
                  selectedTool 
                    ? "bg-violet-600 text-white border-violet-500 shadow-md shadow-violet-500/20" 
                    : "bg-zinc-800/40 border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                )}
                disabled={disabled}
              >
                <div className="flex items-center gap-1.5">
                  {currentToolObj.icon}
                  <span>{currentToolObj.label}</span>
                </div>
                <ChevronDown size={14} className={clsx("transition-transform duration-300", showTools && "rotate-180")} />
              </button>

              <AnimatePresence>
                {showTools && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute bottom-[calc(100%+12px)] left-0 w-72 backdrop-blur-2xl rounded-3xl shadow-2xl overflow-hidden z-50 p-2 border border-zinc-800 bg-zinc-900/95 text-zinc-100 shadow-[0_20px_50px_rgba(0,0,0,0.6)] transition-colors duration-500"
                  >
                    <div className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] border-b border-zinc-800/80 text-zinc-400 mb-1 flex items-center gap-2">
                      <Activity size={12} className="text-violet-400" /> Cognitive Directives
                    </div>
                    <div className="space-y-1">
                      {availableTools.map((tool) => {
                        const isSelected = selectedTool === tool.id;
                        return (
                          <button
                            key={tool.id}
                            type="button"
                            onClick={() => {
                              onToolSelect?.(tool.id);
                              setShowTools(false);
                            }}
                            className={clsx(
                              "w-full flex items-center gap-3 px-3 py-2 rounded-2xl text-[13px] font-bold transition-all duration-300 group/item",
                              isSelected
                                ? "bg-violet-600 text-white shadow-lg shadow-violet-500/30"
                                : "text-zinc-300 hover:bg-zinc-800/80 hover:text-white"
                            )}
                          >
                            <div className={clsx(
                              "p-1.5 rounded-xl transition-colors",
                              isSelected 
                                ? "bg-white/20" 
                                : "bg-zinc-800 group-hover/item:bg-zinc-700 text-zinc-300",
                              tool.color && !isSelected ? tool.color : ""
                            )}>
                              {tool.icon}
                            </div>
                            <span className="flex-1 text-left">{tool.label}</span>
                            {isSelected && <Check size={14} className="text-white" />}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>

          {/* RIGHT: SUBMIT BUTTON */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSend}
              disabled={disabled || (!value.trim() && attachments.length === 0)}
              className="w-10 h-10 flex items-center justify-center rounded-full transition-all duration-300 shadow-lg disabled:opacity-30 disabled:scale-95 bg-gradient-to-tr from-violet-600 via-indigo-600 to-purple-600 text-white hover:shadow-violet-500/30 hover:scale-105 active:scale-95"
            >
              {disabled ? <Loader className="w-5 h-5 animate-spin" /> : <ArrowUp size={22} className="drop-shadow-md" />}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
