"use client";

import { useEffect } from "react";

// The landing body's motion controller (everything below the hero; the hero has its own, components/hero/entrance.ts).
// One IntersectionObserver for the whole page, no scroll listeners. It drives three kinds of target:
//
// - `.lp-reveal`: rises in once as it enters the viewport. landing.css hides a block only while it says
//   data-reveal="pending", and only under html.lp-motion, which this sets: without JavaScript, with reduced motion,
//   or before this runs, everything is simply visible. Blocks already on screen (or scrolled past) when the
//   observer first answers are marked "done" and never hidden. Blocks entering together stagger via --lp-i.
// - `[data-lp-count]`: the first number in its text counts up from 0 once, then the exact server text is put back.
// - `[data-lp-loop]`: gets data-lp-active while on screen, so its looping CSS/SVG motion pauses off-screen.
//
// Late client-rendered content (the House Chog card) is picked up by a MutationObserver and starts hidden before its
// first paint; streamed server HTML is left alone until React owns it (the AI decision card's reveal sits on a static
// wrapper for that reason, receipts.tsx). If the observer hasn't answered within FIRST_CALLBACK_MS, nothing is hidden at all.

type Phase = "new" | "pending" | "done";
type Target = { reveal: boolean; count: boolean; loop: boolean; phase: Phase };

const SELECTOR = ".lp-reveal, [data-lp-count], [data-lp-loop]";
const ROOT_CLASS = "lp-motion";
const MAX_STAGGER = 5;
const FIRST_CALLBACK_MS = 1500;
const COUNT_DELAY_MS = 300;
const COUNT_MS = 1100;
/** The flow diagram's travelling dot starts once its edges have drawn (landing.css .lp-flowfig). */
const DOT_DELAY_MS = 1800;
const NUMBER = /\d[\d,]*(?:\.\d+)?/;

/**
 * Rendered by React on the client (it carries React's fiber key), as opposed to streamed server HTML that hasn't
 * hydrated yet: touching that one's attributes would break its hydration, so it is left as the server drew it.
 */
const rendered = (node: Element) => Object.keys(node).some((key) => key.startsWith("__reactFiber$"));

const documentOrder = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);

