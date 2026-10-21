/**
 * The hero's entrance: one Web Animations timeline that runs once, then the page is static.
 *
 * It runs from two places, so the hero's copy never waits for the JS bundle:
 * - inline, from a <script> at the end of the server-rendered hero (hero-motion.tsx), while the HTML
 *   is still parsing and before the first paint of the finished layout;
 * - from HeroMotion's layout effect, when the hero is rendered on the client (a client-side
 *   navigation) and the inline script never ran.
 *
 * The inline copy is this function's own source (`heroEntrance.toString()`), so it must stay
 * self-contained: no imports, no module-level constants, nothing but browser globals.
 *
 * Everything it animates is server-rendered and marked data-hx="<group>"; hero.css keeps those hidden
 * while the root says data-hx-state="pending" (motion allowed, scripting on). Transforms and opacity
 * only. Reduced motion: no entrance (hero.css never hides anything there).
 */
export function heroEntrance(root: HTMLElement | null | undefined): void {
  if (!root || root.dataset.hxState !== "pending") return;
  if (typeof root.animate !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.dataset.hxState = "static";
    return;
  }
  // Not laid out (e.g. still inside a hidden streaming boundary): leave it to the hydration path.
  if (root.getClientRects().length === 0) return;

  const items = Array.from(root.querySelectorAll<HTMLElement>("[data-hx]"));
  // hero.css's failsafe reveals everything after 1.6 s; past that, don't replay what is already shown.
  const failsafe = items[0]
    ?.getAnimations?.()
    .find((animation) => (animation as Partial<CSSAnimation>).animationName === "hx-failsafe");
  const failsafeTime = failsafe?.currentTime;
  if (items.length === 0 || (typeof failsafeTime === "number" && failsafeTime >= 1450)) {
    root.dataset.hxState = "static";
    return;
  }

  // px per design unit: the logo tile is 70 units wide in both layouts.
  const tile = root.querySelector<HTMLElement>("[data-hx-unit]");
  const measured = tile ? tile.getBoundingClientRect().width / Number(tile.dataset.hxUnit) : NaN;
  const k = Number.isFinite(measured) && measured > 0 ? measured : 0.6;

  const easeOut = "cubic-bezier(0.22, 1, 0.36, 1)";
  const easeLift = "cubic-bezier(0.16, 1, 0.3, 1)";
  const rise = (units: number): Keyframe[] => [
    { opacity: 0, transform: `translateY(${units * k}px)` },
    { opacity: 1, transform: "translateY(0)" },
  ];

  // [data-hx group, start (ms), stagger between siblings (ms), duration (ms), easing, keyframes].
  // Siblings animate in DOM order: left to right, top to bottom.
  const steps: [string, number, number, number, string, Keyframe[]][] = [
    // Header items rise and fade in, left to right.
    ["head", 0, 55, 750, easeOut, rise(22)],
    // Each headline line rises out of its own clip mask (.hx-line), 0.12 s apart.
    ["line", 160, 120, 1050, easeOut, [{ transform: "translateY(112%)" }, { transform: "translateY(0)" }]],
    // The subline settles, then the buttons: the primary with a 1.5% scale settle.
    ["sub", 560, 0, 900, easeOut, rise(16)],
    [
      "primary",
      720,
      0,
      900,
      easeOut,
      [
        { opacity: 0, transform: `translateY(${14 * k}px) scale(1.015)` },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
    ],
    ["cta", 810, 90, 850, easeOut, rise(14)],
    // The stats rise in one by one, the footnote under them...
    ["stat", 930, 110, 850, easeOut, rise(20)],
    ["note", 1250, 0, 700, "ease-out", [{ opacity: 0 }, { opacity: 1 }]],
    // ...then the two glass cards lift in...
    [
      "card",
      1330,
      170,
      1150,
      easeLift,
      [
        { opacity: 0, transform: `translateY(${44 * k}px) scale(0.97)` },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
    ],
    // ...and the logo row fades in, left to right, as the last beat.
    [
      "logo",
      1650,
      85,
      900,
      easeOut,
      [
        { opacity: 0, transform: `translateX(${-14 * k}px)` },
        { opacity: 1, transform: "translateX(0)" },
      ],
    ],
  ];

  const animations: Animation[] = [];
  for (const [group, at, stagger, duration, easing, frames] of steps) {
    items
      // Skip what this layout doesn't show (the wide nav on phones, the menu button on desktop).
      .filter((el) => el.dataset.hx === group && el.getClientRects().length > 0)
      .forEach((el, i) => {
        animations.push(
          el.animate(frames, {
            delay: at + i * stagger,
            duration,
            easing,
            // Hold the first frame through the delay; afterwards the page's own styles apply again.
            fill: "backwards",
          }),
        );
      });
  }
  // The animations now hold every item at its first frame, so the CSS hiding can go.
  root.dataset.hxState = "run";
  Promise.all(animations.map((animation) => animation.finished)).then(
    () => {
      if (root.dataset.hxState === "run") root.dataset.hxState = "done";
    },
    () => {
      // Cancelled along with the element (unmount): nothing to settle.
      if (root.isConnected) root.dataset.hxState = "done";
    },
  );
}
