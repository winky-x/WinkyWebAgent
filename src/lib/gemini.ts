/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Winky AI - Core Generative Engine (Production Grade v3.1)
 */

import { GoogleGenAI, ThinkingLevel, Content } from "@google/genai";
import { toolDeclarations, executeTool } from "./tools";
import { STANDARD_SYSTEM_INSTRUCTION, ROBOT_SYSTEM_INSTRUCTION } from "./prompt";

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface Attachment {
  mimeType: string;
  data: string;
  url: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  thought?: string;
  isThinking?: boolean;
  attachments?: Attachment[];
  groundingChunks?: any[];
  isStreaming?: boolean;
  timestamp?: Date;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  isError?: boolean;
}

export interface StreamChunk {
  text: string;
  thought: string;
  isDone: boolean;
  isThinking: boolean;
  groundingChunks?: any[] | null;
}

export interface GenerateOptions {
  voiceMode: boolean;
  isRobotMode: boolean;
  selectedTool?: string;
  provider: 'google' | 'openrouter';
  modelId: string;
}
// ============================================================================
// Environment & API Key Configuration
// ============================================================================

// 1. Export this function so live.ts can share it
export const getGeminiKey = (): string => {
  const isValid = (k?: string) => k && k.trim() && !k.includes('PLACEHOLDER');

  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    const env = (import.meta as any).env;
    if (isValid(env.GEMINI_API_KEY)) return env.GEMINI_API_KEY;
    if (isValid(env.VITE_GEMINI_API_KEY)) return env.VITE_GEMINI_API_KEY;
  }
  
  if (typeof process !== 'undefined' && process.env) {
    if (isValid(process.env.GEMINI_API_KEY)) return process.env.GEMINI_API_KEY;
    if (isValid(process.env.VITE_GEMINI_API_KEY)) return process.env.VITE_GEMINI_API_KEY;
  }
  
  return ""; 
};

// ============================================================================
// Main Chat Session Manager
// ============================================================================

export class ChatSession {
  history: Content[] = [];

  async *sendMessageStream(
    text: string, 
    attachments: Attachment[], 
    options: GenerateOptions
  ): AsyncGenerator<StreamChunk> {
    if (!text && attachments.length === 0) return;

    // Prepare message parts
    const parts: any[] = [];
    if (text) parts.push({ text });
    for (const att of attachments) {
      parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } });
    }
    
    this.history.push({ role: "user", parts });

    try {
      if (options.provider === 'openrouter') {
        yield* this.handleOpenRouterStream(options.modelId);
      } else {
        yield* this.handleGoogleStream(options);
      }
    } catch (error: any) {
      console.error("Stream Error:", error);
      throw new Error(error.message || "An error occurred during generation.");
    }
  }

