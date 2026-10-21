import Link from "next/link";
import { brand, footer } from "./content";
import { LandingLogo } from "./logo";
import { AnyLink, Container } from "./primitives";

export function LandingFooter() {
  return (
    <footer className="border-t border-line/70 bg-background/60">
      <Container className="grid gap-10 py-12 sm:py-14 md:grid-cols-[1.3fr_1fr]">
        <div>
          <Link href="/" aria-label={brand.homeLabel} className="inline-flex items-center gap-2.5 rounded-lg">
            <LandingLogo id="footer" className="size-7" />
            <span className="font-semibold tracking-tight">{brand.name}</span>
          </Link>
          <p className="mt-3 max-w-sm text-sm text-muted">{footer.blurb}</p>
          <p className="mt-6 text-sm font-medium text-foreground">{footer.disclaimer}</p>
          <ul className="mt-2 max-w-md space-y-1 text-xs text-subtle">
            {footer.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
        <nav aria-label={footer.navLabel} className="grid grid-cols-2 gap-8 md:justify-self-end">
          {footer.columns.map((column) => (
            <div key={column.title}>
              <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">{column.title}</p>
              <ul className="mt-3 space-y-2.5 text-sm">
                {column.links.map((item) => (
                  <li key={item.href}>
                    <AnyLink href={item.href} className="text-muted transition-colors hover:text-foreground">
                      {item.label}
                    </AnyLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </Container>
    </footer>
  );
}
