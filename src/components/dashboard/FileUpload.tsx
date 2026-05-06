import { useCallback, useState } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { BarChart3, Download, Play, Plus, Upload } from 'lucide-react';
import { downloadExcelTemplate } from '@/lib/templateGenerator';
import { AuthButton } from './AuthButton';
import { WelcomeModal } from './WelcomeModal';
import { AddMeasurementModal } from './AddMeasurementModal';

export function FileUpload() {
  const { loadFile, loadMockData, isLoading } = usePortfolio();
  const [isDragging, setIsDragging] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      loadFile(file);
    }
  }, [loadFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  }, [loadFile]);

  return (
    <main className="flex flex-1 flex-col bg-background">
      <WelcomeModal />
      <AddMeasurementModal open={addOpen} onOpenChange={setAddOpen} />
      <div className="flex justify-end px-6 py-3">
        <AuthButton />
      </div>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="flex w-full max-w-[520px] flex-col items-center">
          {isLoading ? (
            <div className="flex flex-col items-center gap-4 py-14">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-muted-foreground">Processing file...</p>
            </div>
          ) : (
            <>
              {/* Hero */}
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <BarChart3 className="h-8 w-8 text-primary" />
              </div>
              <h1 className="mb-2 text-2xl font-bold text-foreground">Quantive</h1>
              <p className="mb-7 text-center text-sm text-muted-foreground">
                Track and analyse your net worth over time.
              </p>

              {/* Primary CTA */}
              <button
                onClick={() => setAddOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                Add your first measurement
              </button>

              {/* Divider */}
              <div className="my-5 flex w-full items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                <span>or import existing data</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* Excel drop zone (compact) */}
              <div
                className={`relative flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-all duration-200 ${
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40 hover:bg-card/50'
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <Upload className="mb-2 h-5 w-5 text-muted-foreground" />
                <p className="mb-3 text-center text-xs text-muted-foreground">
                  Drop an <code className="rounded bg-secondary px-1 py-0.5 text-xs text-primary">.xlsx</code> file here, or
                </p>
                <label className="cursor-pointer rounded-lg border border-border bg-card px-4 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary">
                  Browse files
                  <input
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls"
                    onChange={handleFileSelect}
                  />
                </label>
              </div>

              {/* Tertiary actions */}
              <div className="mt-3 flex w-full gap-2">
                <button
                  onClick={() => { void downloadExcelTemplate(); }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download template
                </button>
                <button
                  onClick={loadMockData}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Play className="h-3.5 w-3.5" />
                  Try demo
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