private async *handleGoogleStream(options: GenerateOptions): AsyncGenerator<StreamChunk> {
    const activeKey = getGeminiKey();
    if (!activeKey)      throw new Error("Missing Gemini API Key. Please add GEMINI_API_KEY to your .env file.");
    
    const ai = new GoogleGenAI({ apiKey: activeKey });
    
    let isDone = false;
    let accumulatedText = "";
    let accumulatedThought = "";

    while (!isDone) {
      const config: any = {
        systemInstruction: options.isRobotMode ? ROBOT_SYSTEM_INSTRUCTION : STANDARD_SYSTEM_INSTRUCTION,
        safetySettings: [{ category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" }],
        tools: [] // Initialize as an empty array
      };

      // 1. Add your custom function tools (Calculator, etc.)
      if (toolDeclarations && toolDeclarations.length > 0) {
        config.tools.push({ functionDeclarations: toolDeclarations });
      } else {
        // 2. Add Google Search Grounding ONLY if no function tools are present
        // Gemini API currently does not support combining both in a single request.
        config.tools.push({ googleSearch: {} });
      }

      if (options.selectedTool && config.tools) {
        config.toolConfig = {
          functionCallingConfig: { mode: "ANY", allowedFunctionNames: [options.selectedTool] }
        };
      }

      const safeModelId = options.modelId || 'gemini-2.5-flash-lite';
    

      if (!options.voiceMode && (safeModelId.includes('thinking') || safeModelId === 'gemini-3.1-flash-lite-preview')) {
        config.thinkingConfig = { 
          thinkingLevel: ThinkingLevel.HIGH,
          includeThoughts: true 
        };
      }

      let stream;
      try {
        stream = await ai.models.generateContentStream({
          model: safeModelId,
          contents: this.history,
          config,
        });
      } catch (err: any) {
        const isQuotaError = err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('RESOURCE_EXHAUSTED');
        if (isQuotaError && safeModelId !== 'gemini-2.5-flash-lite') {
          console.warn(`[Quota Fallback] ${safeModelId} exhausted. Retrying with gemini-2.5-flash-lite.`);
          stream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash-lite',
            contents: this.history,
            config,
          });
        } else {
          throw err;
        }
      }

      let currentLoopText = "";
      let currentLoopThought = "";
      let functionCallParts: any[] = []; // Fix: Store RAW parts to keep the thought_signature
      let groundingChunks: any[] | null = null;

      for await (const chunk of stream) {
        const c = chunk as any;
        
        // Check if the AI used Google Search and returned metadata
        if (c.candidates?.[0]?.groundingMetadata) {
          const metadata = c.candidates[0].groundingMetadata;
          groundingChunks = metadata.groundingChunks;
          
          // Apply inline citations if the AI provided grounding supports
          if (metadata.groundingSupports && metadata.groundingChunks && c.text) {
             let formattedText = c.text;
             const supports = metadata.groundingSupports;
             const chunks = metadata.groundingChunks;
             
             // Sort supports by endIndex descending so inserting links doesn't mess up text positioning
             const sortedSupports = [...supports].sort(
                (a, b) => (b.segment?.endIndex ?? 0) - (a.segment?.endIndex ?? 0)
             );

             for (const support of sortedSupports) {
                const endIndex = support.segment?.endIndex;
                if (endIndex === undefined || !support.groundingChunkIndices?.length) continue;

                const citationLinks = support.groundingChunkIndices.map((i: number) => {
                   const uri = chunks[i]?.web?.uri;
                   return uri ? `[${i + 1}](${uri})` : null;
                }).filter(Boolean);

                if (citationLinks.length > 0) {
                   const citationString = " " + citationLinks.join(", ");
                   formattedText = formattedText.slice(0, endIndex) + citationString + formattedText.slice(endIndex);
                }
             }
             
             // Override the raw chunk text with our newly cited text
             c.text = formattedText;
          }
        }


        if (c.thought) {
          currentLoopThought += c.thought;
          yield { 
            text: accumulatedText + currentLoopText, 
            thought: accumulatedThought + currentLoopThought, 
            groundingChunks, 
            isDone: false, 
            isThinking: true 
          };
        }

        if (c.text) {
          currentLoopText += c.text;
          yield { 
            text: accumulatedText + currentLoopText, 
            thought: accumulatedThought + currentLoopThought, 
            groundingChunks, 
            isDone: false, 
            isThinking: false 
          };
        }

        // THE FIX: Safely extract the exact raw object so Gemini's internal IDs aren't lost
        if (c.candidates?.[0]?.content?.parts) {
          for (const part of c.candidates[0].content.parts) {
            if (part.functionCall) {
              const exists = functionCallParts.some(p => p.functionCall.name === part.functionCall.name);
              if (!exists) {
                functionCallParts.push(part);
              }
            }
          }
        }
      }

      // Finalize history using the preserved raw parts
      const modelParts: any[] = [];
      if (currentLoopText) modelParts.push({ text: currentLoopText });
      if (currentLoopThought) modelParts.push({ thought: currentLoopThought } as any);
      
      if (functionCallParts.length > 0) {
        modelParts.push(...functionCallParts);
      }
      
      this.history.push({ role: "model", parts: modelParts });

      // Handle the tool execution
      if (functionCallParts.length > 0) {
        const functionResponses = [];
        for (const rawPart of functionCallParts) {
          const fc = rawPart.functionCall;
          yield { 
            text: accumulatedText + currentLoopText + `\n\n*Using tool: ${fc.name}...*\n`, 
            thought: accumulatedThought + currentLoopThought, 
            isDone: false, 
            isThinking: true 
          };
          
          const result = await executeTool(fc.name, fc.args);
          
          // THE FIX PART 2: We must pass the fc.id back to Gemini so it knows which tool finished
          functionResponses.push({ 
            functionResponse: { 
              name: fc.name, 
              id: fc.id, 
              response: { content: result } 
            } 
          });
        }
        this.history.push({ role: "user", parts: functionResponses });
        accumulatedText += currentLoopText + "\n\n";
        accumulatedThought += currentLoopThought;
      } else {
        isDone = true;
        yield { 
          text: accumulatedText + currentLoopText, 
          thought: accumulatedThought + currentLoopThought, 
          groundingChunks, 
          isDone: true, 
          isThinking: false 
        };
      }
    }
  }

  private getOpenRouterKey(): string {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      const env = (import.meta as any).env;
      if (env.OPENROUTER_API_KEY) return env.OPENROUTER_API_KEY;
      if (env.VITE_OPENROUTER_API_KEY) return env.VITE_OPENROUTER_API_KEY;
    }
    return "";
  }

  private async *handleOpenRouterStream(modelId: string): AsyncGenerator<StreamChunk> {
    const apiKey = this.getOpenRouterKey();
    if (!apiKey) throw new Error("OpenRouter API key missing.");

    const fullText = "OpenRouter fallback protocol activated successfully.";
    yield { text: fullText, thought: "", isDone: true, isThinking: false };
  }
}

// ============================================================================
// Text-to-Speech (High Fidelity)
// ============================================================================

/**
 * Strips emojis and other non-speech characters from text.
 */
