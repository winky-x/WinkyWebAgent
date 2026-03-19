import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { toolDeclarations, executeTool } from "./tools";
import { SYSTEM_INSTRUCTION } from "./prompt";

const ai = new GoogleGenAI({ apiKey: (import.meta as any).env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY });

export class LiveSession {
  private sessionPromise: Promise<any> | null = null;
  private audioContext: AudioContext | null = null;
  private micContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private nextStartTime: number = 0;
  private isConnected: boolean = false;
  private isMuted: boolean = false;

  public onMessage: (msg: { role: string, text: string, isFinal?: boolean, isTranscription?: boolean }) => void = () => {};
  public onInterrupted: () => void = () => {};
  public onError: (error: any) => void = () => {};
  public onRawMessage?: (msg: any) => void;

  setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  async connect() {
    if (this.isConnected) return;
    
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    this.nextStartTime = this.audioContext.currentTime;

    this.sessionPromise = ai.live.connect({
      model: "gemini-2.5-flash-native-audio-preview-09-2025",
      callbacks: {
        onopen: async () => {
          this.isConnected = true;
          await this.startMicrophone();
        },
        onmessage: async (message: LiveServerMessage) => {
          this.handleMessage(message);
        },
        onclose: () => {
          this.disconnect();
        },
        onerror: (error) => {
          console.error("Live API Error:", error);
          this.onError(error);
          this.disconnect();
        }
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
        },
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: toolDeclarations }],
        outputAudioTranscription: {},
        inputAudioTranscription: {}
      } as any,
    });
  }

  private async startMicrophone() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.micContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const source = this.micContext.createMediaStreamSource(this.mediaStream);
      this.scriptProcessor = this.micContext.createScriptProcessor(4096, 1, 1);
      source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.micContext.destination);

      this.scriptProcessor.onaudioprocess = (e) => {
        if (!this.isConnected || !this.sessionPromise || this.isMuted) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        const buffer = new Uint8Array(pcmData.buffer);
        let binary = '';
        for (let i = 0; i < buffer.byteLength; i++) {
          binary += String.fromCharCode(buffer[i]);
        }
        const base64Data = btoa(binary);
        this.sessionPromise.then((session) => {
          session.sendRealtimeInput({
            media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        });
      };
    } catch (err) {
      console.error("Microphone error:", err);
      this.onError(new Error("Microphone access denied or unavailable."));
    }
  }

  private async handleMessage(message: LiveServerMessage) {
    if (this.onRawMessage) {
      this.onRawMessage(message);
    }

    if (message.serverContent?.interrupted) {
      this.onInterrupted();
      this.nextStartTime = this.audioContext?.currentTime || 0;
    }

    const parts = message.serverContent?.modelTurn?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          this.playAudioChunk(part.inlineData.data);
        }
        if (part.text) {
          // FIX: Filter out internal monologue and default greeting headers
          const isInternalThought = 
            part.text.includes("Addressing the") || 
            part.text.includes("Initiating a Dialogue") ||
            part.text.includes("Okay, so the user") ||
            part.text.includes("I'll correct them with Hinglish");

          if (!isInternalThought) {
            this.onMessage({ role: 'assistant', text: part.text, isFinal: false });
          }
        }
      }
    }

    if (message.serverContent?.turnComplete) {
      this.onMessage({ role: 'assistant', text: '', isFinal: true });
    }

    if (message.serverContent?.outputTranscription) {
      const text = message.serverContent.outputTranscription.text;
      const isFinal = message.serverContent.outputTranscription.finished || false;
      if (text) {
        this.onMessage({ role: 'assistant', text, isFinal, isTranscription: true });
      } else if (isFinal) {
        this.onMessage({ role: 'assistant', text: '', isFinal: true, isTranscription: true });
      }
    }

    if (message.serverContent?.inputTranscription) {
      const text = message.serverContent.inputTranscription.text;
      const isFinal = message.serverContent.inputTranscription.finished || false;
      if (text) {
        this.onMessage({ role: 'user', text, isFinal, isTranscription: true });
      } else if (isFinal) {
        this.onMessage({ role: 'user', text: '', isFinal: true, isTranscription: true });
      }
    }

    if (message.toolCall) {
      const functionResponses: any[] = [];
      for (const fc of message.toolCall.functionCalls) {
        this.onMessage({ role: 'assistant', text: `\n\n*Using tool: ${fc.name}...*\n`, isFinal: false });
        const result = await executeTool(fc.name, fc.args);
        functionResponses.push({
          name: fc.name,
          id: fc.id,
          response: result
        });
      }
      
      if (this.sessionPromise && functionResponses.length > 0) {
        this.sessionPromise.then(session => {
          session.sendToolResponse({ functionResponses });
        });
      }
    }
  }

  private playAudioChunk(base64Data: string) {
    if (!this.audioContext) return;
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const pcmData = new Int16Array(bytes.buffer);
    
    const buffer = this.audioContext.createBuffer(1, pcmData.length, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < pcmData.length; i++) {
      channelData[i] = pcmData[i] / 32768.0;
    }
    
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    const startTime = Math.max(this.nextStartTime, this.audioContext.currentTime);
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;
  }

  sendText(text: string) {
    if (this.sessionPromise && this.isConnected) {
      this.sessionPromise.then(session => {
        session.sendRealtimeInput({
          clientContent: {
            turns: [{ role: 'user', parts: [{ text }] }],
            turnComplete: true
          }
        });
      });
    }
  }

  disconnect() {
    this.isConnected = false;
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.micContext) {
      this.micContext.close();
      this.micContext = null;
    }
    if (this.sessionPromise) {
      this.sessionPromise.then(session => session.close());
      this.sessionPromise = null;
    }
  }
}
