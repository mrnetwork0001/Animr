// "Ask this Chog": the contract between POST /api/chog/[tokenId]/ask and components/chog-chat. Client-safe.

/** Limits the UI mirrors (the server enforces them). */
export const ASK_LIMITS = {
  /** Longest question. */
  maxMessageChars: 280,
  /** Questions per conversation. */
  maxTurns: 4,
} as const;

/** 0G models the chat tries in order before its templates (lib/chog-chat/service.ts; the docs list them). */
export const CHAT_MODELS = ["0gm-1.0-35b-a3b", "glm-5.3"] as const;

/** POST body. No sessionId starts a new conversation. */
export type AskRequest = {
  sessionId?: string;
  message: string;
  /** The connected wallet, if any: the Chog greets its verified holder (checked on-chain, server-side). */
  viewer?: string;
};

export type AskResponse = {
  sessionId: string;
  reply: string;
  /** "0g": its AI on 0G Compute wrote it. "template": a quick answer from its stats (the AI is resting). */
  source: "0g" | "template";
  /** The 0G model, when source is "0g". */
  model: string | null;
  turnsLeft: number;
  done: boolean;
  /** The connected wallet holds this Chog (verified on-chain). */
  holder: boolean;
};
