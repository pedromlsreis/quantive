import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="sticky bottom-0 z-40 border-t border-border bg-background py-3 text-center text-xs text-muted-foreground/50 tracking-wide">
      <p>
        © {new Date().getFullYear()} Quantive, by{" "}
        <a
          href="https://www.linkedin.com/in/pedrom-reis/"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-primary"
        >
          pedromlsreis
        </a>
        {" "}– All rights reserved.
        <span className="mx-1.5">·</span>
        <Link to="/privacy" className="transition-colors hover:text-primary">Privacy</Link>
        <span className="mx-1.5">·</span>
        <Link to="/security" className="transition-colors hover:text-primary">Security</Link>
        <span className="mx-1.5">·</span>
        <Link to="/terms" className="transition-colors hover:text-primary">Terms</Link>
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground/30">
        Not financial advice. For informational purposes only. Consult a qualified financial advisor before making investment decisions.
      </p>
    </footer>
  );
}
