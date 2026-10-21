# Agent Instructions for Claude Code

You are tasked with building **Animr**, an application for the Chogathon 2026 hackathon.

## Core Directives
Animr relies on **ERC-6551 Token Bound Accounts**. The core premise is that a Chog NFT owns a smart contract wallet, and an AI agent trades the `$CHOG` tokens inside that wallet.

## Tech Stack to Scaffold
1. **Frontend:** Next.js (App Router), TailwindCSS, `viem`, and `wagmi`.
2. **Web3/Contracts:** Use the standard ERC-6551 Registry contract address for the chain we are deploying on. You do not need to write the registry from scratch, just interface with it.
3. **AI Backend:** Use `ai` (Vercel AI SDK) or `langchain`.

## Your First Tasks
1. Read `README.md` and `ARCHITECTURE.md` to understand the full user flow.
2. Initialize the Next.js project.
3. Create a utility file in `lib/erc6551.ts` using `viem` that can interact with the ERC-6551 Registry to compute the Token Bound Account address given a Chog NFT contract address and a Token ID.
4. Scaffold a basic dashboard UI that allows a user to input an NFT Token ID and view its computed wallet address and `$CHOG` balance.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
