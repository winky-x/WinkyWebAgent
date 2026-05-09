# Winky AI - Wireless IoT Robotics Platform Upgrade

## 🚀 Major Changes: Wired Serial → Wireless ESP32-CAM

This upgrade transforms WinkyWebAgent from a wired, Serial-based remote control system into a fully autonomous, wireless IoT robotics platform powered by an **ESP32-CAM** and **Google Gemini AI**.

---

## 📋 What Changed

### **Task 1: UI & Routing ✅**

#### New Router Structure
- **Main App** (`src/App.tsx`): React Router with two routes
  - `/` → Chat interface (original + enhancements)
  - `/robot` → New Robot Dashboard

#### New Robot Dashboard (`src/pages/RobotDashboard.tsx`)
- **Split-screen layout**:
  - **Left Pane (Vision)**: Live MJPEG stream from `http://${VITE_WINKY_IP}/stream`
    - Fallback UI when stream unavailable
    - Live indicator badge
  - **Right Pane (Cognition)**: Active chat + emotion UI
- **Dynamic Emotion Indicator**:
  - Real-time visual feedback with emojis
  - Animated scale when robot speaks
  - Maps 7 emotions: happy, sad, curious, thinking, confused, excited, neutral

#### Chat Page (`src/pages/Chat.tsx`)
- Moved from `App.tsx` for cleaner organization
- New header button: **"Initialize Winky Physical Agent"** (cyan)
  - Navigates to `/robot` dashboard
- All existing functionality preserved

---

### **Task 2: The JSON Brain ✅**

#### Updated System Prompt (`src/lib/prompt.ts`)

**Critical Change**: AI now responds ONLY in JSON format.

```json
{
  "thought": "Internal reasoning (hidden from user)",
  "spoken_reply": "User-facing conversational text",
  "emotion": "happy | sad | curious | thinking | confused | excited | neutral",
  "physical_action": ["wiggle_left", "turn_360", "forward", "stop", "none"]
}
```

**Key Rules Enforced**:
1. **NO markdown or plain text** — Every response is valid JSON
2. **spoken_reply** is conversational, sassy, and markdown-free
3. **emotion** reflects AI's tone based on context
4. **physical_action** array contains robot commands

**Valid Robot Actions**:
```
"wiggle_left", "wiggle_right", "turn_left", "turn_right", "turn_360",
"forward", "backward", "stop", "led_on", "led_off", "spin", "dance", "none"
```

---

### **Task 3: The Data Splitter ✅**

#### JSON Response Parsing (`src/pages/Chat.tsx` & `src/pages/RobotDashboard.tsx`)

New function: `parseGeminiResponse()`
```typescript
const parseGeminiResponse = (responseText: string): GeminiResponse => {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as GeminiResponse;
    }
  } catch (err) {
    console.error("Failed to parse JSON:", err);
  }
  
  // Fallback to plain text if JSON parsing fails
  return {
    thought: "",
    spoken_reply: responseText,
    emotion: "neutral",
    physical_action: ["none"]
  };
};
```

**Response Routing**:
1. **spoken_reply** → Chat UI + Text-to-Speech
2. **emotion** → React state `setCurrentEmotion()` → UI updates in real-time
3. **physical_action** → `executeKinematics()` function
4. **thought** → Optionally shown in "Thinking Mode" (advanced)

---

### **Task 4: Wireless Kinematics ✅**

#### New Robot Manager (`src/lib/robotManager.ts`)

**Deprecation**: Old Web Serial API removed. New wireless functions:

```typescript
export const executeKinematics = async (actions: string[]): Promise<void>
```
- Fires fire-and-forget `fetch()` GET requests to ESP32
- **Non-blocking**: Uses `Promise.allSettled()` to avoid blocking React
- Graceful error handling with console logging
- Timeout protection (3 seconds per request)

**Helper Functions**:
```typescript
export const wakeUpRobot = async (): Promise<boolean>
// Call `http://${VITE_WINKY_IP}/api/wakeup` on startup

export const checkRobotStatus = async (): Promise<boolean>
// Verify ESP32 connectivity before operations
```

**Example Fetch Call**:
```typescript
fetch(`http://192.168.1.100/api/turn_360`)
  .then(res => res.json())
  .catch(err => console.error("Robot unreachable:", err));
```

---

### **Task 5: Autonomous Startup Sequence ✅**

#### Auto-Initialization (`src/pages/RobotDashboard.tsx`)

**On `/robot` mount**:
```typescript
useEffect(() => {
  const initRobot = async () => {
    const robotIp = import.meta.env.VITE_WINKY_IP;
    
    // 1. Check connectivity
    const isConnected = await checkRobotStatus();
    
    if (isConnected) {
      setRobotStatus('connected');
      
      // 2. Wake up robot
      await wakeUpRobot();
      
      // 3. Inject autonomous greeting
      injectAutonomousGreeting();
    } else {
      setRobotStatus('disconnected');
      toast.error("Cannot reach robot...");
    }
  };
  
  initRobot();
}, []);
```

**Autonomous Greeting**:
```typescript
const injectAutonomousGreeting = async () => {
  const systemPrompt = 
    "System: You have just booted up. Look at your surroundings and greet the user autonomously. Respond with pure JSON.";
  
  // Fire message through Gemini
  const stream = chatSessionRef.current!.sendMessageStream(
    systemPrompt,
    [],
    { voiceMode: false, provider: 'google', modelId: '...' }
  );
  
  // Parse response, update emotion, execute actions
  // Generate speech automatically
};
```

---

## 🛠️ Installation & Setup

### 1. **Install Dependencies**
```bash
npm install react-router-dom
# Already installed: sonner, motion/react, lucide-react
```

### 2. **Environment Variables** (`.env.local`)
```env
VITE_GEMINI_API_KEY=your_gemini_key
VITE_WINKY_IP=192.168.1.100
VITE_OPENROUTER_API_KEY=optional
```

### 3. **Update `main.tsx` (if needed)**
If using React Router, ensure your root renders the App component:
```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

