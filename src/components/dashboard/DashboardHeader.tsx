import { useRef, useState } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Upload, X, Download, Plus, MoreHorizontal, Eye, EyeOff } from 'lucide-react';
import { Wordmark } from '@/components/layout/Brand';
import { format } from 'date-fns';
import { HowToUse } from './HowToUse';
import { AuthButton } from './AuthButton';
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
  const { privacyMode, setPrivacyMode } = usePreferences();
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);

  const lastUpdated = snapshots.length > 0
    ? format(snapshots[snapshots.length - 1].date, 'd MMM yyyy')
    : null;

  const handleExportExcel = async () => {
    if (!data) return;
    // exceljs is large; only load it when the user actually exports.
    const { exportPortfolioExcel } = await import('@/lib/exporter');
    const timestamp = format(new Date(), 'yyyy-MM-dd');
    await exportPortfolioExcel(data, `portfolio_${timestamp}.xlsx`);
  };

  const handleExportCsv = async () => {
    if (!data) return;
    const { exportPortfolioCsv } = await import('@/lib/exporter');
    const timestamp = format(new Date(), 'yyyy-MM-dd');
    exportPortfolioCsv(data, `portfolio_${timestamp}.csv`);
  };

  return (
    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
      <a
        href="/"
        aria-label="Quantive home"
        className="flex min-w-0 items-center transition-opacity hover:opacity-80"
      >
        <div className="min-w-0">
          <Wordmark size={22} />
          {lastUpdated && (
            <p className="truncate text-[11px] text-muted-foreground/60" style={{ marginTop: 2, marginLeft: 30 }}>
              Data through {lastUpdated}
            </p>
          )}
        </div>
      </a>
      <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
        <SyncIndicator />

        <button
          type="button"
          onClick={() => setPrivacyMode(!privacyMode)}
          className="q-icon-btn"
          aria-label={privacyMode ? 'Show monetary values' : 'Hide monetary values'}
          aria-pressed={privacyMode}
          title={privacyMode ? 'Show values' : 'Hide values'}
        >
          {privacyMode ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>

        <button
          onClick={() => setAddModalOpen(true)}
          className="q-btn q-btn--primary q-btn--md"
          aria-label="Add a new measurement"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New</span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="q-icon-btn"
              aria-label="More actions"
              title="More actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {data && (
              <>
                <DropdownMenuItem onSelect={handleExportExcel}>
                  <Download className="mr-2 h-4 w-4" />
                  Export to Excel
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleExportCsv}>
                  <Download className="mr-2 h-4 w-4" />
                  Export to CSV
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
                snapshots. You can always re-upload your spreadsheet to start fresh.
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
