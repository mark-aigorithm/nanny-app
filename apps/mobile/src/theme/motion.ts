/**
 * Motion tokens — the app moves the way it looks: soft, calm, unhurried.
 * Short fades and small rises, springs with no visible bounce. Every animated
 * surface reads its timing from here and turns itself off under the OS
 * Reduce Motion setting (see `useReducedMotion`).
 */
export const motion = {
  duration: {
    fast: 150,
    base: 220,
    slow: 320,
  },
  /** Scale a pressable settles to while held. */
  pressScale: 0.97,
  spring: {
    /** Press in/out — stiff and critically damped, so it never wobbles. */
    press: { stiffness: 420, damping: 32, mass: 1 },
    /** Tab-bar indicator glide — slightly softer so the travel is visible. */
    indicator: { stiffness: 260, damping: 28, mass: 1 },
  },
  /** Delay between successive list items entering. */
  stagger: 40,
  /** Items at or past this index enter together, so long lists don't trickle. */
  staggerCap: 6,
  /** Distance (px) an entering element rises into place. */
  entranceOffset: 8,
} as const;
