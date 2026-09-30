import type { ReactNode } from 'react';

/** A ruled settings section: title on the left, rows on the right. */
export function SettingsSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="q-set-sec" aria-labelledby={`${id}-title`}>
      <h2 className="q-h2" id={`${id}-title`}>{title}</h2>
      <div className="q-set-rows">{children}</div>
    </section>
  );
}

export function SettingsRow({ id, label, htmlFor, tag, description, children }: {
  id?: string;
  label?: string;
  htmlFor?: string;
  tag?: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div id={id} className="q-set-row">
      <div style={{ minWidth: 0 }}>
        {label && (
          <div className="q-set-label">
            {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
            {tag && <span className="q-tag">{tag}</span>}
          </div>
        )}
        {description && <p className="q-set-desc">{description}</p>}
      </div>
      {children && <div className="q-set-control">{children}</div>}
    </div>
  );
}
