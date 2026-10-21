import Link from "next/link";
import type { ReactNode } from "react";
import { preload } from "react-dom";
import { RandomChog } from "@/components/landing/random-chog-button";
import { leagueSnapshot, plainPct } from "@/components/landing/showcase";
import { DEFAULT_WINDOW } from "@/lib/dna/backtest";
import {
  heroActions,
  heroBrand,
  heroBuiltOn,
  heroCards,
  heroFootnote,
  heroMedia,
  heroMenu,
  heroNav,
  heroStats,
  heroSubline,
  heroTitle,
} from "./content";
import { heroDisplayFont, heroTextFont } from "./fonts";
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
 * one centred column on phones and tablets (hero.css). Server-rendered and static: the League share
 * and its window are replayed from committed candles when the page is built (components/landing/
 * showcase.ts), and the only client code is the entrance timeline + artwork loop (hero-motion.tsx),
 * the phone menu and Random Chog.
 *
 * Landmarks: the hero's header (brand, nav, menu) is the page's banner, outside <main>; it is laid over
 * the hero (.hx-header-frame repeats the canvas geometry), so the look is the canvas's. <main> holds the
 * hero's copy and artwork, then `children`; `footer` follows <main>.
 */
export function AnimrHero({ className = "", children, footer }: AnimrHeroProps) {
  const league = leagueSnapshot();
  const { passed, total } = heroStats.guard;
  const stats: Stat[] = [
    {
      key: "traders",
      value: (league?.total ?? 1969).toLocaleString("en-US"),
      label: heroStats.traders,
    },
    // Without a replay (candles unreadable) the share and its footnote are left out, never guessed.
    ...(league
      ? [
          {
            key: "beat",
            value: plainPct(league.beatHoldPct),
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

  // The still is the wide canvas's largest image (and the video's poster): fetch it early there. In the
  // column it sits below the fold, so it loads at normal priority.
  preload(heroMedia.still, {
    as: "image",
    fetchPriority: "high",
    media: WIDE_LAYOUT,
  });

  return (
    <HeroMotion className={`hx-page ${heroDisplayFont.variable} ${heroTextFont.variable} ${className}`}>
      <a href="#main" className="hx-skip">
        {heroBrand.skipLink}
      </a>
      <div className="hx-header-frame">
        <div className="hx-header-canvas">
          <header className="hx-header">
            <Link href="/" className="hx-brand" aria-label={heroBrand.homeLabel}>
              <span className="hx-tile" data-hx="head" data-hx-unit="70">
                {heroBrand.tile}
              </span>
              <span className="hx-wordmark" data-hx="head">
                {heroBrand.name}
                <span className="hx-ai">{heroBrand.superscript}</span>
              </span>
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

            <div className="hx-actions">
              <Link href={heroActions.yourChogs.href} className="hx-text-link" data-hx="head">
                {heroActions.yourChogs.label}
              </Link>
              <Link href={heroActions.launch.href} className="hx-pill hx-glass" data-hx="head">
                {heroActions.launch.label}
              </Link>
            </div>

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
                    {heroFootnote(DEFAULT_WINDOW, league.window)}
                  </p>
                )}
              </div>

              <div className="hx-stage">
                {/* Decorative: the slabs loop, with the still underneath for reduced motion and as fallback. */}
                <div className="hx-art" aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element -- also the video's poster: one URL, one download, no resize step */}
                  <img
                    className="hx-still"
                    src={heroMedia.still}
                    width={heroMedia.stillSize}
                    height={heroMedia.stillSize}
                    alt=""
                    decoding="async"
                  />
                  <video
                    className="hx-video"
                    data-hx-video=""
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                    poster={heroMedia.still}
                    disablePictureInPicture
                    tabIndex={-1}
                  >
                    <source src={heroMedia.video} type="video/mp4" media="(prefers-reduced-motion: no-preference)" />
                  </video>
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
                    <li key={mark.text} className={`hx-mark hx-mark--${mark.style}`} data-hx="logo">
                      {mark.text}
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
