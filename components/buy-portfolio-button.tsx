import { ExternalIcon } from "@/components/v2/icons";
import { pillClass } from "@/components/v2/primitives";
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
  /** "primary" is the violet pill (one per view); "secondary" the glass one. */
  variant?: "primary" | "secondary";
  caption?: string;
}) {
  const href = appConfig.chogNft ? marketplaceUrl(appConfig.chogNft, tokenId) : undefined;
  const pill = pillClass(variant === "primary" ? "primary" : "glass");

  return (
    <div className={className}>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={pill}>
          Buy this Portfolio
          <ExternalIcon className="v2-btn-icon" />
          <span className="v2-sr"> (opens the marketplace in a new tab)</span>
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
          <button type="button" disabled className={pillClass("glass")}>
            Buy this Portfolio
          </button>
        </span>
      )}
      {caption && <p className="v2-note mt-2.5 max-w-[34ch]">{caption}</p>}
    </div>
  );
}
