import { MarkdownLegal } from '@/components/legal/MarkdownLegal';
import { getRouteMeta } from '@/lib/seo/routeMeta';
import source from '../../docs/legal/privacy-policy.md?raw';

export default function PrivacyPolicy() {
  const meta = getRouteMeta('/privacy');
  return (
    <MarkdownLegal
      source={source}
      pageTitle={meta.title}
      pageDescription={meta.description}
      path={meta.path}
    />
  );
}
