// The key hierarchy from docs/security/encryption.md §5 and §5.1, authored as
// data so a future step-through view can reuse it. Keep it in step with the
// spec: if a key, lane or operation changes there, change it here.

type Lane = 'browser' | 'server';

interface KeyNode {
  id: string;
  x: number;
  y: number;
  w?: number;
  title: string;
  sub: string;
  lane: Lane;
  /** Something only you hold (emerald outline). */
  yours?: boolean;
}

interface KeyEdge {
  points: [number, number][];
  label?: string;
  labelAt?: [number, number];
  anchor?: 'start' | 'middle' | 'end';
  /** Your data travelling, rather than a key operation. */
  data?: boolean;
}

const W = 136;
const H = 48;

const NODES: KeyNode[] = [
  { id: 'pw', x: 90, y: 76, title: 'Your password', sub: 'never sent', lane: 'browser', yours: true },
  { id: 'rc', x: 90, y: 196, title: 'Recovery code', sub: '24 words, opt-in', lane: 'browser', yours: true },
  { id: 'kek', x: 300, y: 76, title: 'KEK', sub: 'memory only', lane: 'browser' },
  { id: 'rkek', x: 300, y: 196, title: 'Recovery KEK', sub: 'memory only', lane: 'browser' },
  { id: 'dk', x: 510, y: 136, title: 'Data key', sub: 'wiped on sign-out', lane: 'browser' },
  { id: 'pf', x: 710, y: 76, title: 'Your portfolio', sub: 'readable', lane: 'browser', yours: true },
  { id: 'keys', x: 510, y: 352, w: 196, title: 'Salt and wrapped keys', sub: 'useless without you', lane: 'server' },
  { id: 'ct', x: 710, y: 352, w: 168, title: 'Ciphertext + nonce', sub: 'bound to your account', lane: 'server' },
];

const EDGES: KeyEdge[] = [
  { points: [[158, 76], [232, 76]], label: 'Argon2id', labelAt: [195, 66] },
  { points: [[158, 196], [232, 196]], label: 'Argon2id', labelAt: [195, 186] },
  { points: [[368, 86], [442, 126]], label: 'unwraps', labelAt: [400, 96], anchor: 'start' },
  { points: [[368, 186], [442, 146]], label: 'or unwraps', labelAt: [400, 184], anchor: 'start' },
  { points: [[510, 328], [510, 160]], label: 'fetched at sign-in', labelAt: [518, 250], anchor: 'start' },
  { points: [[578, 136], [710, 136]], label: 'encrypts', labelAt: [644, 128] },
  { points: [[710, 100], [710, 328]], label: 'XChaCha20-Poly1305', labelAt: [700, 222], anchor: 'end', data: true },
];

export function KeyDiagram() {
  return (
    <svg className="sec-fig-svg" viewBox="0 0 820 400" role="img" aria-labelledby="kd-title">
      <title id="kd-title">
        Key hierarchy: your password and optional recovery code derive keys in your browser that unlock a random data
        key; the data key encrypts your portfolio; only ciphertext, a nonce, a salt and wrapped keys reach the server.
      </title>
      <text className="kd-lane" x={16} y={24}>In your browser</text>
      <line className="kd-boundary" x1={0} x2={820} y1={282} y2={282} />
      <text className="kd-lane" x={16} y={308}>On our servers</text>

      <defs>
        <marker id="kd-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8 z" fill="var(--fg-subtle)" />
        </marker>
        <marker id="kd-arrow-data" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8 z" fill="var(--accent-raw)" />
        </marker>
      </defs>

      {EDGES.map((e, i) => (
        <g key={i}>
          <polyline
            className={e.data ? 'kd-edge kd-edge--data' : 'kd-edge'}
            points={e.points.map((p) => p.join(',')).join(' ')}
            markerEnd={`url(#${e.data ? 'kd-arrow-data' : 'kd-arrow'})`}
          />
          {e.label && e.labelAt && (
            <text className="kd-edge-label" x={e.labelAt[0]} y={e.labelAt[1]} textAnchor={e.anchor ?? 'middle'}>
              {e.label}
            </text>
          )}
        </g>
      ))}

      {NODES.map((n) => {
        const w = n.w ?? W;
        return (
          <g
            key={n.id}
            className={`kd-node ${n.yours ? 'kd-node--yours' : ''} ${n.lane === 'server' ? 'kd-node--server' : ''}`}
          >
            <rect x={n.x - w / 2} y={n.y - H / 2} width={w} height={H} rx={6} />
            <text className="kd-node-title" x={n.x} y={n.y - 3} textAnchor="middle">{n.title}</text>
            <text className="kd-node-sub" x={n.x} y={n.y + 14} textAnchor="middle">{n.sub}</text>
          </g>
        );
      })}
    </svg>
  );
}
