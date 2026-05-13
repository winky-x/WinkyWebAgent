import React, { useState, useRef, useEffect } from 'react';
import { 
  Files, 
  Orbit, 
  Trash2, 
  RefreshCw, 
  Search, 
  Mic, 
  MicOff, 
  Sparkles, 
  BookOpen, 
  Clock, 
  Coins, 
  Loader, 
  Blocks, 
  Globe, 
  Calculator, 
  CloudSun, 
  Zap, 
  ArrowUp, 
  Square, 
  Wrench,
  Paperclip,
  Activity
} from 'lucide-react';
import { Attachment } from '@/lib/gemini';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';

interface ChatInputProps {
  onSend: (text: string, attachments: Attachment[]) => void;
  disabled?: boolean;
  voiceMode: boolean;
  value: string;
  onChange: (val: string) => void;
  isMuted: boolean;
  onMuteChange: (muted: boolean) => void;
  selectedTool?: string;
  onToolSelect?: (tool: string) => void;
}

export function ChatInput({ onSend, disabled, voiceMode, value, onChange, isMuted, onMuteChange, selectedTool, onToolSelect }: ChatInputProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [showTools, setShowTools] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const availableTools = [
    { id: '', label: 'Autonomous Intelligence', icon: <Sparkles className="w-3.5 h-3.5" />, color: 'text-violet-500' },
    { id: 'detailed_google_search', label: 'Detailed Web Search', icon: <Search className="w-3.5 h-3.5" />, color: 'text-blue-500' },
    { id: 'fast_google_search', label: 'Fast Web Search', icon: <Zap className="w-3.5 h-3.5" />, color: 'text-amber-500' },
    { id: 'get_accurate_weather', label: 'Weather Forecast', icon: <CloudSun className="w-3.5 h-3.5" />, color: 'text-sky-400' },
    { id: 'read_webpage_content', label: 'Read Webpage', icon: <BookOpen className="w-3.5 h-3.5" />, color: 'text-emerald-500' },
    { id: 'evaluate_math_expression', label: 'Math Calculator', icon: <Calculator className="w-3.5 h-3.5" />, color: 'text-rose-500' },
    { id: 'get_current_time_and_date', label: 'Time & Date', icon: <Clock className="w-3.5 h-3.5" />, color: 'text-zinc-500' },
    { id: 'get_crypto_price', label: 'Crypto Price', icon: <Coins className="w-3.5 h-3.5" />, color: 'text-yellow-500' },
  ];

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [value]);

  const startRecording = async () => {
    if (voiceMode) return;
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
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => {
      const newAtt = [...prev];
      URL.revokeObjectURL(newAtt[index].url);
      newAtt.splice(index, 1);
      return newAtt;
    });
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto px-4 pb-4">
      {/* TOOL POPUP OVERLAY */}
      <AnimatePresence>
        {!voiceMode && showTools && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-[calc(100%+16px)] left-4 w-72 bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-zinc-200/80 overflow-hidden z-50 p-2"
          >
            <div className="px-3 py-2 text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100 mb-1 flex items-center gap-2">
              <Activity size={12} className="text-violet-500" /> Cognitive Directives
            </div>
            <div className="space-y-1">
              {availableTools.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => {
                    onToolSelect?.(tool.id);
                    setShowTools(false);
                  }}
                  className={clsx(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[13px] font-bold transition-all duration-300 group/item",
                    selectedTool === tool.id
                      ? "bg-violet-600 text-white shadow-lg shadow-violet-200"
                      : "text-zinc-600 hover:bg-zinc-100/80 hover:text-zinc-900"
                  )}
                >
                  <div className={clsx(
                    "p-1.5 rounded-xl transition-colors",
                    selectedTool === tool.id ? "bg-white/20" : "bg-zinc-100 group-hover/item:bg-white",
                    tool.color && selectedTool !== tool.id ? tool.color : ""
                  )}>
                    {tool.icon}
                  </div>
                  <span className="flex-1 text-left">{tool.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ATTACHMENTS BAR */}
      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex flex-wrap gap-2 mb-3 px-2 overflow-hidden"
          >
            {attachments.map((att, idx) => (
              <motion.div 
                key={idx} 
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="relative group rounded-2xl overflow-hidden border border-zinc-200 bg-white shadow-sm p-1"
              >
                {att.mimeType.startsWith('image/') ? (
                  <img src={att.url} className="h-16 w-16 object-cover rounded-xl" />
                ) : (
                  <div className="h-16 w-16 flex items-center justify-center bg-violet-50 rounded-xl text-violet-500">
                    <Mic className="w-6 h-6" />
                  </div>
                )}
                <button
                  onClick={() => removeAttachment(idx)}
                  className="absolute -top-1 -right-1 bg-zinc-900 text-white rounded-full p-1 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={10} />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAIN INPUT CONTAINER */}
      <div className={clsx(
        "flex flex-col gap-2 p-2 rounded-[2.5rem] transition-all duration-500 relative",
        "bg-white/70 backdrop-blur-3xl shadow-2xl shadow-zinc-200/50",
        "border border-white/20 ring-1 ring-zinc-200/50",
        "before:absolute before:inset-0 before:rounded-[2.5rem] before:p-[1.5px] before:bg-gradient-to-tr before:from-transparent before:via-white/40 before:to-transparent before:-z-10 before:mask-composite",
        disabled ? "opacity-60 grayscale shadow-none" : "hover:border-violet-300/50 focus-within:ring-4 focus-within:ring-violet-500/10 focus-within:border-violet-400/50 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),0_20px_40px_-20px_rgba(0,0,0,0.1)]"
      )}>
        <div className="flex items-end gap-2 pr-2">
          {/* LEFT ACTIONS */}
          <div className="flex items-center gap-1 pl-2 mb-1">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple accept="image/*,video/*,audio/*" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-3 text-zinc-400 hover:text-violet-600 hover:bg-violet-50 rounded-full transition-all active:scale-90"
              disabled={disabled}
            >
              <Paperclip size={20} />
            </button>

            {!voiceMode && (
              <button
                onClick={() => setShowTools(!showTools)}
                className={clsx(
                  "p-3 rounded-full transition-all active:scale-90",
                  selectedTool ? "text-violet-600 bg-violet-100 shadow-inner" : "text-zinc-400 hover:text-violet-600 hover:bg-violet-50"
                )}
                disabled={disabled}
              >
                <Blocks size={20} />
              </button>
            )}
          </div>

          {/* TEXT AREA */}
          <div className="flex-1 min-h-[52px] flex items-center py-1">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={voiceMode ? "Neural transmission active..." : "Ask Winky anything..."}
              className="w-full max-h-40 min-h-[44px] px-2 py-3 bg-transparent resize-none focus:outline-none text-zinc-800 placeholder:text-zinc-400 font-medium leading-relaxed text-[16px] selection:bg-violet-100"
              rows={1}
              disabled={disabled}
            />
          </div>

          {/* RIGHT ACTIONS */}
          <div className="flex items-center gap-2 mb-1">
            {voiceMode ? (
              <button
                onClick={() => onMuteChange(!isMuted)}
                className={clsx(
                  "p-3 rounded-full transition-all duration-500 shadow-md",
                  isMuted ? "bg-rose-100 text-rose-600 hover:bg-rose-200" : "bg-emerald-100 text-emerald-600 hover:bg-emerald-200 ring-4 ring-emerald-50 animate-pulse"
                )}
                disabled={disabled}
              >
                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
            ) : (
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={clsx(
                  "p-3 rounded-full transition-all duration-300",
                  isRecording ? "bg-rose-500 text-white animate-pulse shadow-rose-200 shadow-lg" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"
                )}
                disabled={disabled}
              >
                {isRecording ? <Square size={20} /> : <Mic size={20} />}
              </button>
            )}

            <button
              onClick={handleSend}
              disabled={disabled || (!value.trim() && attachments.length === 0)}
              className={clsx(
                "w-12 h-12 flex items-center justify-center rounded-full transition-all duration-300 shadow-lg disabled:opacity-30 disabled:scale-95 disabled:shadow-none",
                "bg-gradient-to-tr from-violet-600 via-indigo-600 to-purple-600 text-white hover:shadow-violet-200 hover:scale-105 active:scale-95"
              )}
            >
              {disabled ? <Loader className="w-5 h-5 animate-spin" /> : <ArrowUp size={24} className="drop-shadow-md" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
