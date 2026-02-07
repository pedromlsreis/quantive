import { useRef } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { FileSpreadsheet, Upload, X } from 'lucide-react';

export function DashboardHeader() {
  const { clearData, loadFile } = usePortfolio();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
        </div>
        <h1 className="text-lg font-bold text-foreground">Finance Cockpit</h1>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground transition-colors hover:bg-secondary/80"
        >
          <Upload className="h-4 w-4" />
          Change File
        </button>
        <button
          onClick={clearData}
          className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-destructive transition-colors hover:bg-secondary/80"
        >
          <X className="h-4 w-4" />
          Clear
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".xlsx,.xls"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) loadFile(file);
          }}
        />
      </div>
    </header>
  );
}
