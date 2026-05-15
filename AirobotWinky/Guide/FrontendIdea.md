### **1. The UI: The Winky Dashboard**
We need to separate standard chat from the "Robot Mode" so the video stream and high-speed controls don't crash your main site.

* **Routing:** We will set up a new route (e.g., `winkytalk.vercel.app/robot`). 
* **The Header Button:** Add a prominent button in your main navigation: **"Initialize Winky Physical Agent."**
* **The Layout:** Using Tailwind CSS, we can split this new page into a high-tech dashboard:
    * **Left Column:** The live ESP32-CAM video feed (First-Person View).
    * **Right Column:** The Voice/Chat interface, streaming text, and a log showing what "emotion" Winky is currently feeling.

### **2. The Core Logic: Structured JSON Responses (The Brain)**
To achieve that "single response that we filter out," we must change how you prompt the AI. You will update Winky's **System Instructions** to command it to *never* return plain text. It must always return a **JSON object**.

Here is what the AI's "Thought Process" will look like when it returns data to your React app:

```json
{
  "thought": "The user just said hello. I haven't seen them in a while. I should express happiness and greet them back.",
  "spoken_reply": "Hi sweetie! I was just looking around the room waiting for you.",
  "emotion": "happy",
  "physical_action": ["wiggle_left", "wiggle_right"]
}
```

### **3. The "Splitter" (React Frontend Logic)**
When your Vite app receives that JSON from the AI model, your JavaScript will instantly parse it and filter the data to the correct places, resulting in zero perceived latency:

1.  **`data.spoken_reply`** $\rightarrow$ Sent to the UI chat bubble and the Text-to-Speech audio engine.
2.  **`data.physical_action`** $\rightarrow$ Instantly triggers an array of `fetch()` calls to the ESP32 (e.g., `http://[WINKY_IP]/wiggle`).
3.  **`data.emotion`** $\rightarrow$ Updates the UI state so the user can visually see Winky's current mood.

### **4. Emotional Kinematics (The Body Language)**
You mentioned adding custom movements like a happy 360-turn. We will build a "Movement Library" on the ESP32. 
Instead of sending raw motor commands from the laptop, the ESP32 will have pre-programmed "macros" written in C++. 

* If the ESP32 receives `/api/emotion/happy`, the C++ code automatically runs a sequence: *Spin left for 200ms, spin right for 200ms, repeat.*
* If it receives `/api/emotion/curious`, it might run: *Move forward slowly, stop, turn camera left slightly.*

This reduces latency. The laptop just says "Be Happy," and the hardware already knows what a "happy dance" looks like.

### **5. The Autonomous Startup Sequence**
To get that unique behavior where Winky wakes up and looks around *before* you speak, we will use a React `useEffect` hook.

When you click the header button and the `/robot` page loads, the frontend will automatically:
1. Ping the ESP32 to start the video stream.
2. Send an `/api/wakeup` command to the ESP32, triggering a slow 360-degree rotation so the AI can "scan" the room.
3. Automatically trigger the AI to generate a greeting based on its initial startup state.
