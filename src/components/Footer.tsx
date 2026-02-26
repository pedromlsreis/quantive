export function Footer() {
  return (
    <footer className="py-4 text-center text-xs text-muted-foreground/50 tracking-wide">
      <a
        href="https://www.linkedin.com/in/pedrom-reis/"
        target="_blank"
        rel="noopener noreferrer"
        className="transition-colors hover:text-primary"
      >
        pedromlsreis
      </a>{' '}
      © {new Date().getFullYear()}
    </footer>
  );
}
