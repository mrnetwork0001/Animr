import { diagram } from "./content";
import { icons } from "./icons";

type Node = (typeof diagram.nodes)[number];

const ALWAYS_STROKE = "lp-flow-always";
const OPT_IN_STROKE = "lp-flow-optin";

/**
 * NFT → wallet → AI mind → trade guard → Capricorn pool, with the swap output returning to the
 * wallet. Two drawings of the same flow: a row for wide screens, a column for narrow ones
 * (SVG text doesn't reflow). All of it is live on Monad mainnet; solid teal = always on, dashed violet =
 * the holder's opt-in (real-wallet trades through AnimrTradeGuard). Colours: landing.css (lp-flow-*).
 */
export function FlowDiagram() {
  return (
    <figure className="v2-card v2-card--roomy lp-flowfig lp-reveal">
      <figcaption className="lp-flowfig-cap">
        <h3 className="lp-h3-lg">{diagram.title}</h3>
        <p className="lp-card-p">
          {/* Who trades for real stands out from the caption: only Chogs whose holder opted in. */}
          {diagram.caption} <span className="lp-strong">{diagram.today}</span>
        </p>
        <Legend />
      </figcaption>
      <div className="lp-flowfig-art">
        <HorizontalFlow />
        <VerticalFlow />
      </div>
    </figure>
  );
}

function Legend() {
  return (
    <ul className="v2-legend lp-flow-legend">
      <li>
        <svg viewBox="0 0 28 4" className="lp-legend-line" aria-hidden>
          <line x1="0" y1="2" x2="28" y2="2" className={ALWAYS_STROKE} strokeWidth="2" />
        </svg>
        {diagram.legend.always}
      </li>
      <li>
        <svg viewBox="0 0 28 4" className="lp-legend-line" aria-hidden>
          <line x1="0" y1="2" x2="28" y2="2" className={OPT_IN_STROKE} strokeWidth="2" strokeDasharray="5 4" />
        </svg>
        {diagram.legend.optIn}
      </li>
    </ul>
  );
}

// ---------------------------------------------------------------- shared pieces

function NodeBox({ node, width, height }: { node: Node; width: number; height: number }) {
  return (
    <rect
      width={width}
      height={height}
      rx="16"
      strokeWidth="1.25"
      strokeDasharray={node.optIn ? "5 4" : undefined}
      className={node.optIn ? "lp-node lp-node--optin" : "lp-node"}
    />
  );
}

function NodeIcon({ node, x, y }: { node: Node; x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="36" height="36" rx="10" className={node.optIn ? "lp-node-tile lp-node-tile--optin" : "lp-node-tile"} />
      <svg
        x="8"
        y="8"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={node.optIn ? "lp-node-glyph lp-node-glyph--optin" : "lp-node-glyph"}
      >
        {icons[node.icon]}
      </svg>
    </g>
  );
}

/** Badge width for its label (10px sentence case ≈ 6px a letter, plus padding), so it clears the titles. */
const BADGE_W = Math.round(18 + diagram.badge.length * 6);

function Badge({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={BADGE_W} height="18" rx="9" strokeWidth="1" className="lp-optin-badge" />
      <text x={BADGE_W / 2} y="12.5" textAnchor="middle" className="lp-optin-badge-text">
        {diagram.badge}
      </text>
    </g>
  );
}

function Chevron({ d, optIn }: { d: string; optIn: boolean }) {
  return (
    <path
      d={d}
      fill="none"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={optIn ? OPT_IN_STROKE : ALWAYS_STROKE}
    />
  );
}

// ---------------------------------------------------------------- wide: one row

const ROW = { nodeW: 168, nodeH: 120, gap: 50, top: 20 } as const;

