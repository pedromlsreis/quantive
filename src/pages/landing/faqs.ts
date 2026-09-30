import { CURRENCY_CODES } from '@/lib/currencies';

// Built from the canonical list so marketing copy can't drift when a new
// currency is added.
const SUPPORTED_LIST = CURRENCY_CODES.join(', ');
const SUPPORTED_COUNT = CURRENCY_CODES.length;

/* FAQ data: single source of truth for the visible FAQ. The FAQPage JSON-LD
   in index.html and public/llms.txt mirror it; faqs.test.ts enforces the
   JSON-LD half. */
export const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What is Quantive?",
    a: "Quantive is a net worth tracker for people who keep their own records across brokers, banks, pensions, property, crypto or anything else they hold. Import your spreadsheet or type in balances, and Quantive shows your net worth, allocation and forecast in one place. It never connects to your bank, and your data is encrypted on your device before it reaches our servers.",
  },
  {
    q: "Is Quantive free to use?",
    a: "Yes. Core features, including CSV export of all your data, are free forever with no credit card required. Pro is €9/month or €90/year and adds full history, CAGR forecasting, goals, benchmarks, a PDF wealth report, and Excel export.",
  },
  {
    q: "How is Quantive different from a budgeting app?",
    a: "Budgeting apps connect to your bank to categorise transactions. Quantive does neither: it tracks net worth and wealth over time from balances you enter or import, with no bank links and end-to-end encryption, so your financial data stays private to you.",
  },
  {
    q: "Does Quantive connect to my bank?",
    a: "No. Quantive never connects to your bank accounts or requests login credentials. You enter balances manually from the dashboard, or import them from an existing spreadsheet.",
  },
  {
    q: "Can I import my existing spreadsheet?",
    a: "Yes. Spreadsheet import is included in the free plan. Upload your existing spreadsheet and your historical balance data is preserved in Quantive.",
  },
  {
    q: "Can I access my portfolio on my phone?",
    a: "Yes. Quantive is a web app and works in any mobile browser, so you can check your net worth on your phone. A native iOS and Android app is on the roadmap.",
  },
  {
    q: "How does Quantive protect my financial data?",
    a: "All data is encrypted on your device before it reaches Quantive's servers; the servers store only ciphertext, and only you hold the decryption key. The remaining trust is in the code we serve, as with any encrypted web app; the security page documents the full threat model.",
  },
  {
    q: "Can I self-host Quantive, or is it open source?",
    a: "The cryptography is open source (MIT) and the rest of the code is source-available, so you can read exactly how your data is encrypted before you trust it. Quantive itself is hosted rather than self-hostable: we run the servers so there's nothing to maintain, and because your data is encrypted in your browser first, those servers only ever hold ciphertext. If your priority is keeping data entirely on your own machine or running your own server, a local-first open-source desktop tracker will suit you better. What Quantive offers instead is zero setup, cross-device access from any browser, and a server that still can't read your finances.",
  },
  {
    q: "What currencies does Quantive support?",
    a: `Quantive supports ${SUPPORTED_COUNT} display currencies (${SUPPORTED_LIST}). You can hold assets in any of them and view your full portfolio in your preferred currency.`,
  },
  {
    q: "What's included in Quantive Pro?",
    a: "Pro adds your full history, forecasts at your own growth rate with a range drawn from how your history has varied, milestone and goal tracking, benchmark comparisons (S&P 500 and inflation; MSCI World is on the roadmap), a month-by-month summary table, a PDF report, and Excel export. Priority support is included.",
  },
  {
    q: "What if I lose access to my account?",
    a: "If you set one up, your 24-word recovery phrase (a BIP-39 mnemonic) lets you recover your encrypted data even if you forget your password. It is optional: Quantive offers it after your first sign-in, and you can create one at any time in Settings. Without it, a forgotten password means your encrypted data cannot be recovered.",
  },
];

