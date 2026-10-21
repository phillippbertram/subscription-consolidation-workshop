import { useId } from 'react';
import type { ScoreHistory } from '@premiumpass/api-contracts';

const width = 640;
const height = 200;
const padding = { x: 32, top: 16, bottom: 12 };

function formatMonth(date: string) {
  // Score dates are calendar days; parse them as local dates, not UTC instants.
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
  });
}

/**
 * A dependency-free area chart for a handful of points. Labels are HTML so
 * they keep a readable size while the SVG scales with the card width.
 */
export function ScoreChart({ points }: { points: ScoreHistory['points'] }) {
  const gradientId = useId();
  const scores = points.map((point) => point.score);
  const min = Math.max(0, Math.min(...scores) - 6);
  const max = Math.min(100, Math.max(...scores) + 4);
  const range = Math.max(1, max - min);
  const coordinates = points.map((point, index) => ({
    ...point,
    x:
      points.length === 1
        ? width / 2
        : padding.x + (index * (width - padding.x * 2)) / (points.length - 1),
    y:
      padding.top +
      ((max - point.score) / range) * (height - padding.top - padding.bottom),
  }));
  const line = coordinates
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`)
    .join(' ');
  const first = coordinates[0];
  const last = coordinates.at(-1);
  const area =
    first && last
      ? `${line} L${last.x},${height} L${first.x},${height} Z`
      : undefined;

  return (
    <figure className="space-y-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={`Score history: ${points
          .map((point) => `${formatMonth(point.date)} ${point.score}`)
          .join(', ')}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1="0"
            x2={width}
            y1={height * fraction}
            y2={height * fraction}
            stroke="var(--border)"
            strokeDasharray="4 6"
          />
        ))}
        {area && <path d={area} fill={`url(#${gradientId})`} />}
        <path
          d={line}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coordinates.map((point) => (
          <circle
            key={point.date}
            cx={point.x}
            cy={point.y}
            r="6"
            fill="var(--card)"
            stroke="var(--primary)"
            strokeWidth="3"
          />
        ))}
      </svg>
      <figcaption className="relative h-5 text-xs text-muted-foreground">
        {coordinates.map((point) => (
          <span
            key={point.date}
            className="absolute -translate-x-1/2"
            style={{ left: `${(point.x / width) * 100}%` }}
          >
            {formatMonth(point.date)}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
