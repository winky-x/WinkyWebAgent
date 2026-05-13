import { useEffect, useRef } from 'react';
import { executeKinematicsSingle } from '@/lib/robotManager';

const KEY_MAP: Record<string, string> = {
  ArrowUp: 'forward',
  ArrowDown: 'backward',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ' ': 'stop',
  w: 'forward', W: 'forward',
  s: 'backward', S: 'backward',
  a: 'left', A: 'left',
  d: 'right', D: 'right',
};

/**
 * Binds Arrow/WASD keys to robot motor commands when the user is in Robot Mode.
 * Keyboard control is disabled when an input or textarea has focus.
 * Sends a stop command on key-up to prevent motors running indefinitely.
 */
export function useRobotKeyboard(isActive: boolean) {
  const pressed = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isActive) return;

    const isInputFocused = () => {
      const el = document.activeElement;
      return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA';
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused()) return;
      const command = KEY_MAP[e.key];
      if (!command) return;
      e.preventDefault();
      if (pressed.current.has(e.key)) return; // prevent key-repeat flooding
      pressed.current.add(e.key);
      executeKinematicsSingle({ command, speed: 180, duration_ms: 300 });
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!KEY_MAP[e.key]) return;
      pressed.current.delete(e.key);
      if (isInputFocused()) return;
      // Only send stop if no other movement key is still held
      const anyMoveHeld = [...pressed.current].some(
        k => KEY_MAP[k] && KEY_MAP[k] !== 'stop'
      );
      if (!anyMoveHeld) {
        executeKinematicsSingle({ command: 'stop', speed: 0, duration_ms: 100 });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      pressed.current.clear();
    };
  }, [isActive]);
}
