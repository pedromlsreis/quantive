import { useCallback, useState } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { FileSpreadsheet } from 'lucide-react';

export function FileUpload() {
  const { loadFile, isLoading } = usePortfolio();
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
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <div
        className={`relative flex w-full max-w-[600px] flex-col items-center justify-center rounded-2xl border-2 border-dashed p-16 transition-all duration-300 ${
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
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
              <FileSpreadsheet className="h-10 w-10 text-primary" />
            </div>
            <h2 className="mb-2 text-2xl font-bold text-foreground">Upload Portfolio Data</h2>
            <p className="mb-6 text-center text-muted-foreground">
              Drop your <code className="rounded bg-secondary px-1.5 py-0.5 text-sm text-primary">portfolio.xlsx</code> file here
            </p>
            <label className="cursor-pointer rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              Browse Files
              <input
                type="file"
                className="hidden"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
              />
            </label>
            <p className="mt-4 text-xs text-muted-foreground">
              Supports .xlsx and .xls files
            </p>
          </>
        )}
      </div>
    </div>
  );
}
