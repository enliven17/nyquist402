export const docGroups = [
  { title: 'Overview', pages: [
    { slug: '', title: 'Introduction' },
    { slug: 'architecture', title: 'System architecture' },
    { slug: 'roadmap', title: 'Service roadmap' },
  ] },
  { title: 'Payment protocol', pages: [
    { slug: 'protected/lifecycle', title: 'Payment lifecycle' },
    { slug: 'protected/fees', title: 'Funding & fee reserves' },
    { slug: 'protected/quotes', title: 'Quotes & arbiter selection' },
    { slug: 'protected/arbitration', title: 'Disputes & rulings' },
  ] },
  { title: 'Role workflows', pages: [
    { slug: 'protected/buyer', title: 'Buyers & agents' },
    { slug: 'protected/seller', title: 'Sellers' },
    { slug: 'protected/arbiter', title: 'Arbiters' },
  ] },
  { title: 'Integration', pages: [
    { slug: 'integration', title: 'x402 payment negotiation' },
    { slug: 'sdk', title: 'SDK integration' },
    { slug: 'signing', title: 'Signing & authorization' },
  ] },
  { title: 'Services & operations', pages: [
    { slug: 'services/facilitator', title: 'Facilitator & execution' },
    { slug: 'services/evidence', title: 'Evidence delivery & access' },
    { slug: 'protected/recovery', title: 'History & recovery' },
    { slug: 'services/operators', title: 'Service operations' },
  ] },
  { title: 'Reference', pages: [
    { slug: 'reference/terms', title: 'Terms & compatibility' },
    { slug: 'reference/contract', title: 'Contract operations' },
    { slug: 'reference/security', title: 'Security model' },
  ] },
  { title: 'Testnet & examples', pages: [
    { slug: 'quickstart', title: 'Demo walkthrough' },
    { slug: 'setup', title: 'Testnet setup' },
    { slug: 'testnet/sdk', title: 'TypeScript client reference' },
    { slug: 'testnet/signing', title: 'Transaction signing example' },
  ] },
  { title: 'Basic auth-capture', pages: [
    { slug: 'basic', title: 'Basic reference' },
    { slug: 'basic/integration', title: 'x402 integration' },
    { slug: 'basic/contract', title: 'Contract reference' },
  ] },
] as const;

export const docPages = docGroups.flatMap(group => group.pages.map(page => ({ ...page, group: group.title, url: page.slug ? `/docs/${page.slug}` : '/docs' })));
export type SearchEntry = { url: string; title: string; group: string; text: string };
