import { useReducedMotion } from 'motion/react';
import { useUi } from '../stores/ui';

/** True when the OS asks for reduced motion or the user chose "Reduce motion" in Settings. */
export function useReduceMotion(): boolean {
  const system = useReducedMotion();
  const pref = useUi((s) => s.motion);
  return !!system || pref === 'reduced';
}
