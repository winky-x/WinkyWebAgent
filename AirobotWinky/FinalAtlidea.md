# 📄 PROJECT PROPOSAL DOCUMENT
**To:** Dear Sir, ATL In-Charge  
**From:** Yuvraj Chandra
**Date:** May 19, 2026  
**Project Title:** Shadow-Sweep AI (Autonomous Tactical Under-Watch)  
**ATL Theme Alignment:** Defense & Security / Smart Mobility / Disaster Management  

---

## 1. Executive Summary
Currently, at Indian military bases, luxury hotels, and border checkpoints, security guards use a handheld mirror on a stick to check underneath vehicles for explosives or contraband. This method is incredibly dangerous (putting humans in the blast radius) and highly inaccurate, as the human eye often misses modern, flat threats in dark undercarriages. 

**Shadow-Sweep AI** is an autonomous, low-profile robotic agent paired with a Cloud AI Web Dashboard. It replaces the human guard by sliding underneath the vehicle, using sonar to position itself, and utilizing Computer Vision (AI) to detect multi-modal threats such as IEDs, contraband, and espionage devices.

## 2. The Innovation (Why this stands out)
Most student robotics projects rely on generic line-following or simple obstacle avoidance. Shadow-Sweep AI introduces a **Silicon Valley-style "Edge-to-Cloud" architecture**:
*   **The Edge (Hardware):** An autonomous rover that does the dangerous physical work.
*   **The Cloud (Software):** A React-based Command Center Dashboard where the AI (Google Gemini Vision API) processes the imagery to ensure guards remain at a safe distance.

## 3. Multi-Threat AI Capabilities (The AI Brain)
The robot does not just look for bombs. The AI is trained to analyze the undercarriage for 4 distinct variations of anomalies:
1.  **Lethal Threats:** IEDs, pipe bombs, or suspicious wires taped to the chassis.
2.  **Espionage:** Magnetic GPS trackers or listening bugs attached to VIP vehicles.
3.  **Contraband:** Smuggled drugs, weapons, or gold hidden near exhaust pipes (border security).
4.  **Mechanical Fatigue:** Oil leaks or severe chassis cracks in military supply trucks before deployment.

## 4. Hardware & Circuit Architecture
The project utilizes the standard ATL inventory, engineered for maximum efficiency and stability:
*   **ESP32-CAM:** The primary microcontroller and "eye" of the robot. It captures high-res images using its onboard LED flash in the dark undercarriage and transmits them via Wi-Fi.
*   **HC-SR04 Ultrasonic Sensor:** Used for precision positioning. It stops the robot exactly in the center of the car's undercarriage to prevent hitting the exhaust or axles.
*   **L298N Motor Driver & DC Geared Motors:** Provides the low-profile chassis with high-torque mobility.
*   **16x2 I2C LCD Display:** Mounted on the robot to display on-ground status (e.g., `SCANNING...` or `[CRITICAL THREAT]`).
*   **Power System:** Dual 18650 Li-ion batteries paired with an LM2596 DC-DC Buck Converter to ensure a stable 5V supply to the ESP32-CAM, preventing brownouts during image transmission.

## 5. Software & UI Architecture
*   **C++ (Arduino IDE):** Controls the autonomous motor navigation, sonar calculations, and Wi-Fi camera triggers.
*   **React.js Web Dashboard:** A dark-mode, military-style UI hosted on a laptop. It acts as the "Bunker Command Center." 
*   **AI Integration:** The dashboard routes the ESP32 images to the Gemini Vision API, translating visual data into a real-time text-based threat report.

## 6. Exhibition "Desk Demo" Strategy
To prove the system's effectiveness to NITI Aayog judges, the project is designed to be demonstrated on a standard school desk:
1.  A cardboard box propped on blocks simulates a vehicle. Underneath, out of human sight, a printed picture of a vehicle undercarriage with a drawn "suspicious wire/box" is attached.
2.  From a laptop, the user clicks **"INITIATE SCAN"**.
3.  The robot autonomously navigates under the box, stops in the center using sonar, flashes its LED, and reverses out.
4.  The laptop dashboard instantly displays the image alongside the AI output: 
    *`[CRITICAL ANOMALY DETECTED: FOREIGN WIRING ON REAR AXLE. THREAT: IED. INITIATE LOCKDOWN.]`*

## 7. Conclusion
Shadow-Sweep AI moves beyond standard school projects by merging hardware automation with enterprise-level AI software. It solves a highly relevant national security problem, ensures zero risk to human life during inspections, and presents an interactive, unforgettable demonstration for the judges. I request approval to begin prototyping this circuit and software architecture.
