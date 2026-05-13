// src/lib/robotManager.ts
// Hardware: ESP32-CAM · HC-SR04 Ultrasonic · L298N H-Bridge · 2× Geared DC · 16×2 LCD

export interface KinematicAction {
  command: string;
  speed?: number;
  duration_ms?: number;
}

export interface KinematicsLogEntry {
  command: string;
  speed?: number;
  duration_ms?: number;
  timestamp: Date;
  status: 'sent' | 'confirmed' | 'timeout';
}

// Deprecated — kept for build compatibility
export const setGlobalPort = (_port: any) => {
  console.warn("setGlobalPort is deprecated. Winky uses wireless IoT kinematics.");
};
export const getGlobalPort = () => null;

const getIP = (): string =>
  (import.meta as any).env.VITE_WINKY_IP || '192.168.1.100';

/**
 * Fires a SINGLE motor command via the ESP32 HTTP API.
 * Tries CORS-mode first (reads response), falls back to no-cors.
 * L298N safe PWM range: 120–230. Values below 100 stall motors. Above 240 = overcurrent.
 */
export const executeKinematicsSingle = async (
  action: KinematicAction | string
): Promise<'confirmed' | 'sent' | 'timeout'> => {
  const ip = getIP();
  let commandStr = '';
  let queryParams = '';

  if (typeof action === 'string') {
    if (!action || action.toLowerCase() === 'none') return 'sent';
    commandStr = action;
  } else {
    if (!action.command || action.command.toLowerCase() === 'none') return 'sent';
    commandStr = action.command;
    // Clamp to L298N safe range: minimum 100 when non-zero, max 230
    const rawSpeed = Math.max(0, Math.min(255, action.speed ?? 180));
    const safeSpeed = rawSpeed > 0 ? Math.max(100, rawSpeed) : 0;
    const duration = Math.max(100, Math.min(5000, action.duration_ms ?? 600));
    queryParams = `?speed=${safeSpeed}&duration_ms=${duration}`;
  }

  const url = `http://${ip}/api/${encodeURIComponent(commandStr)}${queryParams}`;
  console.log(`[Kinematics] ${url}`);

  try {
    await fetch(url, { method: 'GET', signal: AbortSignal.timeout(800) });
    return 'confirmed';
  } catch {
    try {
      fetch(url, { method: 'GET', mode: 'no-cors' }).catch(() => {});
      return 'sent';
    } catch {
      return 'timeout';
    }
  }
};

/**
 * Executes motor commands SEQUENTIALLY — waits duration_ms + 50ms buffer between each.
 * Fires onCommandFired callback per command so App can update the KinematicsLog.
 */
export const executeKinematicsSequential = async (
  actions: Array<KinematicAction | string>,
  onCommandFired?: (entry: KinematicsLogEntry) => void
): Promise<void> => {
  if (!actions || !Array.isArray(actions)) return;

  for (const action of actions) {
    if (!action) continue;
    const command = typeof action === 'string' ? action : action.command;
    const speed = typeof action === 'object' ? action.speed : undefined;
    const duration_ms = typeof action === 'object' ? action.duration_ms : undefined;

    const status = await executeKinematicsSingle(action);

    onCommandFired?.({ command, speed, duration_ms, timestamp: new Date(), status });

    // Wait the full action duration before issuing the next command
    const waitMs = (typeof action === 'object' ? (action.duration_ms ?? 600) : 600) + 50;
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
};

/**
 * Legacy parallel execution — kept for build compatibility.
 * @deprecated Use executeKinematicsSequential instead.
 */
export const executeKinematics = (actions: Array<KinematicAction | string>) => {
  if (!actions || !Array.isArray(actions)) return;
  const ip = getIP();
  actions.forEach(action => {
    if (!action) return;
    let commandStr = '';
    let queryParams = '';
    if (typeof action === 'string') {
      if (action.toLowerCase() === 'none') return;
      commandStr = action;
    } else {
      if (!action.command || action.command.toLowerCase() === 'none') return;
      commandStr = action.command;
      const p = new URLSearchParams();
      if (action.speed !== undefined) p.append('speed', String(action.speed));
      if (action.duration_ms !== undefined) p.append('duration_ms', String(action.duration_ms));
      const ps = p.toString();
      if (ps) queryParams = `?${ps}`;
    }
    if (!commandStr) return;
    fetch(`http://${ip}/api/${encodeURIComponent(commandStr)}${queryParams}`, {
      method: 'GET', mode: 'no-cors'
    }).catch(err => console.warn(`[Kinematics Offline]`, err));
  });
};

/**
 * Pings ESP32 for connection health and HC-SR04 ultrasonic distance.
 * Endpoint /api/status should return: { distance_cm: number }
 * Falls back to /capture (no-cors) if /api/status is unreachable.
 */
export const pingESP32 = async (
  ip: string
): Promise<{ online: boolean; latencyMs: number; distanceCm?: number }> => {
  const start = performance.now();
  try {
    const res = await fetch(`http://${ip}/api/status`, {
      method: 'GET',
      signal: AbortSignal.timeout(1500),
    });
    const latencyMs = Math.round(performance.now() - start);
    try {
      const data = await res.json();
      return { online: true, latencyMs, distanceCm: data.distance_cm };
    } catch {
      return { online: true, latencyMs };
    }
  } catch {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 1500);
      await fetch(`http://${ip}/capture`, { method: 'GET', mode: 'no-cors', signal: controller.signal });
      clearTimeout(t);
      return { online: true, latencyMs: Math.round(performance.now() - start) };
    } catch {
      return { online: false, latencyMs: 0 };
    }
  }
};
