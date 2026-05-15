import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { Download, Play, Plus, Upload } from 'lucide-react';
import { WelcomeModal } from './WelcomeModal';
import { AddMeasurementModal } from './AddMeasurementModal';
import { Monogram } from '@/components/layout/Brand';
import { staggerContainer, staggerItem, fadeIn } from '@/lib/motion';
import { analytics } from '@/lib/analytics';

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
    <main
      className="flex flex-1 flex-col bg-background"
      style={{ minHeight: 'calc(100dvh - var(--q-topbar-h) - var(--q-tabbar-h))' }}
    >
      <WelcomeModal />
      <AddMeasurementModal open={addOpen} onOpenChange={setAddOpen} />

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
              className="mb-6 flex h-16 w-16 items-center justify-center text-primary ring-1 ring-primary/20"
              style={{ background: 'var(--accent-faint-raw)', borderRadius: 'var(--r-5)' }}
            >
              <Monogram size={32} />
            </motion.div>

            <motion.h1
              variants={staggerItem}
              className="mb-2 text-foreground"
              style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 500, letterSpacing: '-0.02em' }}
            >
              Quantive
            </motion.h1>
            <motion.p variants={staggerItem} className="mb-8 text-center text-sm text-muted-foreground leading-relaxed">
              Track and analyse your net worth over time.
            </motion.p>

            <motion.button
              variants={staggerItem}
              onClick={() => setAddOpen(true)}
              className="q-btn q-btn--primary q-btn--lg"
              style={{ width: '100%' }}
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
              className={`relative flex w-full flex-col items-center justify-center border-2 border-dashed p-7 transition-all duration-200 ${
                isDragging
                  ? 'border-primary bg-primary/5 scale-[1.01]'
                  : 'border-border hover:border-primary/30 hover:bg-card/40'
              }`}
              style={{ borderRadius: 'var(--r-4)' }}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <Upload className="mb-2.5 h-5 w-5 text-muted-foreground/70" />
              <p className="mb-3.5 text-center text-xs text-muted-foreground leading-relaxed">
                Drop an{' '}
                <code
                  className="bg-secondary px-1.5 py-0.5 text-xs font-medium text-primary"
                  style={{ borderRadius: 'var(--r-1)', fontFamily: 'var(--font-mono)' }}
                >.xlsx</code>
                {' '}file here, or
              </p>
              <label
                className="q-btn q-btn--secondary q-btn--sm cursor-pointer focus-within:ring-2 focus-within:ring-primary/30"
              >
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
                className="q-btn q-btn--ghost q-btn--sm flex-1"
              >
                <Download className="h-3.5 w-3.5" />
                Download template
              </button>
              <button
                onClick={() => {
                  loadMockData();
                  analytics.demoLoaded({ source: 'in_app_button' });
                }}
                className="q-btn q-btn--ghost q-btn--sm flex-1"
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
