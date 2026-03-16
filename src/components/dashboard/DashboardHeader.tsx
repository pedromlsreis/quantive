import { useRef } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { FileSpreadsheet, Upload, X, Download } from 'lucide-react';
import { format } from 'date-fns';
import { HowToUse } from './HowToUse';
import { AuthButton } from './AuthButton';
import { CurrencySelector } from './CurrencySelector';
import { exportPortfolioExcel } from '@/lib/exporter';

export function DashboardHeader() {
  const { data, clearData, loadFile, snapshots } = usePortfolio();
  const inputRef = useRef<HTMLInputElement>(null);

  const lastUpdated = snapshots.length > 0
    ? format(snapshots[snapshots.length - 1].date, 'd MMM yyyy')
    : null;

  const handleExport = () => {
    if (!data) return;
    const timestamp = format(new Date(), 'yyyy-MM-dd');
    exportPortfolioExcel(data, `portfolio_${timestamp}.xlsx`);
  };

  return (
    <header className="flex flex-col gap-3 border-b border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">Finance Cockpit</h1>
          {lastUpdated && (
            <p className="text-[11px] text-muted-foreground/60">
              Data through {lastUpdated}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <AuthButton />
        <CurrencySelector />
        <HowToUse />
        {data && (
          <button
            onClick={handleExport}
            className="flex items-center justify-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground transition-colors hover:bg-secondary/80"
            title="Export your data back to Excel"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
        )}
        <button
          onClick={() => inputRef.current?.click()}
          className="flex items-center justify-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground transition-colors hover:bg-secondary/80"
        >
          <Upload className="h-4 w-4" />
          <span className="hidden sm:inline">Change File</span>
          <span className="sm:hidden">File</span>
        </button>
        <button
          onClick={clearData}
          className="flex items-center justify-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-destructive transition-colors hover:bg-secondary/80"
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
