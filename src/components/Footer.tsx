import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="sticky bottom-0 z-40 border-t border-border bg-background py-3 text-center text-xs text-muted-foreground/50 tracking-wide">
      <p className="flex flex-wrap justify-center gap-y-1">
        <span className="whitespace-nowrap">© {new Date().getFullYear()} Quantive — All rights reserved.</span>
        <span className="whitespace-nowrap">
          <span className="mx-1.5">·</span>
          <Link to="/security" className="transition-colors hover:text-primary">Security</Link>
          <span className="mx-1.5">·</span>
          <Link to="/privacy" className="transition-colors hover:text-primary">Privacy</Link>
          <span className="mx-1.5">·</span>
          <Link to="/terms" className="transition-colors hover:text-primary">Terms</Link>
          <span className="mx-1.5">·</span>
          <Link to="/impressum" className="transition-colors hover:text-primary">Impressum</Link>
        </span>
      </p>
    </footer>
  );
}
