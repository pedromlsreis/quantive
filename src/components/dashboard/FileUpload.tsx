import { useCallback, useState } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { FileSpreadsheet, Download, Play } from 'lucide-react';
import { downloadExcelTemplate } from '@/lib/templateGenerator';

export function FileUpload() {
  const { loadFile, loadMockData, isLoading } = usePortfolio();
  const [isDragging, setIsDragging] = useState(false);

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
    <main className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="flex w-full max-w-[520px] flex-col items-center">
        {/* Drop zone */}
        <div
          className={`relative flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed p-14 transition-all duration-300 ${
            isDragging
              ? 'border-primary bg-primary/5 scale-[1.02]'
              : 'border-border hover:border-primary/50 hover:bg-card/50'
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          {isLoading ? (
            <div className="flex flex-col items-center gap-4">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-muted-foreground">Processing file...</p>
            </div>
          ) : (
            <>
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <FileSpreadsheet className="h-8 w-8 text-primary" />
              </div>
              <h2 className="mb-1 text-xl font-bold text-foreground">Finance Cockpit</h2>
              <p className="mb-5 text-sm text-muted-foreground">
                Drop your <code className="rounded bg-secondary px-1.5 py-0.5 text-xs text-primary">.xlsx</code> file here
              </p>
              <label className="cursor-pointer rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                Browse Files
                <input
                  type="file"
                  className="hidden"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                />
              </label>
            </>
          )}
        </div>

        {/* Secondary actions */}
        {!isLoading && (
          <div className="mt-4 flex w-full gap-3">
            <button
              onClick={downloadExcelTemplate}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Download className="h-4 w-4" />
              Download Template
            </button>
            <button
              onClick={loadMockData}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Play className="h-4 w-4" />
              Try Demo
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
