/** Sign-led change with a 6px direction mark as its only colour. */
export function Delta({ text, tone }: { text: string; tone: 'pos' | 'neg' | 'zero' }) {
  return (
    <span className={`q-delta q-delta--${tone}`}>
      {tone !== 'zero' && <span className="q-delta-mark" aria-hidden="true" />}
      <span className="num">{text}</span>
    </span>
  );
}
