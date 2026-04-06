import { useRef, useState } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { FileSpreadsheet, Upload, X, Download, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { HowToUse } from './HowToUse';
import { AuthButton } from './AuthButton';
import { CurrencySelector } from './CurrencySelector';
import { exportPortfolioExcel } from '@/lib/exporter';
import { AddMeasurementModal } from './AddMeasurementModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function DashboardHeader() {
  const { data, clearData, loadFile, snapshots } = usePortfolio();
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false); // Confirmation dialog for clear button
  const [addModalOpen, setAddModalOpen] = useState(false); // Add measurement modal

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
        <a href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
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
      </a>
      <div className="flex flex-wrap items-center gap-2">
        <AuthButton />
        <CurrencySelector />
        <HowToUse />
        
        <button
          onClick={() => setAddModalOpen(true)}
          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          title="Add a new measurement"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New</span>
        </button>
        
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
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger asChild>
            <button
              onClick={() => setConfirmOpen(true)}
              className="flex items-center justify-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-destructive transition-colors hover:bg-secondary/80"
            >
              <X className="h-4 w-4" />
              Clear
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all data?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete your portfolio data, including any cloud-synced
                snapshots. You can always re-upload your Excel file to start fresh.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  clearData();
                  setConfirmOpen(false);
                }}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Yes, clear everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
      <AddMeasurementModal open={addModalOpen} onOpenChange={setAddModalOpen} />
    </header>
  );
}
