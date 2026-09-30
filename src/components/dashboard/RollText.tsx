/**
 * Text whose changed characters swap in once, all together, after a save.
 * With no `from` it is plain text. Characters are compared from the right so
 * a new thousands group shifts nothing; the full value stays readable in an
 * sr-only span while the glyphs are aria-hidden.
 */
export function RollText({ text, from, className = '' }: { text: string; from?: string | null; className?: string }) {
  if (from == null || from === text) return <span className={className}>{text}</span>;
  const chars = Array.from(text);
  const prev = Array.from(from);
  return (
    <span className={`q-roll ${className}`}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {chars.map((ch, i) => {
          const fromRight = chars.length - i;
          const changed = prev[prev.length - fromRight] !== ch;
          return (
            <span key={`${fromRight}:${ch}`} className={changed ? 'q-roll-ch is-new' : 'q-roll-ch'}>
              {ch}
            </span>
          );
        })}
      </span>
    </span>
  );
}
