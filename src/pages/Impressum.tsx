import { MarkdownLegal } from '@/components/legal/MarkdownLegal';
import { getRouteMeta } from '@/lib/seo/routeMeta';
import source from '../../docs/legal/impressum.md?raw';

export default function Impressum() {
  const meta = getRouteMeta('/impressum');
  return (
    <MarkdownLegal
      source={source}
      pageTitle={meta.title}
      pageDescription={meta.description}
      path={meta.path}
    />
  );
}
