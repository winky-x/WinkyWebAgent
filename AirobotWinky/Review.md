# 🤖 Winky Robot: Hardware Integration & Wiring Plan

## 1. The "Software-to-Hardware" Workflow
1.  **Frontend**: You click "Forward" or Winky decides to move.
2.  **Network**: The frontend sends a GET request: `http://192.168.1.100/api/forward?speed=180&duration_ms=600`.
3.  **ESP32-CAM**: Receives the request, reads the `speed` and `duration`, and sets its GPIO pins (12, 13, 14, 15) to HIGH/LOW.
4.  **L298N Driver**: Takes the weak 3.3V signal from the ESP32 and sends 7.4V–12V from the battery to the **Geared DC Motors**.
5.  **Feedback**: The ESP32 reads the **HC-SR04** distance, updates the **16x2 LCD**, and sends the distance back to the frontend.

---

## 2. Wiring Diagram (The "Winky Standard" Pinout)

Since the ESP32-CAM has limited pins (most are used by the Camera), you must use these specific pins to match standard firmware logic:

### A. Power Distribution (CRITICAL)
| From (Source) | To (Destination) | Wire Color (Rec.) |
| :--- | :--- | :--- |
| **Battery (+) (7.4V-12V)** | L298N `12V` Terminal | Red |
| **Battery (-)** | L298N `GND` Terminal | Black |
| **L298N `GND`** | ESP32-CAM `GND` | Black (Common Ground) |
| **L298N `5V` Out** | ESP32-CAM `5V` Pin | Red |
| **L298N `5V` Out** | HC-SR04 `VCC` & LCD `VCC` | Red |

### B. Motor Control (L298N to ESP32-CAM)
*This setup uses differential steering (Motor A = Right, Motor B = Left).*

| L298N Pin | ESP32-CAM Pin | Logic |
| :--- | :--- | :--- |
| **IN1** | **GPIO 12** | Right Motor Forward |
| **IN2** | **GPIO 13** | Right Motor Backward |
| **IN3** | **GPIO 14** | Left Motor Forward |
| **IN4** | **GPIO 15** | Left Motor Backward |
| **ENA / ENB** | Connect to 5V (Jumpers) | Constant Speed (PWM handled via IN pins) |

### C. Obstacle Sensing (HC-SR04 Ultrasonic)
| HC-SR04 Pin | ESP32-CAM Pin | Purpose |
| :--- | :--- | :--- |
| **Trig** | **GPIO 2** | Trigger Pulse |
| **Echo** | **GPIO 16** | Return Pulse (Input) |

### D. Visual Feedback (16x2 LCD with I2C Adapter)
*Note: You must use an I2C adapter on the back of the LCD to save pins.*

| LCD (I2C) Pin | ESP32-CAM Pin | Purpose |
| :--- | :--- | :--- |
| **SDA** | **GPIO 14** (Shared) | Data Line |
| **SCL** | **GPIO 15** (Shared) | Clock Line |
*Wait! If GPIO 14/15 are used for motors, you must use **Software I2C** on GPIO 0 and 1, or re-map. For this build, it is recommended to use an I2C expander to keep pins free.*

---

## 3. How to Connect the Frontend

### Step 1: Find the Robot's IP
When you upload your Arduino/C++ code to the ESP32-CAM, open the **Serial Monitor**. It will print:
`WiFi Connected! IP Address: 192.168.1.105` (Example)

### Step 2: Configure the `.env` File
In your `winkywebagent` project folder, find or create the `.env` file and update the IP:
```env
VITE_WINKY_IP=192.168.1.105
VITE_GEMINI_API_KEY=your_key_here
```

### Step 3: The Handshake
1.  Turn on the Robot.
2.  Run `npm run dev` on your computer.
3.  Open the Winky Web Agent in your browser.
4.  Click **"Initialize Winky Physical Agent"**.
5.  If you see the **Green Dot** and the **Live Video Feed**, you are connected!

---

## 4. Safety & Tips for "1000% Working" Setup
1.  **Common Ground**: You **MUST** connect the GND of the Battery, L298N, and ESP32-CAM together. If you don't, the signals will be "noisy" and the robot will twitch.
2.  **Voltage Drop**: ESP32-CAMs crash if the voltage drops below 4.7V. Use a dedicated capacitor (1000uF) across the 5V and GND pins of the ESP32 if it resets when motors start.
3.  **L298N Jumper**: Keep the "5V Enable" jumper on the L298N **ON** if you are using a 7.4V (2S Li-ion) battery. This allows the L298N to power the ESP32.
4.  **Test Without Wheels**: Always test your code with the robot on a block (wheels off the ground) first. This prevents Winky from driving off your desk if the logic is reversed!