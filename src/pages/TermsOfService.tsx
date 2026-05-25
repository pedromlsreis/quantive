import { MarkdownLegal } from '@/components/legal/MarkdownLegal';
import source from '../../docs/legal/terms-of-service.md?raw';

export default function TermsOfService() {
  return (
    <MarkdownLegal
      source={source}
      pageTitle="Terms of Service - Quantive"
      pageDescription="Terms of Service for Quantive. Review our usage policies, acceptable use guidelines, and your rights as a user."
      path="/terms"
    />
  );
}
