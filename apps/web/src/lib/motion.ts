import { useReducedMotion } from 'motion/react';
import { useUi, type MotionPref } from '../stores/ui';

/**
 * How much motion to use: the in-app preference (Settings → Appearance), lowered to "reduced"
 * when the operating system asks for reduced motion.
 */
export function useMotionLevel(): MotionPref {
  const system = useReducedMotion();
  const pref = useUi((s) => s.motion);
  return system ? 'reduced' : pref;
}

/** True when the OS asks for reduced motion or the user chose "Reduce motion" in Settings. */
export function useReduceMotion(): boolean {
  return useMotionLevel() === 'reduced';
}

/** Decorative effects (sparkles, sweeps, slide-ins) only play at the "full" level. */
export function useDecorativeMotion(): boolean {
  return useMotionLevel() === 'full';
}
