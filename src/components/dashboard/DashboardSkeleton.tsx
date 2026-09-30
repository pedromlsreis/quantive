import { useEffect, useState } from 'react';

/** Nothing shows for the first 300ms, so a fast decrypt never flashes a skeleton. */
function useDelayed(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), 300);
    return () => window.clearTimeout(t);
  }, []);
  return visible;
}

function Skel({ w, h }: { w?: number | string; h?: number }) {
  return <div className="q-skeleton" aria-hidden="true" style={{ display: 'block', width: w ?? '100%', height: h ?? 16 }} />;
}

/**
 * Static placeholders in the overview's final shapes. Nothing shows for the
 * first 300ms, so a fast decrypt never flashes a skeleton.
 */
export function DashboardSkeleton() {
  const visible = useDelayed();

  return (
    <div role="status" aria-label="Loading your overview" style={{ visibility: visible ? 'visible' : 'hidden' }}>
      <div className="q-page-head">
        <Skel w={140} h={28} />
        <div style={{ marginTop: 10 }}><Skel w={220} h={13} /></div>
      </div>
      <div className="q-hero">
        <div>
          <Skel w={72} h={13} />
          <div style={{ marginTop: 14 }}><Skel w={280} h={52} /></div>
          <div style={{ marginTop: 16 }}><Skel w={200} h={15} /></div>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {[0, 1, 2].map((i) => <Skel key={i} h={32} />)}
        </div>
      </div>
      <div className="q-sec">
        <Skel w={160} h={17} />
        <div style={{ marginTop: 20 }}><Skel h={280} /></div>
      </div>
    </div>
  );
}

/** Any other page while data decrypts: a title, a line and one block, not the overview's shape. */
export function PageSkeleton() {
  const visible = useDelayed();
  return (
    <div role="status" aria-label="Loading" style={{ visibility: visible ? 'visible' : 'hidden' }}>
      <div className="q-page-head">
        <Skel w={160} h={28} />
        <div style={{ marginTop: 10 }}><Skel w={320} h={14} /></div>
      </div>
      <Skel h={280} />
    </div>
  );
}
