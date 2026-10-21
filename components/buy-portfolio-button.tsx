import { appConfig } from "@/lib/config";
import { marketplaceUrl } from "@/lib/format";

/** Links to the Chog's marketplace listing: buying the NFT buys its AI portfolio. */
export function BuyPortfolioButton({
  tokenId,
  className = "",
  variant = "primary",
  caption = "The AI, its strategy and every token in its wallet transfer with the NFT.",
}: {
  tokenId: string;
  className?: string;
  variant?: "primary" | "secondary";
  caption?: string;
}) {
  const href = appConfig.chogNft ? marketplaceUrl(appConfig.chogNft, tokenId) : undefined;

  return (
    <div className={className}>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={`btn ${variant === "primary" ? "btn-primary" : "btn-secondary"} px-4 py-2.5`}>
          Buy this Portfolio <span aria-hidden>↗</span>
        </a>
      ) : (
        <span
          className="inline-flex cursor-not-allowed"
          title={
            appConfig.chogNft
              ? "Marketplace link not configured (NEXT_PUBLIC_MARKETPLACE_URL_TEMPLATE)."
              : "Chog NFT contract not configured (NEXT_PUBLIC_CHOG_NFT_ADDRESS)."
          }
        >
          <button type="button" disabled className="btn btn-secondary pointer-events-none px-4 py-2.5">
            Buy this Portfolio
          </button>
        </span>
      )}
      <p className="mt-2 text-xs text-muted">{caption}</p>
    </div>
  );
}
