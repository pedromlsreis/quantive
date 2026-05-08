import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { BarChart3, Download, Play, Plus, Upload } from 'lucide-react';
import { AuthButton } from './AuthButton';
import { WelcomeModal } from './WelcomeModal';
import { AddMeasurementModal } from './AddMeasurementModal';
import { staggerContainer, staggerItem, fadeIn } from '@/lib/motion';

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
    <main className="flex flex-1 flex-col bg-background min-h-screen">
      <WelcomeModal />
      <AddMeasurementModal open={addOpen} onOpenChange={setAddOpen} />
      <div className="flex justify-end px-6 py-3">
        <AuthButton />
      </div>

      <div className="flex flex-1 items-center justify-center p-8">
        {isLoading ? (
          <LoadingState />
        ) : (
          <motion.div
            className="flex w-full max-w-[480px] flex-col items-center"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <motion.div
              variants={staggerItem}
              className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20"
            >
              <BarChart3 className="h-8 w-8 text-primary" />
            </motion.div>

            <motion.h1 variants={staggerItem} className="mb-2 text-2xl font-bold text-foreground">
              Quantive
            </motion.h1>
            <motion.p variants={staggerItem} className="mb-8 text-center text-sm text-muted-foreground leading-relaxed">
              Track and analyse your net worth over time.
            </motion.p>

            <motion.button
              variants={staggerItem}
              onClick={() => setAddOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
            >
              <Plus className="h-4 w-4" />
              Add your first measurement
            </motion.button>

            <motion.div variants={staggerItem} className="my-5 flex w-full items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground/60">or import existing data</span>
              <div className="h-px flex-1 bg-border" />
            </motion.div>

            <motion.div
              variants={staggerItem}
              className={`relative flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed p-7 transition-all duration-200 ${
                isDragging
                  ? 'border-primary bg-primary/5 scale-[1.01]'
                  : 'border-border hover:border-primary/30 hover:bg-card/40'
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <Upload className="mb-2.5 h-5 w-5 text-muted-foreground/70" />
              <p className="mb-3.5 text-center text-xs text-muted-foreground leading-relaxed">
                Drop an{' '}
                <code className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-primary">.xlsx</code>
                {' '}file here, or
              </p>
              <label className="cursor-pointer rounded-lg border border-border bg-card px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary hover:border-primary/20 focus-within:ring-2 focus-within:ring-primary/30">
                Browse files
                <input
                  type="file"
                  className="sr-only"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                />
              </label>
            </motion.div>

            <motion.div variants={staggerItem} className="mt-3 flex w-full gap-2">
              <button
                onClick={async () => {
                  const { downloadExcelTemplate } = await import('@/lib/templateGenerator');
                  await downloadExcelTemplate();
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Download className="h-3.5 w-3.5" />
                Download template
              </button>
              <button
                onClick={loadMockData}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Play className="h-3.5 w-3.5" />
                Try demo
              </button>
            </motion.div>
          </motion.div>
        )}
      </div>
    </main>
  );
}

function LoadingState() {
  return (
    <motion.div
      className="flex flex-col items-center gap-4 py-14"
      variants={fadeIn}
      initial="hidden"
      animate="visible"
    >
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-primary" />
      </div>
      <p className="text-sm text-muted-foreground">Processing file…</p>
    </motion.div>
  );
}
