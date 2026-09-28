import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { PublicPage } from "@/components/landing/PublicPage";
import { useAuth } from "@/contexts/AuthContext";
import { analytics } from "@/lib/analytics";
import "@/styles/doc.css";

const EXITS = [
  { to: "/demo", label: "Demo", desc: "The app with illustrative data" },
  { to: "/pricing", label: "Pricing", desc: "Free forever, or €90 a year" },
  { to: "/security", label: "Security", desc: "How your data is encrypted, and what we can't protect" },
];

const NotFound = () => {
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    // A 404 from a mistyped URL or dead deep-link is normal traffic, not an
    // app error. Warn so the line stays greppable in dev without bumping
    // the page into the global-error-handler bucket on launch day.
    console.warn("404: no route for", location.pathname);
  }, [location.pathname]);

  return (
    <PublicPage>
      <div className="pub-wrap nf">
        <h1 className="pub-display">Page not found</h1>
        <p className="pub-lede">
          Nothing is published at{" "}
          <code className="pub-mono nf-path" translate="no">{location.pathname}</code>. The link may be mistyped or out
          of date.
        </p>
        <div className="lp-actions">
          {user ? (
            <Link to="/dashboard" className="pub-btn pub-btn--primary">Go to your dashboard</Link>
          ) : (
            <Link to="/" className="pub-btn pub-btn--primary">Back to the homepage</Link>
          )}
        </div>
        <ul className="nf-index" role="list">
          {EXITS.map((exit) => (
            <li key={exit.to}>
              <Link
                to={exit.to}
                onClick={() => {
                  if (exit.to === "/demo") analytics.landingCtaClicked({ cta: "try_demo", location: "not_found" });
                }}
              >
                <span>{exit.label}</span>
                <span>{exit.desc}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </PublicPage>
  );
};

export default NotFound;
