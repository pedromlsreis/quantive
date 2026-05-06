import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="sticky bottom-0 z-40 border-t border-border bg-background py-3 text-center text-xs text-muted-foreground/50 tracking-wide">
      <p>
        © {new Date().getFullYear()} Quantive — All rights reserved.
        <span className="mx-1.5">·</span>
        <Link to="/privacy" className="transition-colors hover:text-primary">Privacy</Link>
        <span className="mx-1.5">·</span>
        <Link to="/security" className="transition-colors hover:text-primary">Security</Link>
        <span className="mx-1.5">·</span>
        <Link to="/terms" className="transition-colors hover:text-primary">Terms</Link>
        <span className="mx-1.5">·</span>
        <Link to="/impressum" className="transition-colors hover:text-primary">Impressum</Link>
      </p>
    </footer>
  );
}
