import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Paperclip, Send, Square, Image as ImageIcon, Video, Wrench, Loader2 } from 'lucide-react';
import { Attachment } from '@/lib/gemini';
import { toast } from 'sonner';

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
    { id: '', label: 'Auto (Let AI decide)' },
    { id: 'detailed_google_search', label: 'Detailed Web Search' },
    { id: 'fast_google_search', label: 'Fast Web Search' },
    { id: 'get_accurate_weather', label: 'Weather Forecast' },
    { id: 'read_webpage_content', label: 'Read Webpage' },
    { id: 'evaluate_math_expression', label: 'Math Calculator' },
    { id: 'get_current_time_and_date', label: 'Time & Date' },
    { id: 'get_crypto_price', label: 'Crypto Price' },
  ];

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 128)}px`;
    }
  }, [value]);

  const startRecording = async () => {
    if (voiceMode) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          reader.readAsDataURL(audioBlob);
        });

        setAttachments((prev) => [
          ...prev,
          {
            mimeType: 'audio/webm',
            data,
            url: URL.createObjectURL(audioBlob),
          },
        ]);
        
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      toast.error('Microphone access denied or unavailable.');
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
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(file);
      });

      newAttachments.push({
        mimeType: file.type,
        data,
        url: URL.createObjectURL(file),
      });
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
    <div className="flex flex-col gap-3 bg-white/90 backdrop-blur-xl p-3 rounded-[2rem] shadow-xl shadow-zinc-200/50 border border-zinc-200/60 relative">
      {!voiceMode && showTools && (
        <div className="absolute bottom-[calc(100%+12px)] left-4 w-64 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-zinc-200/60 overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2">
          <div className="p-3 bg-zinc-50/80 border-b border-zinc-100 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
            Force Tool Usage
          </div>
          <div className="p-1.5 max-h-60 overflow-y-auto">
            {availableTools.map((tool) => (
              <button
                key={tool.id}
                onClick={() => {
                  onToolSelect?.(tool.id);
                  setShowTools(false);
                }}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                  selectedTool === tool.id 
                    ? 'bg-violet-100 text-violet-700 font-semibold' 
                    : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 font-medium'
                }`}
              >
                {tool.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-2">
          {attachments.map((att, idx) => (
            <div key={idx} className="relative group rounded-xl overflow-hidden border border-zinc-200 bg-zinc-50 flex items-center justify-center p-1 shadow-sm">
              {att.mimeType.startsWith('image/') ? (
                <img src={att.url} alt="attachment" className="h-14 w-14 object-cover rounded-lg" />
              ) : att.mimeType.startsWith('video/') ? (
                <video src={att.url} className="h-14 w-14 object-cover rounded-lg" />
              ) : (
                <div className="h-14 w-14 flex items-center justify-center bg-violet-50 rounded-lg text-violet-500">
                  <Mic className="w-6 h-6" />
                </div>
              )}
              <button
                onClick={() => removeAttachment(idx)}
                className="absolute -top-1 -right-1 bg-zinc-900 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-md scale-75 hover:scale-90"
              >
                <Square className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 px-1">
        <div className="flex items-center gap-1 pb-1">
          <input
            id="media-upload-input"
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            multiple
            accept="image/*,video/*"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-full transition-all duration-200"
            disabled={disabled}
            title="Attach Media"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          
          {!voiceMode && (
            <button
              onClick={() => setShowTools(!showTools)}
              className={`p-2.5 rounded-full transition-all duration-200 ${
                selectedTool 
                  ? 'text-violet-600 bg-violet-100 hover:bg-violet-200' 
                  : 'text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100'
              }`}
              disabled={disabled}
              title="Select Tool"
            >
              <Wrench className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex-1 bg-zinc-100/50 rounded-2xl border border-transparent focus-within:border-zinc-300 focus-within:bg-white transition-all duration-200 overflow-hidden mb-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={voiceMode ? "Type or speak your message..." : "Ask a complex question..."}
            className="w-full max-h-32 min-h-[44px] px-4 py-3 bg-transparent resize-none focus:outline-none text-zinc-800 placeholder:text-zinc-400 leading-relaxed text-[15px]"
            rows={1}
            disabled={disabled}
          />
        </div>

        <div className="flex items-center gap-2 pb-1">
          {voiceMode ? (
            <button
              onClick={() => onMuteChange(!isMuted)}
              className={`p-3 rounded-full transition-all duration-300 shadow-sm ${
                isMuted 
                  ? 'bg-rose-100 text-rose-600 hover:bg-rose-200' 
                  : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200 animate-pulse'
              }`}
              disabled={disabled}
              title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          ) : (
            isRecording ? (
              <button
                onClick={stopRecording}
                className="p-3 bg-rose-500 text-white rounded-full hover:bg-rose-600 transition-all animate-pulse shadow-md"
                title="Stop Recording"
              >
                <Square className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={startRecording}
                className="p-3 bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 rounded-full transition-all"
                disabled={disabled}
                title="Record Audio"
              >
                <Mic className="w-5 h-5" />
              </button>
            )
          )}
          
          <button
            onClick={handleSend}
            disabled={disabled || (!value.trim() && attachments.length === 0)}
            className={`p-3 text-white rounded-full transition-all duration-300 shadow-md disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none ${
              voiceMode 
                ? 'bg-zinc-900 hover:bg-zinc-800' 
                : 'bg-violet-600 hover:bg-violet-700'
            }`}
          >
            {disabled ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5 ml-0.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
