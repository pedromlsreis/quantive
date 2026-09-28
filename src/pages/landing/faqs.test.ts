import { describe, expect, it } from 'vitest';
import indexHtml from '../../../index.html?raw';
import { FAQS } from './faqs';

interface LdQuestion {
  '@type': string;
  name: string;
  acceptedAnswer: { text: string };
}

function jsonLdFaq(html: string): Array<{ q: string; a: string }> {
  const nodes = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]))
    .flatMap((block) => block['@graph'] ?? [block]);
  const faqPage = nodes.find((node) => node['@type'] === 'FAQPage');
  if (!faqPage) throw new Error('index.html has no FAQPage JSON-LD');
  return (faqPage.mainEntity as LdQuestion[]).map((q) => ({ q: q.name, a: q.acceptedAnswer.text }));
}

// Structured data must match the visible FAQ. The FAQS answers are template
// strings (e.g. the currency list comes from CURRENCY_CODES), so adding a
// currency fails this test until index.html's FAQPage block is updated too.
describe('FAQPage JSON-LD in index.html', () => {
  it('mirrors the visible FAQ: same questions, order and answer text', () => {
    expect(jsonLdFaq(indexHtml)).toEqual(FAQS);
  });
});
