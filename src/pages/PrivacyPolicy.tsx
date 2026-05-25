import { MarkdownLegal } from '@/components/legal/MarkdownLegal';
import source from '../../docs/legal/privacy-policy.md?raw';

export default function PrivacyPolicy() {
  return (
    <MarkdownLegal
      source={source}
      pageTitle="Privacy Policy - Quantive"
      pageDescription="Read the Quantive privacy policy. We store only encrypted data, use no advertising trackers, and collect only what is necessary to run the service."
      path="/privacy"
    />
  );
}
