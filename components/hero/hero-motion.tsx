"use client";

import { type ReactNode, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { heroEntrance } from "./entrance";

// The hero's only motion code: the entrance timeline (entrance.ts) and the artwork loop's play/pause.
//
// The entrance starts from an inline <script> at the end of the server-rendered hero (HeroEntranceScript,
// placed by animr-hero.tsx right after the hero's last element, before the sections below), so the copy
// shows (and animates in) as soon as the HTML and CSS are there, not after hydration. When the hero
// is rendered on the client instead (a client-side navigation), the layout effect runs the same
// function. It plays once per page load: coming back to the hero within the app shows it static.
//
// Reduced motion: no entrance (hero.css never hides anything) and no loop: the video's <source> only
// matches (prefers-reduced-motion: no-preference), hero.css hides the <video>, and the still shows.

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** Set once the entrance has started (or been skipped) in this page load. */
let enteredThisLoad = false;

const noSubscribe = () => () => {};
/** True during server rendering and hydration, false for anything rendered on the client. */
function useHydrating(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => false,
    () => true,
  );
}

/**
 * The inline entrance: rendered on the server and kept through hydration, then dropped. React never
 * executes a <script> it creates on the client, so it isn't rendered there at all. Place it inside
 * HeroMotion, after the last [data-hx] element: it runs on the nearest HeroMotion root.
 */
export function HeroEntranceScript() {
  const hydrating = useHydrating();
  if (!hydrating) return null;
  return (
    <script
      // Server and client bundles may print the function differently; the server's copy is the one that ran.
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: `(${heroEntrance.toString()})(document.currentScript&&document.currentScript.closest("[data-hx-state]"))`,
      }}
    />
  );
}

type HeroMotionProps = {
  className: string;
  children: ReactNode;
};

/**
 * The hero's root element: runs the entrance once and keeps the artwork loop in step with the page. On
 * the landing page it wraps the whole page (the hero's header sits outside <main>, its copy inside), so
 * the entrance reaches both. Render <HeroEntranceScript /> somewhere inside it, after the hero.
 */
export function HeroMotion({ className, children }: HeroMotionProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Hydration or a client render. A layout effect, so a client-side entrance has its first frame in
  // place before the browser paints. data-hx-state is written straight to the DOM: React rendered
  // "pending" and never re-renders it.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (root.dataset.hxState === "pending") {
      if (enteredThisLoad) root.dataset.hxState = "static";
      else heroEntrance(root);
      // Still pending (couldn't run): show everything as it is.
      if (root.dataset.hxState === "pending") root.dataset.hxState = "static";
    }
    enteredThisLoad = true;
  }, []);

  // The artwork loop: muted autoplay, paused while off screen or when reduced motion is asked for;
  // if the browser refuses to play it (or it can't load), it's hidden and the still shows.
  useEffect(() => {
    const root = rootRef.current;
    const video = root?.querySelector<HTMLVideoElement>("video[data-hx-video]");
    if (!root || !video) return;
    const reduced = matchMedia(REDUCED_MOTION);
    let onScreen = true;

    const hide = () => {
      root.dataset.hxVideo = "off";
    };
    const sync = () => {
      if (reduced.matches || !onScreen || document.hidden) {
        video.pause();
        return;
      }
      // React sets `muted` as a property; make sure it holds before asking to play.
      video.muted = true;
      // The <source> only matches without reduced motion: after the preference flips, select it again.
      if (!video.currentSrc) video.load();
      const attempt = video.play();
      attempt?.catch((error: unknown) => {
        // AbortError just means a pause() raced it; anything else (NotAllowedError: autoplay blocked,
        // e.g. iOS Low Power Mode; NotSupportedError) means the loop won't run here.
        if (!(error instanceof DOMException && error.name === "AbortError")) hide();
      });
    };

    const source = video.querySelector("source");
    video.addEventListener("error", hide);
    source?.addEventListener("error", hide);
    reduced.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      sync();
    });
    observer.observe(video);
    sync();

    return () => {
      video.removeEventListener("error", hide);
      source?.removeEventListener("error", hide);
      reduced.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      observer.disconnect();
    };
  }, []);

  return (
    // suppressHydrationWarning: the inline entrance has usually moved data-hx-state on by hydration.
    <div ref={rootRef} className={className} data-hx-state="pending" suppressHydrationWarning>
      {children}
    </div>
  );
}
