# Winky AI Robot: Hardware Component Specification
**Target Audience:** Education Supervisor / Laboratory Teacher
**Revision:** v4.0 (Autonomous Wireless Configuration)

This document details the hardware components integrated into the Winky AI Robot system. The architecture has been upgraded to support wireless computer vision and autonomous kinetic responses.

## 1. Central Processing Unit (CPU) & Vision
### **ESP32-CAM (AI-Thinker Module)**
*   **Role:** Main Controller & Vision Streamer.

### **ESP32-CAM-MB** — *Required* (Used to flash firmware to the ESP32-CAM).

## 2. Power Management System
### **LM2596 DC-DC Buck Converter**
*   **Role:** High-Efficiency Voltage Regulator.
*   **Function:** Steps down the 7.4V battery supply to a stable 5.0V.
*   **Importance:** Protects the ESP32-CAM from over-voltage while providing sufficient current for sensors.

### **18650 Li-ion Batteries (x2) & Holder**
*   **Role:** Primary Energy Reservoir.
*   **Specs:** 7.4V Total Output (Series connection).
*   **Function:** Provides high-discharge current required for simultaneous motor operation and Wi-Fi transmission.

## 3. Kinetic Drive System
### **L298N Dual H-Bridge Motor Driver**
*   **Role:** High-Current Motor Interface.

### **Geared DC Motors (x2)**
*   **Role:** Propulsion Actuators.
*   **Type:** 3-6V DC Geared Motors.

## 4. Sensory & Feedback Interface
### **HC-SR04 Ultrasonic Sensor**
*   **Role:** Distance Measurement (LIDAR alternative).
*   **Function:** Uses ultrasonic sound waves to detect obstacles within a 2cm to 400cm range.

### **16x2 LCD Display (I2C Interface)**
*   **Role:** System Status Interface.
*   **Function:** Displays the robot's local IP address, current emotion, and connectivity status.
*   **Protocol:** Uses I2C (Inter-Integrated Circuit) to minimize pin usage on the ESP32.

---
**Verification Note:** All components are wired according to the `esp32code.ino.ino` firmware definitions to ensure 100% software-hardware compatibility.
