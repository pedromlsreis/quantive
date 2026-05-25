import { MarkdownLegal } from '@/components/legal/MarkdownLegal';
import source from '../../docs/legal/impressum.md?raw';

export default function Impressum() {
  return (
    <MarkdownLegal
      source={source}
      pageTitle="Impressum - Quantive"
      pageDescription="Legal notice (Impressum) for Quantive, operated by Pedro Reis in Düsseldorf, Germany."
      path="/impressum"
    />
  );
}
