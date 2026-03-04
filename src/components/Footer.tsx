export function Footer() {
  return (
    <footer className="sticky bottom-0 z-40 border-t border-border bg-background py-3 text-center text-xs text-muted-foreground/50 tracking-wide">
      © {new Date().getFullYear()} Networth Analysis, by{" "}
      <a
        href="https://www.linkedin.com/in/pedrom-reis/"
        target="_blank"
        rel="noopener noreferrer"
        className="transition-colors hover:text-primary"
      >
        pedromlsreis
      </a>
      {" "}– All rights reserved.
    </footer>
  );
}