function HorizontalFlow() {
  const { nodeW, nodeH, gap, top } = ROW;
  const step = nodeW + gap;
  const midY = top + nodeH / 2;
  const bottom = top + nodeH;
  const walletX = step + nodeW / 2;
  const poolX = 4 * step + nodeW / 2;
  const laneY = bottom + 58;

  return (
    <svg
      viewBox="0 0 1040 244"
      role="img"
      aria-labelledby="flow-row-title"
      aria-describedby="flow-row-desc"
      className="lp-flow-row"
    >
      <title id="flow-row-title">{diagram.srTitle}</title>
      <desc id="flow-row-desc">{diagram.srDescription}</desc>

      {diagram.edges.map((edge, index) => {
        const x1 = index * step + nodeW;
        const x2 = x1 + gap;
        return (
          <g key={edge.label}>
            <line
              x1={x1 + 5}
              y1={midY}
              x2={x2 - 6}
              y2={midY}
              strokeWidth="1.75"
              className={edge.optIn ? `${OPT_IN_STROKE} lp-dashed` : ALWAYS_STROKE}
            />
            <Chevron d={`M${x2 - 11} ${midY - 5}L${x2 - 5} ${midY}L${x2 - 11} ${midY + 5}`} optIn={edge.optIn} />
            <text x={(x1 + x2) / 2} y={midY - 12} textAnchor="middle" className="lp-svg-mono lp-svg-faint">
              {edge.label}
            </text>
          </g>
        );
      })}

      {/* Swap output returns to the wallet. */}
      <path
        d={`M${poolX} ${bottom + 6}V${laneY - 10}Q${poolX} ${laneY} ${poolX - 10} ${laneY}H${walletX + 10}Q${walletX} ${laneY} ${walletX} ${laneY - 10}V${bottom + 7}`}
        fill="none"
        strokeWidth="1.75"
        className={`${OPT_IN_STROKE} lp-dashed`}
      />
      <Chevron d={`M${walletX - 5} ${bottom + 12}L${walletX} ${bottom + 6}L${walletX + 5} ${bottom + 12}`} optIn />
      <text x={(walletX + poolX) / 2} y={laneY + 26} textAnchor="middle" className="lp-svg-return">
        {diagram.returnLabel}
      </text>

      {diagram.nodes.map((node, index) => (
        <g key={node.title} transform={`translate(${index * step} ${top})`}>
          <NodeBox node={node} width={nodeW} height={nodeH} />
          <NodeIcon node={node} x={16} y={16} />
          {node.optIn && <Badge x={nodeW - 16 - BADGE_W} y={18} />}
          <text x="16" y="78" className="lp-svg-title">
            {node.title}
          </text>
          <text x="16" y="98" className="lp-svg-mono lp-svg-muted">
            {node.lines[0]}
          </text>
          <text x="16" y="114" className="lp-svg-mono lp-svg-faint">
            {node.lines[1]}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------- narrow: one column

const COLUMN = { nodeW: 256, nodeH: 92, gap: 56, top: 4 } as const;

function VerticalFlow() {
  const { nodeW, nodeH, gap, top } = COLUMN;
  const step = nodeH + gap;
  const midX = nodeW / 2;
  const walletY = top + step + nodeH / 2;
  const poolY = top + 4 * step + nodeH / 2;
  const laneX = nodeW + 36;

  return (
    <svg
      viewBox="0 0 330 696"
      role="img"
      aria-labelledby="flow-column-title"
      aria-describedby="flow-column-desc"
      className="lp-flow-col"
    >
      <title id="flow-column-title">{diagram.srTitle}</title>
      <desc id="flow-column-desc">{diagram.srDescription}</desc>

      {diagram.edges.map((edge, index) => {
        const y1 = top + index * step + nodeH;
        const y2 = y1 + gap;
        return (
          <g key={edge.label}>
            <line
              x1={midX}
              y1={y1 + 5}
              x2={midX}
              y2={y2 - 6}
              strokeWidth="1.75"
              className={edge.optIn ? `${OPT_IN_STROKE} lp-dashed` : ALWAYS_STROKE}
            />
            <Chevron d={`M${midX - 5} ${y2 - 11}L${midX} ${y2 - 5}L${midX + 5} ${y2 - 11}`} optIn={edge.optIn} />
            <text x={midX + 14} y={(y1 + y2) / 2 + 4} className="lp-svg-mono lp-svg-faint lp-svg-12">
              {edge.label}
            </text>
          </g>
        );
      })}

      {/* Swap output returns to the wallet. */}
      <path
        d={`M${nodeW + 6} ${poolY}H${laneX - 10}Q${laneX} ${poolY} ${laneX} ${poolY - 10}V${walletY + 10}Q${laneX} ${walletY} ${laneX - 10} ${walletY}H${nodeW + 7}`}
        fill="none"
        strokeWidth="1.75"
        className={`${OPT_IN_STROKE} lp-dashed`}
      />
      <Chevron d={`M${nodeW + 12} ${walletY - 5}L${nodeW + 6} ${walletY}L${nodeW + 12} ${walletY + 5}`} optIn />
      <text
        transform={`translate(${laneX + 20} ${(walletY + poolY) / 2}) rotate(-90)`}
        textAnchor="middle"
        className="lp-svg-return lp-svg-12"
      >
        {diagram.returnLabel}
      </text>

      {diagram.nodes.map((node, index) => (
        <g key={node.title} transform={`translate(0 ${top + index * step})`}>
          <NodeBox node={node} width={nodeW} height={nodeH} />
          <NodeIcon node={node} x={14} y={14} />
          {node.optIn && <Badge x={nodeW - 14 - BADGE_W} y={14} />}
          <text x="64" y="34" className="lp-svg-title lp-svg-16">
            {node.title}
          </text>
          <text x="64" y="57" className="lp-svg-mono lp-svg-muted lp-svg-12">
            {node.lines[0]}
          </text>
          <text x="64" y="76" className="lp-svg-mono lp-svg-faint lp-svg-12">
            {node.lines[1]}
          </text>
        </g>
      ))}
    </svg>
  );
}
