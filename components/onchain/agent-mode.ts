import { type Address, type Hex, getAddress } from "viem";
import { type AgentDetailResponse, type AgentMode, type ModeSwitchRequest, modeSwitchMessage } from "@/lib/agent/types";
import { apiErrorText } from "./queries";
import { ApiError } from "./tx-errors";

/**
 * POST /api/agents/[tokenId]/mode (lib/agent/types.ts contract): the holder signs modeSwitchMessage and the server
 * switches the agent between paper and on-chain execution. "onchain" is refused (409/503) until the guard setup is
 * "ready". Built at click time so the server's freshness check passes.
 */
export async function requestAgentMode(params: {
  tokenId: number;
  account: Address;
  owner: Address;
  mode: AgentMode;
  signMessage: (message: string) => Promise<Hex>;
}): Promise<AgentDetailResponse> {
  const owner = getAddress(params.owner);
  const message = modeSwitchMessage({
    tokenId: String(params.tokenId),
    mode: params.mode,
    account: getAddress(params.account),
    owner,
    issuedAt: new Date().toISOString(),
  });
  const signature = await params.signMessage(message);
  const body: ModeSwitchRequest = { mode: params.mode, owner, message, signature };
  const res = await fetch(`/api/agents/${params.tokenId}/mode`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(apiErrorText(data, res.status), res.status);
  if (!data || typeof data !== "object" || !("agent" in data)) {
    throw new Error("Unexpected response from the mode API.");
  }
  return data as AgentDetailResponse;
}
