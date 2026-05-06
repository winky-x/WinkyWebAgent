// src/lib/robotManager.ts
let activePort: SerialPort | null = null;

export const setGlobalPort = (port: SerialPort) => {
  activePort = port;
};

export const getGlobalPort = () => activePort;