### 4. **Run Dev Server**
```bash
npm run dev
```

---

## 📁 File Structure

```
src/
├── App.tsx                          # React Router wrapper
├── pages/
│   ├── Chat.tsx                    # Main chat interface
│   └── RobotDashboard.tsx          # Split-screen robot control
├── lib/
│   ├── gemini.ts                   # Gemini API client
│   ├── live.ts                     # Live voice session
│   ├── prompt.ts                   # JSON schema prompt ✨ UPDATED
│   ├── robotManager.ts             # Wireless kinematics ✨ NEW
│   ├── tools.ts                    # Tool declarations
│   └── ...
├── components/
│   ├── ChatMessage.tsx
│   ├── ChatInput.tsx
│   └── ...
└── index.css                        # Tailwind + animations
```

---

## 🎮 How It Works (End-to-End)

### Flow Diagram

```
User Input → Gemini API → JSON Response
                ↓
        ┌───────┴───────┐
        ↓               ↓
   Chat UI + TTS    Parse JSON
        ↓               ↓
   Display        Extract Actions
   (spoken_reply) ↓
   + Emotion     executeKinematics()
                 ↓
              ESP32-CAM API
              (Wi-Fi Request)
              ↓
           Robot Moves
```

### Example Conversation

**User**: "Dance for me!"

**Gemini Response** (JSON):
```json
{
  "thought": "User wants entertainment. I'll make the robot dance.",
  "spoken_reply": "Hold my beer, mortal! Time for some moves! 💃",
  "emotion": "excited",
  "physical_action": ["dance", "spin", "wiggle_left"]
}
```

**Frontend**:
1. Parses JSON
2. Displays: "Hold my beer, mortal! Time for some moves! 💃"
3. Updates emotion indicator to 🤩 Excited
4. Calls: `fetch('http://192.168.1.100/api/dance')`
5. Calls: `fetch('http://192.168.1.100/api/spin')`
6. Calls: `fetch('http://192.168.1.100/api/wiggle_left')`
7. Plays TTS audio

---

## 🤖 ESP32-CAM API Endpoints

Your ESP32-CAM should expose:

```
GET /api/{action}          → Execute robot action
GET /api/wakeup            → Initialize on startup
GET /api/status            → Check connectivity
GET /stream                → MJPEG video stream
```

**Response Format** (expected):
```json
{
  "success": true,
  "message": "Action executed"
}
```

---

## 🧠 Advanced Features

### Emotion Sync
Robot emotion updates the UI in real-time. Add custom styling per emotion:

```typescript
const EMOTION_MAP = {
  happy: { bgColor: 'bg-yellow-50', icon: '😊' },
  sad: { bgColor: 'bg-blue-50', icon: '😢' },
  // ... etc
};
```

### Error Handling
- **Robot offline**: Graceful fallback, no TTS/movement
- **JSON parsing fails**: Falls back to plain text response
- **Network timeout**: 3-second timeout prevents UI freeze

### Voice Mode vs. Thinking Mode
- **Voice Mode**: Real-time responses, live audio stream
- **Thinking Mode**: Extended reasoning, deep analysis, full Markdown support

---

## 🚨 Troubleshooting

### Robot not responding?
```bash
# Check VITE_WINKY_IP in .env.local
# Verify ESP32 is on same Wi-Fi
# Test connectivity: curl http://192.168.1.100/api/status
```

### JSON parsing fails?
Check browser console. System prompt may need adjustment if Gemini returns mixed format.

### Stream not loading?
Verify MJPEG endpoint: `http://{VITE_WINKY_IP}/stream`

---

## 📝 Notes

- **Backward Compatibility**: Old Serial API completely replaced. Update hardware setup.
- **AI Quality**: JSON responses may vary. Adjust system prompt for consistency.
- **Latency**: Local Wi-Fi requests ~100-500ms. Acceptable for real-time control.
- **Scalability**: Ready for multiple robots (add robot selector UI).

---

## 🎯 Next Steps

1. **Deploy ESP32 firmware** with Wi-Fi API endpoints
2. **Set VITE_WINKY_IP** to your robot's local IP
3. **Test autonomous startup** on `/robot` route
4. **Fine-tune system prompt** for your use case
5. **Add custom robot actions** (servo angles, LED patterns, etc.)

---

**Built with ❤️ by Yuvraj Chandra · Powered by Google Gemini & ESP32-CAM**