/** Renders nothing: wires up the landing body's motion after hydration. Place it once inside .lp-body. */
export function LandingMotion() {
  useEffect(() => {
    const scope = document.querySelector<HTMLElement>(".lp-body");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!scope || typeof IntersectionObserver !== "function" || reduce.matches) return;

    const html = document.documentElement;
    const targets = new Map<HTMLElement | SVGElement, Target>();
    const timers = new Set<number>();
    const counting = new Map<Text, { restore: () => void; frame: number }>();
    const dotsStarted = new WeakSet<Element>();
    let answered = false;

    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };

    const countUp = (el: Element) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node: Text | null = null;
      for (let next = walker.nextNode(); next; next = walker.nextNode()) {
        if (NUMBER.test(next.nodeValue ?? "")) {
          node = next as Text;
          break;
        }
      }
      const parent = node?.parentNode;
      if (!node || !parent || counting.has(node)) return;
      const text = node.nodeValue ?? "";
      const match = NUMBER.exec(text);
      if (!match) return;
      const raw = match[0];
      const target = Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(target) || target <= 0) return;
      const decimals = raw.includes(".") ? raw.length - raw.indexOf(".") - 1 : 0;
      const format = (value: number) =>
        value.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
          useGrouping: raw.includes(","),
        });

      // While it counts, the number sits in its own box, held at the final number's width (one read), so the
      // words after it never move or wrap. React's own text node stays in place; all of it is undone at the end.
      const textNode = node;
      const box = document.createElement("span");
      box.className = "lp-count-num";
      box.textContent = raw;
      const tailNode = document.createTextNode(text.slice(match.index + raw.length));
      textNode.nodeValue = text.slice(0, match.index);
      parent.insertBefore(tailNode, textNode.nextSibling);
      parent.insertBefore(box, tailNode);
      box.style.minWidth = `${box.getBoundingClientRect().width}px`;
      const restore = () => {
        box.remove();
        tailNode.remove();
        textNode.nodeValue = text;
        counting.delete(textNode);
      };

      const start = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - start) / COUNT_MS);
        if (progress >= 1 || !textNode.isConnected) return restore();
        const eased = 1 - (1 - progress) ** 3;
        box.textContent = format(decimals ? target * eased : Math.round(target * eased));
        counting.set(textNode, { restore, frame: requestAnimationFrame(step) });
      };
      box.textContent = format(0);
      counting.set(textNode, { restore, frame: requestAnimationFrame(step) });
    };

    const setActive = (el: Element, active: boolean) => {
      el.toggleAttribute("data-lp-active", active);
      const svgs = el.querySelectorAll<SVGSVGElement>("svg");
      if (!el.querySelector("animateMotion")) return;
      for (const svg of svgs) {
        if (active) svg.unpauseAnimations();
        else svg.pauseAnimations();
      }
      if (active && !dotsStarted.has(el)) {
        dotsStarted.add(el);
        later(() => {
          // The motion and its fade share one clock: both start here, together.
          for (const animation of el.querySelectorAll<SVGAnimationElement>("animateMotion, animate")) animation.beginElement();
        }, DOT_DELAY_MS);
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        answered = true;
        const batch: HTMLElement[] = [];
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const target = targets.get(el);
          if (!target) continue;
          const visible = entry.isIntersecting;
          if (target.loop) setActive(el, visible);
          if (target.phase === "new") {
            // Already on screen, or scrolled past: it stays as the server drew it.
            const seen = entry.boundingClientRect.top < window.innerHeight;
            target.phase = seen ? "done" : "pending";
            if (target.reveal) el.dataset.reveal = target.phase;
            if (seen) {
              if (!target.loop) io.unobserve(el);
              continue;
            }
          }
          if (target.phase === "pending" && visible) {
            target.phase = "done";
            if (target.reveal) batch.push(el);
            if (target.count) later(() => countUp(el), COUNT_DELAY_MS);
            if (!target.loop) io.unobserve(el);
          }
        }
        batch.sort(documentOrder).forEach((el, index) => {
          el.style.setProperty("--lp-i", String(Math.min(index, MAX_STAGGER)));
          el.dataset.reveal = "in";
        });
      },
      { rootMargin: "0px 0px -8% 0px" },
    );

    const register = (el: Element, late: boolean) => {
      if (!(el instanceof HTMLElement || el instanceof SVGElement) || targets.has(el)) return;
      const reveal = el.classList.contains("lp-reveal");
      const target: Target = {
        reveal,
        count: el.hasAttribute("data-lp-count"),
        loop: el.hasAttribute("data-lp-loop"),
        // Added after the first paint of the page: hidden before its own first paint, then revealed.
        phase: late && reveal ? "pending" : "new",
      };
      if (target.phase === "pending") el.dataset.reveal = "pending";
      targets.set(el, target);
      io.observe(el);
    };

    const scan = (root: Element, late: boolean) => {
      if (root.matches(SELECTOR)) register(root, late);
      for (const el of root.querySelectorAll(SELECTOR)) register(el, late);
    };

    const mo = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) if (node instanceof Element && rendered(node)) scan(node, true);
      }
    });

    /** Everything shown as drawn, nothing hidden: reduced motion switched on, printing, or no answer in time. */
    const settleAll = () => {
      html.classList.remove(ROOT_CLASS);
      for (const [el, target] of targets) {
        target.phase = "done";
        if (target.reveal) el.dataset.reveal = "done";
      }
      io.disconnect();
      mo.disconnect();
    };

    html.classList.add(ROOT_CLASS);
    scan(scope, false);
    mo.observe(scope, { childList: true, subtree: true });
    later(() => {
      if (!answered) settleAll();
    }, FIRST_CALLBACK_MS);

    const onReduce = () => reduce.matches && settleAll();
    reduce.addEventListener("change", onReduce);
    window.addEventListener("beforeprint", settleAll);

    return () => {
      reduce.removeEventListener("change", onReduce);
      window.removeEventListener("beforeprint", settleAll);
      for (const id of timers) window.clearTimeout(id);
      for (const { restore, frame } of counting.values()) {
        cancelAnimationFrame(frame);
        restore();
      }
      io.disconnect();
      mo.disconnect();
      html.classList.remove(ROOT_CLASS);
    };
  }, []);

  return null;
}
