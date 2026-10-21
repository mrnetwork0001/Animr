import Link from "next/link";
import type { ReactNode } from "react";
import { preload } from "react-dom";
import { RandomChog } from "@/components/landing/random-chog-button";
import { DEFAULT_WINDOW } from "@/lib/dna/backtest";
import { allChogs } from "@/lib/dna/chogs";
import { leagueHeadline, windowLabel } from "@/lib/dna/headline";
import {
  heroActions,
  heroBrand,
  heroBuiltOn,
  heroCards,
  heroFootnote,
  heroMenu,
  heroNav,
  heroStats,
  heroSubline,
  heroTitle,
} from "./content";
import { heroDeckChogs } from "./deck-data";
import { heroDisplayFont, heroTextFont } from "./fonts";
import { HeroDeck } from "./hero-deck";
import { HeroMenu } from "./hero-menu";
import { HeroEntranceScript, HeroMotion } from "./hero-motion";
import { FortressLockIcon, NetworkGraphIcon } from "./icons";
import { WIDE_LAYOUT } from "./layout";
import "./hero.css";

const CARD_ICONS = { dna: NetworkGraphIcon, guard: FortressLockIcon } as const;

type Stat = {
  key: string;
  value: string;
  spoken?: string;
  label: string;
  noted?: boolean;
};

type AnimrHeroProps = {
  /** More classes for the page root, e.g. the v2 page frame ("v2-page"). */
  className?: string;
  /** The rest of the page: rendered inside <main>, right after the hero. */
  children?: ReactNode;
  /** The page footer: rendered after <main>. */
  footer?: ReactNode;
};

/**
 * The Animr hero and the page it opens: one screen drawn on a 2048×1455 design canvas on wide screens,
 * one centred column on phones and tablets (hero.css). Server-rendered and prerendered: the League share
 * and its window come from the live League (lib/dna/headline.ts, "use cache" for hours, the same
 * getPopulation /league serves), and the only client code is the entrance timeline (hero-motion.tsx), the
 * Chog deck (hero-deck.tsx), the phone menu and Random Chog.
 *
 * Landmarks: the hero's header (brand, nav, menu) is the page's banner, outside <main>; it is laid over
 * the hero (.hx-header-frame repeats the canvas geometry), so the look is the canvas's. <main> holds the
 * hero's copy and artwork, then `children`; `footer` follows <main>.
 */
