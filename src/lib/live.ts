import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { toolDeclarations, executeTool } from "./tools";
import { STANDARD_SYSTEM_INSTRUCTION } from "./prompt";
// 1. Import the shared key logic
import { getGeminiKey, Attachment } from "./gemini";

export class LiveSession {
  private sessionPromise: Promise<any> | null = null;
  private audioContext: AudioContext | null = null;
  private micContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private nextStartTime: number = 0;
  public isConnected: boolean = false;
  private isMuted: boolean = false;
  private activeSources: AudioBufferSourceNode[] = [];
  private textResponseActive: boolean = false;
  private textResponseTimeout: any = null;
  private ignoreAckUntil: number = 0;
  private isSetupComplete: boolean = false;
  private activeConnectionId: number = 0;

  public onMessage: (msg: { role: string, text: string, isFinal?: boolean, isTranscription?: boolean }) => void = () => { };
  public onInterrupted: () => void = () => { };
  public onError: (error: any) => void = () => { };
  public onRawMessage?: (msg: any) => void;

  setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  async connect() {
    if (this.isConnected) return;
    this.isSetupComplete = false;
    const connectionId = ++this.activeConnectionId;
    console.log(`[LiveSession] Starting connection #${connectionId}`);

    // 2. Fetch the key dynamically when connecting
    const key = getGeminiKey();
    if (!key) {
      this.onError(new Error("Missing API Key. Please add it to your .env file."));
      return;
    }

    const ai = new GoogleGenAI({ apiKey: key });

    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    console.log("[LiveSession] Created audioContext. Initial state:", this.audioContext.state);
    if (this.audioContext.state === 'suspended') {
      console.log("[LiveSession] audioContext is suspended, attempting to resume...");
      this.audioContext.resume().then(() => {
        if (connectionId === this.activeConnectionId) {
          console.log("[LiveSession] audioContext resumed successfully. State:", this.audioContext?.state);
        }
      }).catch(err => {
        if (connectionId === this.activeConnectionId) {
          console.error("[LiveSession] Failed to resume audioContext:", err);
        }
      });
    }
    this.nextStartTime = this.audioContext.currentTime;

    console.log("[LiveSession] Connecting to live API model gemini-3.1-flash-live-preview...");
    this.sessionPromise = ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      callbacks: {
        onopen: async () => {
          if (connectionId !== this.activeConnectionId) {
            console.log(`[LiveSession] Ignoring onopen for stale connection #${connectionId}`);
            return;
          }
          console.log(`[LiveSession] WebSocket connection #${connectionId} opened successfully.`);
          this.isConnected = true;
          await this.startMicrophone();
        },
        onmessage: async (message: LiveServerMessage) => {
          if (connectionId !== this.activeConnectionId) {
            return;
          }
          this.handleMessage(message);
        },
        onclose: () => {
          if (connectionId !== this.activeConnectionId) {
            console.log(`[LiveSession] Ignoring onclose for stale connection #${connectionId}`);
            return;
          }
          console.log(`[LiveSession] WebSocket connection #${connectionId} closed.`);
          this.disconnect();
        },
        onerror: (error) => {
          if (connectionId !== this.activeConnectionId) {
            console.log(`[LiveSession] Ignoring onerror for stale connection #${connectionId}`);
            return;
          }
          console.error(`Live API Error on connection #${connectionId}:`, error);
          this.onError(error);
          this.disconnect();
        }
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
        },
        systemInstruction: STANDARD_SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: toolDeclarations }],
        outputAudioTranscription: {},
        inputAudioTranscription: {}
      } as any,
    });
  }

  private async startMicrophone() {
    try {
      console.log("[LiveSession] Requesting microphone access...");
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("[LiveSession] Microphone access granted.");

      this.micContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      console.log("[LiveSession] Created micContext. Initial state:", this.micContext.state);

      if (this.micContext.state === 'suspended') {
        console.log("[LiveSession] micContext is suspended, attempting to resume...");
        await this.micContext.resume();
        console.log("[LiveSession] micContext resumed. State:", this.micContext.state);
      }

      const source = this.micContext.createMediaStreamSource(this.mediaStream);
      this.scriptProcessor = this.micContext.createScriptProcessor(4096, 1, 1);
      source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.micContext.destination);

      let pcmChunkCount = 0;
      this.scriptProcessor.onaudioprocess = (e) => {
        pcmChunkCount++;

        if (!this.isConnected || !this.sessionPromise || this.isMuted) return;
        if (!this.isSetupComplete) return;
        if (this.textResponseActive) return;

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
          // FIX: Use 'audio' property (maps to audio field) instead of 'media' (maps to mediaChunks/images)
          session.sendRealtimeInput({
            audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        });
      };
    } catch (err) {
      console.error("Microphone error:", err);
      this.onError(new Error("Microphone access denied or unavailable."));
    }
  }

  private async handleMessage(message: LiveServerMessage) {
    console.log("[LiveSession] handleMessage received:", JSON.stringify(message));
    if (message.setupComplete) {
      console.log("[LiveSession] Received setupComplete from server. Enabling audio stream.");
      this.isSetupComplete = true;
    }
    if (this.onRawMessage) {
      this.onRawMessage(message);
    }

    const isAckWindow = Date.now() < this.ignoreAckUntil;

    if (message.serverContent?.interrupted) {
      if (isAckWindow) return; // Ignore abort ack
      
      this.onInterrupted();
      this.stopAudio();
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
      // Always reset textResponseActive on turnComplete — prevents mic from being blocked for 15s
      this.textResponseActive = false;
      if (this.textResponseTimeout) { clearTimeout(this.textResponseTimeout); this.textResponseTimeout = null; }
      if (isAckWindow) return; // Ignore abort ack for UI purposes only
      this.onMessage({ role: 'assistant', text: '', isFinal: true });
    }

    if (message.serverContent?.outputTranscription) {
      const text = message.serverContent.outputTranscription.text;
      const isFinal = message.serverContent.outputTranscription.finished || false;
      if (text) {
        this.onMessage({ role: 'assistant', text, isFinal, isTranscription: true });
      } else if (isFinal) {
        if (isAckWindow) return; // Ignore abort ack
        
        this.textResponseActive = false;
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

    this.activeSources.push(source);
    source.onended = () => {
      this.activeSources = this.activeSources.filter(s => s !== source);
    };
  }

  public stopAudio() {
    this.activeSources.forEach(source => {
      try {
        source.stop();
      } catch (err) {
        // Ignore errors from stopping a source that hasn't started or already stopped
      }
    });
    this.activeSources = [];
    this.nextStartTime = this.audioContext?.currentTime || 0;
  }

  async sendText(text: string, attachments: Attachment[] = []) {
    console.log(`[LiveSession] sendText called with text="${text}", attachments=${attachments.length}`);
    if (!this.sessionPromise || !this.isConnected) {
      console.warn(`[LiveSession] Cannot sendText. isConnected=${this.isConnected}, sessionPromiseExists=${!!this.sessionPromise}`);
      return;
    }
    
    this.stopAudio();
    // Completely pause mic during text response generation and ignore incoming abort acks for 1.2s
    this.textResponseActive = true;
    this.ignoreAckUntil = Date.now() + 1200;
    
    if (this.textResponseTimeout) clearTimeout(this.textResponseTimeout);
    this.textResponseTimeout = setTimeout(() => { 
      console.log("[LiveSession] textResponseTimeout fired. Resetting textResponseActive to false.");
      this.textResponseActive = false; 
    }, 15000);
    
    try {
      const session = await this.sessionPromise;

      const parts: any[] = [];
      if (text) {
        parts.push({ text });
      }

      for (const att of attachments) {
        parts.push({
          inlineData: {
            mimeType: att.mimeType,
            data: att.data
          }
        });
      }

      // FIX: Use sendClientContent directly — the correct SDK method for text/structured content
      session.sendClientContent({
        turns: [{ role: 'user', parts }],
        turnComplete: true
      });
      console.log("[LiveSession] sendText completed via sendClientContent.");
    } catch (error) {
      console.error("Failed to send text to Live API:", error);
      this.onError(new Error("Failed to send text in Voice Mode."));
    }
  }

  disconnect() {
    this.isConnected = false;
    this.isSetupComplete = false;
    this.activeConnectionId++;
    this.stopAudio();
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