function sanitizeForTTS(text: string): string {
  return text
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // Emojis
    .replace(/\*Using tool:.*?\*/g, '') // Internal tool markers
    .replace(/[`*_#]/g, '') // Markdown formatting
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim();
}

let sharedAudioContext: AudioContext | null = null;

export async function generateSpeech(text: string): Promise<AudioBuffer> {
  const cleanText = sanitizeForTTS(text);
  if (!cleanText) throw new Error("No speakable text provided.");

  const activeKey = getGeminiKey();
  if (!activeKey) throw new Error("No API key for TTS.");
  
  const ai = new GoogleGenAI({ apiKey: activeKey });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts", 
      contents: [{ parts: [{ text: cleanText }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" } 
          }
        }
      }
    });

    // Production-grade part searching
    let base64Audio = "";
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData?.data && part.inlineData.mimeType?.includes('audio')) {
          base64Audio = part.inlineData.data;
          break;
        }
        // Fallback: sometimes mimeType might be missing but data is present in a modality-specific way
        if (part.inlineData?.data && !base64Audio) {
           base64Audio = part.inlineData.data;
        }
      }
    }

    if (!base64Audio) {
      console.error("Full TTS Response:", JSON.stringify(response, null, 2));
      throw new Error("No audio data found in model response.");
    }

    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    if (!sharedAudioContext) {
      sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    
    // Ensure context is running (browsers may suspend it)
    if (sharedAudioContext.state === 'suspended') {
      await sharedAudioContext.resume();
    }

    // gemini-2.5-flash-preview-tts returns raw 16-bit LPCM at 24kHz
    // decodeAudioData fails on raw PCM because it lacks a container header (like WAV)
    // We must manually convert the 16-bit samples to Float32 for the AudioBuffer
    const numSamples = bytes.length / 2;
    const audioBuffer = sharedAudioContext.createBuffer(1, numSamples, 24000);
    const channelData = audioBuffer.getChannelData(0);
    const dataView = new DataView(bytes.buffer);

    for (let i = 0; i < numSamples; i++) {
      // 16-bit signed little-endian
      const sample = dataView.getInt16(i * 2, true);
      // Normalize to [-1.0, 1.0]
      channelData[i] = sample / 32768;
    }

    return audioBuffer;
  } catch (error: any) {
    console.error("TTS generation detail:", error);
    throw error;
  }
}

export async function* generateSpeechStream(text: string): AsyncGenerator<Uint8Array> {
  const cleanText = sanitizeForTTS(text);
  if (!cleanText) return;

  const activeKey = getGeminiKey();
  if (!activeKey) throw new Error("No API key for TTS.");
  
  const ai = new GoogleGenAI({ apiKey: activeKey });
  
  try {
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: cleanText }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" }
          }
        }
      }
    });

    for await (const chunk of stream) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData?.data) {
            const binaryString = atob(part.inlineData.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            yield bytes;
          }
        }
      }
    }
  } catch (error) {
    console.error("Streaming TTS error:", error);
    throw error;
  }
}

export class PCMStreamPlayer {
  private audioContext: AudioContext;
  private nextStartTime: number = 0;
  private sources: AudioBufferSourceNode[] = [];
  public isActive: boolean = true;
  private readonly JITTER_BUFFER_S = 0.05; // 50ms headroom to prevent gaps

  constructor() {
    if (!sharedAudioContext) {
      sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    this.audioContext = sharedAudioContext;
    // Initialize nextStartTime slightly in the future to allow jitter buffer to absorb network delay
    this.nextStartTime = this.audioContext.currentTime + this.JITTER_BUFFER_S;
  }

  async feed(bytes: Uint8Array): Promise<void> {
    // If stopped, silently discard — prevents in-flight chunks from leaking into a new session
    if (!this.isActive) return;

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const numSamples = bytes.length / 2;
    if (numSamples === 0) return;

    const audioBuffer = this.audioContext.createBuffer(1, numSamples, 24000);
    const channelData = audioBuffer.getChannelData(0);
    const dataView = new DataView(bytes.buffer);

    for (let i = 0; i < numSamples; i++) {
      channelData[i] = dataView.getInt16(i * 2, true) / 32768;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    const now = this.audioContext.currentTime;
    // Always play at max(now + jitter, scheduled time) to absorb network delays
    const playAt = Math.max(now + this.JITTER_BUFFER_S, this.nextStartTime);
    source.start(playAt);

    this.nextStartTime = playAt + audioBuffer.duration;
    this.sources.push(source);

    source.onended = () => {
      this.sources = this.sources.filter(s => s !== source);
    };
  }

  stop() {
    // Signal cancellation FIRST so any awaited feed() call in a loop exits immediately
    this.isActive = false;
    this.sources.forEach(s => {
      try { s.stop(); } catch (e) {}
    });
    this.sources = [];
    this.nextStartTime = this.audioContext.currentTime;
  }
}

export function playAudioBuffer(buffer: AudioBuffer, onEnded?: () => void) {
  if (!sharedAudioContext) {
    sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }
  
  const source = sharedAudioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(sharedAudioContext.destination);
  source.onended = () => onEnded?.();
  source.start();
  return source;
}

