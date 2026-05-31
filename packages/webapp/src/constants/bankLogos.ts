/**
 * Bundled bank-logo library shown on the cashflow-accounts cards and offered in
 * the Account dialog's logo picker (alongside a custom-image upload).
 *
 * Assets live under `packages/webapp/public/bank-logos/<slug>.svg` and are served
 * from the site root at `/bank-logos/<slug>.svg`. To add a bank, drop an SVG (or
 * PNG) at that path and add one entry below — the `slug` is what gets persisted
 * on the account (`bank_account_logo_slug`).
 *
 * NOTE: the shipped assets are generic placeholders. Replace the file at the same
 * path with the real brand mark when you have the rights to use it.
 */
export interface BankLogoLibraryItem {
  /** Stable id persisted on the account. */
  slug: string;
  /** Human-readable label shown in the picker. */
  label: string;
  /** Public URL of the logo asset. */
  src: string;
}

export const BANK_LOGO_LIBRARY: BankLogoLibraryItem[] = [
  {
    slug: 'generic-bank',
    label: 'Generic Bank',
    src: '/bank-logos/generic-bank.svg',
  },
  { slug: 'chase', label: 'Chase', src: '/bank-logos/chase.svg' },
  {
    slug: 'bank-of-america',
    label: 'Bank of America',
    src: '/bank-logos/bank-of-america.svg',
  },
  {
    slug: 'wells-fargo',
    label: 'Wells Fargo',
    src: '/bank-logos/wells-fargo.svg',
  },
  { slug: 'citibank', label: 'Citibank', src: '/bank-logos/citibank.svg' },
  {
    slug: 'capital-one',
    label: 'Capital One',
    src: '/bank-logos/capital-one.svg',
  },
  { slug: 'us-bank', label: 'U.S. Bank', src: '/bank-logos/us-bank.svg' },
  { slug: 'pnc', label: 'PNC', src: '/bank-logos/pnc.svg' },
  { slug: 'td-bank', label: 'TD Bank', src: '/bank-logos/td-bank.svg' },
  { slug: 'truist', label: 'Truist', src: '/bank-logos/truist.svg' },
  { slug: 'ally', label: 'Ally', src: '/bank-logos/ally.svg' },
  {
    slug: 'american-express',
    label: 'American Express',
    src: '/bank-logos/american-express.svg',
  },
  { slug: 'regions', label: 'Regions', src: '/bank-logos/regions.svg' },
  {
    slug: 'fifth-third',
    label: 'Fifth Third Bank',
    src: '/bank-logos/fifth-third.svg',
  },
  { slug: 'citizens', label: 'Citizens Bank', src: '/bank-logos/citizens.svg' },
  { slug: 'key-bank', label: 'KeyBank', src: '/bank-logos/key-bank.svg' },
  {
    slug: 'huntington',
    label: 'Huntington Bank',
    src: '/bank-logos/huntington.svg',
  },
  { slug: 'discover', label: 'Discover', src: '/bank-logos/discover.svg' },
];

const BANK_LOGO_BY_SLUG: Record<string, BankLogoLibraryItem> =
  BANK_LOGO_LIBRARY.reduce(
    (acc, item) => {
      acc[item.slug] = item;
      return acc;
    },
    {} as Record<string, BankLogoLibraryItem>,
  );

/**
 * Resolves the displayable logo image URL for an account, preferring a bundled
 * library logo (by slug) and falling back to a custom uploaded image URI.
 * Returns an empty string when the account has no logo.
 */
export function resolveBankAccountLogoSrc(
  slug?: string | null,
  uploadedUri?: string | null,
): string {
  if (slug && BANK_LOGO_BY_SLUG[slug]) {
    return BANK_LOGO_BY_SLUG[slug].src;
  }
  return uploadedUri || '';
}
