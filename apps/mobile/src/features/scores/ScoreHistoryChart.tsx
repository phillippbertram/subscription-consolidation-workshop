import { useState } from 'react';
import { View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import type { ScoreHistory } from '@premiumpass/api-contracts';
import { themeColor } from '../../components/ui/gluestack-ui-provider/config';

const height = 170;
const top = 16;
const bottom = 28;
const inset = 16;
// One chart per screen, so a fixed gradient ID cannot collide.
const gradientId = 'score-history-area';

function formatMonth(date: string) {
  // Score dates are calendar days; parse them as local dates, not UTC instants.
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
  });
}

/** Area chart matching the website's score chart, sized to the measured width. */
export function ScoreHistoryChart({
  points,
}: {
  points: ScoreHistory['points'];
}) {
  const [width, setWidth] = useState(0);
  if (points.length === 0) {
    return null;
  }

  const scores = points.map((point) => point.score);
  const min = Math.max(0, Math.min(...scores) - 6);
  const max = Math.min(100, Math.max(...scores) + 4);
  const range = Math.max(1, max - min);
  const positions = points.map((point, index) => ({
    ...point,
    x:
      points.length === 1
        ? width / 2
        : inset + (index * (width - inset * 2)) / (points.length - 1),
    y: top + ((max - point.score) / range) * (height - top - bottom),
  }));
  const line = positions
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`)
    .join(' ');
  const first = positions[0];
  const last = positions.at(-1);
  const baseline = height - bottom;
  const primary = themeColor('primary');

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={`Score history: ${points.map((point) => `${formatMonth(point.date)} ${point.score}`).join(', ')}`}
    >
      {width > 0 && first && last && (
        <Svg width={width} height={height} accessible={false}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={primary} stopOpacity={0.25} />
              <Stop offset="1" stopColor={primary} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {[0.25, 0.5, 0.75].map((fraction) => (
            <Line
              key={fraction}
              x1={0}
              x2={width}
              y1={baseline * fraction}
              y2={baseline * fraction}
              stroke={themeColor('border')}
              strokeDasharray="4 6"
            />
          ))}
          <Path
            d={`${line} L${last.x},${baseline} L${first.x},${baseline} Z`}
            fill={`url(#${gradientId})`}
          />
          <Path
            d={line}
            fill="none"
            stroke={primary}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {positions.map((point) => (
            <Circle
              key={point.date}
              cx={point.x}
              cy={point.y}
              r={5}
              fill={themeColor('card')}
              stroke={primary}
              strokeWidth={3}
            />
          ))}
          {positions.map((point) => (
            <SvgText
              key={`label:${point.date}`}
              x={point.x}
              y={height - 6}
              textAnchor="middle"
              fill={themeColor('muted-foreground')}
              fontSize={12}
            >
              {formatMonth(point.date)}
            </SvgText>
          ))}
        </Svg>
      )}
    </View>
  );
}
