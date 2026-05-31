/**
 * Bundled bank-logo library shown on the cashflow-accounts cards and offered in
 * the Account dialog's logo picker (alongside a custom-image upload).
 *
 * Assets live under `packages/webapp/public/bank-logos/<slug>.svg` and are served
 * from the site root at `/bank-logos/<slug>.svg`. To add a bank, drop an SVG (or
 * PNG) at that path and add one entry below — the `slug` is what gets persisted
 * on the account (`bank_account_logo_slug`).
 *
 * The shipped assets are monochrome marks (single opaque path, `fill="currentColor"`).
 * They're rendered full-brand-color via a CSS mask (the SVG is the mask, `color`
 * is the paint), so each entry carries its official brand `color`. Multi-color
 * logos aren't supported by this approach — one color per mark.
 */
export interface BankLogoLibraryItem {
  /** Stable id persisted on the account. */
  slug: string;
  /** Human-readable label shown in the picker. */
  label: string;
  /** Public URL of the logo asset. */
  src: string;
  /** Official brand color used to paint the masked monochrome mark. */
  color: string;
}

export const BANK_LOGO_LIBRARY: BankLogoLibraryItem[] = [
  {
    slug: 'generic-bank',
    label: 'Generic Bank',
    src: '/bank-logos/generic-bank.svg',
    color: '#5f6b7c',
  },
  {
    slug: 'chase',
    label: 'Chase',
    src: '/bank-logos/chase.svg',
    color: '#117aca',
  },
  {
    slug: 'bank-of-america',
    label: 'Bank of America',
    src: '/bank-logos/bank-of-america.svg',
    color: '#e31837',
  },
  {
    slug: 'wells-fargo',
    label: 'Wells Fargo',
    src: '/bank-logos/wells-fargo.svg',
    color: '#d71e28',
  },
  {
    slug: 'citibank',
    label: 'Citibank',
    src: '/bank-logos/citibank.svg',
    color: '#003b7e',
  },
  {
    slug: 'capital-one',
    label: 'Capital One',
    src: '/bank-logos/capital-one.svg',
    color: '#004977',
  },
  {
    slug: 'us-bank',
    label: 'U.S. Bank',
    src: '/bank-logos/us-bank.svg',
    color: '#0c2074',
  },
  { slug: 'pnc', label: 'PNC', src: '/bank-logos/pnc.svg', color: '#f58025' },
  {
    slug: 'td-bank',
    label: 'TD Bank',
    src: '/bank-logos/td-bank.svg',
    color: '#008a00',
  },
  {
    slug: 'truist',
    label: 'Truist',
    src: '/bank-logos/truist.svg',
    color: '#3e1c72',
  },
  {
    slug: 'ally',
    label: 'Ally',
    src: '/bank-logos/ally.svg',
    color: '#6f1d77',
  },
  {
    slug: 'american-express',
    label: 'American Express',
    src: '/bank-logos/american-express.svg',
    color: '#006fcf',
  },
  {
    slug: 'regions',
    label: 'Regions',
    src: '/bank-logos/regions.svg',
    color: '#00833e',
  },
  {
    slug: 'fifth-third',
    label: 'Fifth Third Bank',
    src: '/bank-logos/fifth-third.svg',
    color: '#0033a0',
  },
  {
    slug: 'citizens',
    label: 'Citizens Bank',
    src: '/bank-logos/citizens.svg',
    color: '#008555',
  },
  {
    slug: 'key-bank',
    label: 'KeyBank',
    src: '/bank-logos/key-bank.svg',
    color: '#d7000f',
  },
  {
    slug: 'huntington',
    label: 'Huntington Bank',
    src: '/bank-logos/huntington.svg',
    color: '#00754a',
  },
  {
    slug: 'discover',
    label: 'Discover',
    src: '/bank-logos/discover.svg',
    color: '#ff6000',
  },
  {
    slug: 'mercury',
    label: 'Mercury',
    src: '/bank-logos/mercury.svg',
    color: '#5265ff',
  },
  {
    slug: 'square',
    label: 'Square',
    src: '/bank-logos/square.svg',
    color: '#000000',
  },
  {
    slug: 'stripe',
    label: 'Stripe',
    src: '/bank-logos/stripe.svg',
    color: '#635bff',
  },
  {
    slug: 'apple-card',
    label: 'Apple Card',
    src: '/bank-logos/apple-card.svg',
    color: '#000000',
  },
  {
    slug: 'amazon',
    label: 'Amazon',
    src: '/bank-logos/amazon.svg',
    color: '#ff9900',
  },
  {
    slug: 'synchrony',
    label: 'Synchrony Bank',
    src: '/bank-logos/synchrony.svg',
    color: '#d52b1e',
  },
  {
    slug: 'sams-club',
    label: "Sam's Club",
    src: '/bank-logos/sams-club.svg',
    color: '#0067a0',
  },
  {
    slug: 'mastercard',
    label: 'Mastercard',
    src: '/bank-logos/mastercard.svg',
    color: '#eb001b',
  },
  {
    slug: 'visa',
    label: 'Visa',
    src: '/bank-logos/visa.svg',
    color: '#1a1f71',
  },
];

const BANK_LOGO_BY_SLUG: Record<string, BankLogoLibraryItem> =
  BANK_LOGO_LIBRARY.reduce(
    (acc, item) => {
      acc[item.slug] = item;
      return acc;
    },
    {} as Record<string, BankLogoLibraryItem>,
  );

export interface ResolvedBankLogo {
  /** `library` = bundled monochrome mark (mask + brand color); `custom` = uploaded image. */
  kind: 'library' | 'custom';
  /** Image/asset URL. */
  src: string;
  /** Brand color for masked library marks; undefined for custom uploads. */
  color?: string;
}

/**
 * Resolves an account's logo, preferring a bundled library mark (by slug) and
 * falling back to a custom uploaded image URI. Returns null when no logo is set.
 */
export function resolveBankAccountLogo(
  slug?: string | null,
  uploadedUri?: string | null,
): ResolvedBankLogo | null {
  if (slug && BANK_LOGO_BY_SLUG[slug]) {
    const item = BANK_LOGO_BY_SLUG[slug];
    return { kind: 'library', src: item.src, color: item.color };
  }
  if (uploadedUri) {
    return { kind: 'custom', src: uploadedUri };
  }
  return null;
}
