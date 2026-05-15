# **Project Specification: Winky**
### **Kinetic Intelligence & Wireless Vision Architecture**

**System:** ESP32-CAM Autonomous Web-Controlled Robotics
**Frontend Environment:** React / Vite / Tailwind CSS 
**Network Protocol:** Local Wi-Fi (HTTP / API Fetch)

---

## **1. Executive Summary**
The objective of the Winky V2 upgrade is to transition the robotic entity from a tethered, serial-controlled system to a fully wireless, autonomous IoT (Internet of Things) platform. By replacing the traditional 5V microcontroller with a 3.3V ESP32-CAM, the robot gains simultaneous dual capabilities:
1.  **Computer Vision:** Broadcasting a live First-Person View (FPV) video stream via a local web server.
2.  **Wireless Kinetic Control:** Receiving HTTP API commands (`fetch` requests) from a custom React-based web UI to control real-world motor functions.

This architecture decouples the heavy AI processing (handled securely on the local computer) from the physical execution (handled by the ESP32 chassis).

---

## **2. Bill of Materials (BOM)**
To safely execute this wireless architecture, the following components are required. Items marked "To Be Issued" are required from the laboratory inventory.

### **Processing & Vision**
* **ESP32-CAM Module (OV2640 Lens)** — *Owned* (Main controller, hosts the web server and handles logic).
* **FTDI Programmer (USB to TTL)** — *Required* (Used to flash firmware to the ESP32-CAM).

### **Drive System (Kinematics)**
* **L298N Motor Driver Module** — *Owned* (H-Bridge driver for motor speed and direction control).
* **Geared DC Motors (x2)** — *Owned* (Primary propulsion).

### **Visual Feedback & Sensory Input**
* **16x2 LCD Display (I2C Interface)** — *NEW* (Displays real-time status, IP address, and emotions).
* **HC-SR04 Ultrasonic Sensor** — *NEW* (Measures distance for obstacle avoidance).

### **Power Management (Critical Safety)**
* **LM2596 DC-DC Buck Converter** — *Owned* (Steps down battery voltage to a stable 5V for the ESP32 and sensors).
* **18650 Li-ion Batteries (x2) & Holder (7.4V Total)** — *Owned* (High-capacity power source).

---

## **3. Power & Safety Architecture**
The ESP32-CAM is a highly sensitive 3.3V logic device. Strict power segregation is enforced:
* **Motor Power:** Raw 7.4V from batteries goes directly to the L298N `12V` terminal.
* **Logic Power:** 7.4V goes to the LM2596 Buck Converter, adjusted to output exactly **5.0V**.
* **ESP32-CAM:** Powered via the `5V` pin from the Buck Converter.
* **Common Ground:** All GND pins must be tied together.

---

## **4. System Wiring Protocol**

### **A. Motor Control (ESP32 $\rightarrow$ L298N)**
* **GPIO 14** $\rightarrow$ L298N **IN1** (Right Forward)
* **GPIO 15** $\rightarrow$ L298N **IN2** (Right Backward)
* **GPIO 13** $\rightarrow$ L298N **IN3** (Left Forward)
* **GPIO 12** $\rightarrow$ L298N **IN4** (Left Backward)

### **B. Ultrasonic Sensor (HC-SR04)**
* **VCC** $\rightarrow$ **5V** (Buck Converter Output)
* **GND** $\rightarrow$ **GND** (Common)
* **TRIG** $\rightarrow$ **GPIO 2**
* **ECHO** $\rightarrow$ **GPIO 16**

### **C. LCD Display (16x2 I2C)**
* **VCC** $\rightarrow$ **5V**
* **GND** $\rightarrow$ **GND**
* **SDA** $\rightarrow$ **GPIO 4**
* **SCL** $\rightarrow$ **GPIO 33**

---

## **5. Software Integration Strategy**

The software stack is divided into two operational layers:

**Layer 1: The Hardware Server (C++)**
* Written in C++ via the Arduino IDE (uploaded using the FTDI programmer).
* Connects to the local Wi-Fi router and establishes a static IP address.
* Hosts an MJPEG video stream and listens for asynchronous HTTP GET requests (e.g., `/api/move?dir=forward`).

**Layer 2: The Web Agent UI (React / JavaScript)**
* Hosted locally via Vite.
* The `winkytalk` interface replaces the physical Web Serial API with wireless network calls.
* When the user commands the AI, the React frontend executes a `fetch()` request over the network. The ESP32 receives the packet, pulls the correct GPIO pins `HIGH`, and the chassis physically moves.

***