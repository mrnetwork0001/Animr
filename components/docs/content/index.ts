import type { DocContent } from "../frame";
import { howItWorks, judgeQuickStart, welcome } from "./getting-started";
import { chogWallet, claimItsAi, tradeGuard, trophies } from "./own";
import { askThisChog, breed, dailyBell, league, robThisChog, timeMachine, tradingDna, versus } from "./play";
import { architecture, contractsAndApi, selfHosting } from "./tech";
import { trust } from "./trust";

/** Every doc page's content by slug ("" is /docs). Slugs and titles live in ../registry.ts. */
export const DOC_CONTENT: Record<string, DocContent> = {
  "": welcome,
  "how-it-works": howItWorks,
  "judge-quick-start": judgeQuickStart,
  league,
  "trading-dna": tradingDna,
  "time-machine": timeMachine,
  versus,
  breed,
  "daily-bell": dailyBell,
  "rob-this-chog": robThisChog,
  "ask-this-chog": askThisChog,
  "chog-wallet": chogWallet,
  "claim-its-ai": claimItsAi,
  "trade-guard": tradeGuard,
  trophies,
  architecture,
  "contracts-and-api": contractsAndApi,
  "self-hosting": selfHosting,
  trust,
};
