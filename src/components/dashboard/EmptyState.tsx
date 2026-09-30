import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useAuth } from '@/contexts/AuthContext';
import { analytics } from '@/lib/analytics';
import { openComposer } from '@/lib/appEvents';


/**
 * Accepts an .xlsx dropped anywhere on the page while an empty state is
 * mounted. Returns whether a file is being dragged over the window.
 */
function useWindowDrop(onFile: (file: File) => void): boolean {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => { if (hasFiles(e)) { depth++; setDragging(true); } };
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) onFile(file);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [onFile]);
  return dragging;
}

function useImport() {
  const { loadFile } = usePortfolio();
  return useCallback((file: File) => {
    if (/\.xlsx?$/i.test(file.name)) {
      loadFile(file);
      return;
    }
    // A silent rejection was an invisible activation cliff: say what works.
    toast.error("That file type isn't supported. Use an .xlsx file, or download the template.");
    analytics.fileUploadFailed({ reason: 'wrong_type' });
  }, [loadFile]);
}

function TryDemo() {
  const { loadMockData } = usePortfolio();
  return (
    <button
      type="button"
      className="q-btn q-btn--ghost q-btn--lg"
      onClick={() => {
        loadMockData();
        analytics.demoLoaded({ source: 'in_app_button' });
      }}
    >
      Try demo
    </button>
  );
}

/** Overview only: every way to get a first entry in. */
function Actions() {
  const importFile = useImport();
  return (
    <div className="q-empty-actions">
      <button type="button" className="q-btn q-btn--primary q-btn--lg" onClick={openComposer}>
        Add your first entry
      </button>
      <label className="q-btn q-btn--secondary q-btn--lg q-file-btn">
        Import a spreadsheet
        <input
          type="file"
          className="sr-only"
          accept=".xlsx,.xls"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importFile(file);
            e.target.value = '';
          }}
        />
      </label>
      <TryDemo />
      <button
        type="button"
        className="q-link-btn"
        style={{ fontSize: 13 }}
        onClick={async () => {
          const { downloadExcelTemplate } = await import('@/lib/templateGenerator');
          await downloadExcelTemplate();
        }}
      >
        Download the template
      </button>
    </div>
  );
}

function Shell({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="q-empty">
      <h1 className="q-h1" tabIndex={-1}>{title}</h1>
      {children}
      {footer}
    </div>
  );
}

/** The overview before the first entry: the dashboard at rest, with no numbers yet. */
export function DashboardEmpty() {
  const { user } = useAuth();
  const { isLoading } = usePortfolio();
  const importFile = useImport();
  const dragging = useWindowDrop(importFile);
  // Anchors the activation funnel: the overview is where a new user lands.
  // Not in Shell, so empty /forecast, /sources etc. don't re-fire it.
  useEffect(() => {
    analytics.onboardingEmptyStateViewed();
  }, []);
  return (
    <div className={dragging ? 'q-dropzone-active' : undefined}>
    <Shell
      title="Overview"
      footer={
        <p className="q-empty-close">
          {user
            ? 'Your entries are encrypted on this device before they sync.'
            : "Entries stay in this browser until you sign in. After that, they're encrypted on this device before they sync."}
        </p>
      }
    >
      <p className="q-page-lede">
        Enter what each account, pension and property is worth today. Quantive totals them in your currency and keeps the history, so next month you only change what moved.
      </p>
      {isLoading ? (
        <p className="q-body" role="status" style={{ marginTop: 'var(--s-6)' }}>Reading your spreadsheet…</p>
      ) : (
        <>
          <Actions />
          <p className="q-meta q-drop-hint" style={{ marginTop: 'var(--s-3)' }}>
            {dragging ? 'Drop the file to import it.' : 'Or drop an .xlsx file anywhere on this page.'}
          </p>
        </>
      )}
    </Shell>
    </div>
  );
}

/** Any other page before the first entry: its name, what it will show, the same first step. */
export function RouteEmpty({ title, sentence }: { title: string; sentence: string }) {
  return (
    <Shell title={title}>
      <p className="q-page-lede">{sentence}</p>
      <div className="q-empty-actions">
        <button type="button" className="q-btn q-btn--primary q-btn--lg" onClick={openComposer}>
          Add your first entry
        </button>
        <TryDemo />
      </div>
    </Shell>
  );
}
