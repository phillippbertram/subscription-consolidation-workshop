import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import type { ScoreHistory } from '@premiumpass/api-contracts';
import { themeColors } from '../../components/ui/gluestack-ui-provider/config';

export function ScoreHistoryChart({
  points,
}: {
  points: ScoreHistory['points'];
}) {
  const [width, setWidth] = useState(0);
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) {
    return null;
  }

  const scores = points.map((point) => point.score);
  const lower = Math.max(0, Math.floor(Math.min(...scores)) - 1);
  const upper = Math.min(100, Math.ceil(Math.max(...scores)) + 1);
  const start = Date.parse(first.date);
  const end = Date.parse(last.date);
  const left = 34;
  const right = Math.max(left, width - 24);
  const positions = points.map((point) => ({
    ...point,
    x:
      end === start
        ? (left + right) / 2
        : left +
          ((Date.parse(point.date) - start) / (end - start)) * (right - left),
    y: 24 + ((upper - point.score) / (upper - lower)) * 92,
  }));
  const ink = `rgb(${themeColors['--foreground'].replaceAll(' ', ', ')})`;
  const muted = `rgb(${themeColors['--muted-foreground'].replaceAll(' ', ', ')})`;
  const primary = `rgb(${themeColors['--primary'].replaceAll(' ', ', ')})`;
  const ticks = positions.filter(
    (_, index) =>
      index === 0 ||
      index === points.length - 1 ||
      (width >= 260 && index === Math.floor((points.length - 1) / 2)),
  );
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={`Synthetic score history, displayed score range ${lower} to ${upper}. ${points.map((point) => `${point.date}: ${point.score}`).join('. ')}`}
    >
      {width > 0 && (
        <Svg width={width} height={158} accessible={false}>
          {[lower, upper].map((score) => {
            const y = score === upper ? 24 : 116;
            return (
              <SvgText key={score} x={0} y={y + 4} fill={muted} fontSize={11}>
                {score}
              </SvgText>
            );
          })}
          <Line
            x1={left}
            y1={116}
            x2={right}
            y2={116}
            stroke={muted}
            strokeOpacity={0.15}
          />
          {positions.length > 1 && (
            <Polyline
              points={positions.map(({ x, y }) => `${x},${y}`).join(' ')}
              fill="none"
              stroke={primary}
              strokeWidth={2}
            />
          )}
          {positions.map(({ date, x, y }, index) => (
            <Circle
              key={`${date}:${index}`}
              cx={x}
              cy={y}
              r={3.5}
              fill={primary}
            />
          ))}
          {points.length <= 6 &&
            positions.map(({ date, score, x, y }, index) => (
              <SvgText
                key={`${date}:${index}`}
                x={x}
                y={y - 12}
                textAnchor="middle"
                fill={ink}
                fontSize={12}
              >
                {score}
              </SvgText>
            ))}
          {ticks.map((point, index) => (
            <SvgText
              key={index}
              x={point.x}
              y={148}
              textAnchor={
                index === 0
                  ? 'start'
                  : index === ticks.length - 1
                    ? 'end'
                    : 'middle'
              }
              fill={muted}
              fontSize={12}
            >
              {new Date(`${point.date}T00:00:00`).toLocaleDateString(
                undefined,
                { month: 'short', day: 'numeric' },
              )}
            </SvgText>
          ))}
        </Svg>
      )}
    </View>
  );
}
