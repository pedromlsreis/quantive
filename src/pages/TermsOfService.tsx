import { MarkdownLegal } from '@/components/legal/MarkdownLegal';
import { getRouteMeta } from '@/lib/seo/routeMeta';
import source from '../../docs/legal/terms-of-service.md?raw';

export default function TermsOfService() {
  const meta = getRouteMeta('/terms');
  return (
    <MarkdownLegal
      source={source}
      pageTitle={meta.title}
      pageDescription={meta.description}
      path={meta.path}
    />
  );
}
