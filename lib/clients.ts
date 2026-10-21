import { createPublicClient, http } from "viem";
import { appConfig } from "./config";

/** Read-only client for the configured Monad network (server or client side). */
export const publicClient = createPublicClient({
  chain: appConfig.chain,
  transport: http(appConfig.rpcUrl),
});
