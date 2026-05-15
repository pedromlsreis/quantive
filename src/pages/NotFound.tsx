import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { StickyNav } from "@/components/landing/StickyNav";
import { Footer } from "@/components/Footer";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <StickyNav />

      <main className="flex flex-1 items-center justify-center px-6 pb-20 pt-32 text-center">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Error 404</p>
          <h1 className="mt-3 text-4xl font-extrabold text-foreground sm:text-5xl">Page not found</h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <Link
            to="/"
            className="mt-8 inline-flex items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Return to home
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default NotFound;
