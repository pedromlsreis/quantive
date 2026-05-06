import { useRef, useState } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { FileSpreadsheet, Upload, X, Download, Plus, MoreHorizontal } from 'lucide-react';
import { format } from 'date-fns';
import { HowToUse } from './HowToUse';
import { AuthButton } from './AuthButton';
import { exportPortfolioExcel } from '@/lib/exporter';
import { AddMeasurementModal } from './AddMeasurementModal';
import { SyncIndicator } from './SyncIndicator';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function DashboardHeader() {
  const { data, clearData, loadFile, snapshots } = usePortfolio();
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);

  const lastUpdated = snapshots.length > 0
    ? format(snapshots[snapshots.length - 1].date, 'd MMM yyyy')
    : null;

  const handleExport = async () => {
    if (!data) return;
    const timestamp = format(new Date(), 'yyyy-MM-dd');
    await exportPortfolioExcel(data, `portfolio_${timestamp}.xlsx`);
  };

  return (
    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
      <a href="/" className="flex min-w-0 items-center gap-3 transition-opacity hover:opacity-80">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-foreground">Quantive</h1>
          {lastUpdated && (
            <p className="truncate text-[11px] text-muted-foreground/60">
              Data through {lastUpdated}
            </p>
          )}
        </div>
      </a>
      <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
        <SyncIndicator />

        <button
          onClick={() => setAddModalOpen(true)}
          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          title="Add a new measurement"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New</span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="More actions"
              title="More actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {data && (
              <>
                <DropdownMenuItem onSelect={handleExport}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onSelect={() => inputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Change file
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setConfirmOpen(true);
              }}
              className="text-destructive focus:text-destructive"
            >
              <X className="mr-2 h-4 w-4" />
              Clear data
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <HowToUse />
        <AuthButton />

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
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