export async function AnimrHero({ className = "", children, footer }: AnimrHeroProps) {
  // The deck's front card is the wide canvas's largest image: fetch it early there. In the column it sits
  // below the fold, so it loads at normal priority.
  const deck = heroDeckChogs();
  if (deck[0]) {
    preload(deck[0].src, {
      as: "image",
      fetchPriority: "high",
      media: WIDE_LAYOUT,
    });
  }

  const league = await leagueHeadline();
  const { passed, total } = heroStats.guard;
  const stats: Stat[] = [
    {
      key: "traders",
      value: (league?.total ?? allChogs().length).toLocaleString("en-US"),
      label: heroStats.traders,
    },
    // Without a replay (candles unreadable) the share and its footnote are left out, never guessed.
    ...(league
      ? [
          {
            key: "beat",
            // Rounded like the League's own field panel (components/dna/league-board.tsx), so both read the same.
            value: `${Math.round(league.beatHoldPct)}%`,
            label: heroStats.beat,
            noted: true,
          },
        ]
      : []),
    {
      key: "guard",
      value: `${passed}/${total}`,
      spoken: `${passed} of ${total}`,
      label: heroStats.guard.label,
    },
  ];

  return (
    <HeroMotion className={`hx-page ${heroDisplayFont.variable} ${heroTextFont.variable} ${className}`}>
      <a href="#main" className="hx-skip">
        {heroBrand.skipLink}
      </a>
      <div className="hx-header-frame">
        <div className="hx-header-canvas">
          <header className="hx-header">
            <Link href="/" className="hx-brand" aria-label={heroBrand.homeLabel}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a small static lockup, sized in canvas units */}
              <img
                className="hx-logo"
                data-hx="head"
                src={heroBrand.logo.src}
                width={heroBrand.logo.width}
                height={heroBrand.logo.height}
                alt={heroBrand.name}
                decoding="async"
                fetchPriority="high"
              />
            </Link>

            <nav className="hx-nav" aria-label={heroMenu.label}>
              <ul>
                {heroNav.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="hx-nav-link" data-hx="head">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <HeroMenu items={heroNav} yourChogs={heroActions.yourChogs} launch={heroActions.launch} labels={heroMenu} />
          </header>
        </div>
      </div>

      <main id="main" className="hx-page-main" tabIndex={-1}>
        <div className="hx-root">
          <div className="hx-canvas">
            <div className="hx-main">
              <div className="hx-copy">
                <h1 className="hx-title">
                  {heroTitle.map((line, i) => (
                    <span key={line} className="hx-line">
                      <span className="hx-line-in" data-hx="line">
                        {line}
                      </span>
                      {/* Keeps the words apart in the heading's accessible name. */}
                      {i < heroTitle.length - 1 ? " " : null}
                    </span>
                  ))}
                </h1>

                <p className="hx-sub" data-hx="sub">
                  {heroSubline}
                </p>

                <div className="hx-ctas">
                  <span className="hx-cta-slot" data-hx="primary">
                    <RandomChog className="hx-btn hx-btn--primary">{heroActions.random}</RandomChog>
                  </span>
                  <Link href={heroActions.launch.href} className="hx-btn hx-btn--glass hx-glass" data-hx="cta">
                    {heroActions.launch.label}
                  </Link>
                </div>

                <dl className="hx-stats">
                  {stats.map((stat) => (
                    <div key={stat.key} className="hx-stat" data-hx="stat">
                      <dt className="hx-stat-label">
                        {stat.label}
                        {stat.noted && (
                          <>
                            <span aria-hidden="true">*</span>
                            <span className="hx-sr"> {heroStats.noteHint}</span>
                          </>
                        )}
                      </dt>
                      <dd className="hx-stat-value" aria-describedby={stat.noted && league ? "hx-note" : undefined}>
                        {stat.spoken ? (
                          <>
                            <span aria-hidden="true">{stat.value}</span>
                            <span className="hx-sr">{stat.spoken}</span>
                          </>
                        ) : (
                          stat.value
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
                {league && (
                  <p id="hx-note" className="hx-note" data-hx="note">
                    <span aria-hidden="true">*</span>
                    {heroFootnote(DEFAULT_WINDOW, windowLabel(league.from, league.to))}
                  </p>
                )}
              </div>

              <div className="hx-stage">
                {/* A deck of real Chogs (hero-deck.tsx); only the front card is a link (to its profile). */}
                <div className="hx-art" data-hx="art">
                  <HeroDeck chogs={deck} />
                </div>

                {heroCards.map((card) => {
                  const Icon = CARD_ICONS[card.key];
                  return (
                    <Link key={card.key} href={card.href} className={`hx-card hx-card--${card.key} hx-glass`} data-hx="card">
                      <span className="hx-card-head">
                        <span className="hx-icon-tile">
                          <Icon className="hx-icon" />
                        </span>
                        <span className="hx-kicker">{card.kicker}</span>
                      </span>
                      <span className="hx-card-title">
                        <span>{card.title[0]}</span> <span>{card.title[1]}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>

              <div className="hx-logos">
                <p id="hx-built-on" className="hx-logos-label" data-hx="logo">
                  {heroBuiltOn.label}
                </p>
                <ul className="hx-logos-list" aria-labelledby="hx-built-on">
                  {heroBuiltOn.marks.map((mark) => (
                    <li key={mark.key} className={`hx-mark hx-mark--${mark.key}`} data-hx="logo">
                      {mark.kind === "logo" ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a few-hundred-byte SVG: nothing to resize
                        <img
                          className="hx-mark-img"
                          src={mark.src}
                          alt={mark.name}
                          width={mark.width}
                          height={mark.height}
                          decoding="async"
                          draggable={false}
                        />
                      ) : (
                        mark.name
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <HeroEntranceScript />
        </div>
        {children}
      </main>
      {footer}
    </HeroMotion>
  );
}
