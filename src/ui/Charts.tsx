import React, { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import type { ColorTokens } from '@/theme/tokens';
import { AppText } from './Text';

export function ProgressRing({
  value,
  max,
  size = 148,
  stroke = 14,
  color = 'calories',
  children,
  label,
}: {
  value: number;
  max: number | null;
  size?: number;
  stroke?: number;
  color?: keyof ColorTokens;
  children?: React.ReactNode;
  label: string;
}) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const ratio = max && max > 0 ? Math.min(1, value / max) : 0;
  const over = !!max && value > max;
  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={max ? { min: 0, max: Math.round(max), now: Math.round(value) } : undefined}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceAlt} strokeWidth={stroke} fill="none" />
        {max ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={over ? colors.danger : colors[color]}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - ratio)}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}

function useWidth(initial = 320): [number, (e: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(initial);
  return [width, (e) => setWidth(Math.max(120, Math.floor(e.nativeEvent.layout.width)))];
}

export interface BarDatum {
  key: string;
  label: string;
  value: number | null;
}

/**
 * Vertical bar chart with an optional goal line. Accessible as a single
 * image with a textual summary; the numbers are also shown in tables nearby.
 */
export function BarChart({
  data,
  goal,
  height = 180,
  color = 'primary',
  summary,
  formatValue,
}: {
  data: BarDatum[];
  goal?: number | null;
  height?: number;
  color?: keyof ColorTokens;
  summary: string;
  formatValue: (v: number) => string;
}) {
  const { colors } = useTheme();
  const [width, onLayout] = useWidth();
  const top = 16;
  const bottom = 22;
  const left = 4;
  const chartH = height - top - bottom;
  const values = data.map((d) => d.value ?? 0);
  const maxValue = Math.max(1, ...values, goal ?? 0) * 1.1;
  const slot = (width - left) / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(28, slot * 0.7));
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(width / 44)));
  const y = (v: number) => top + chartH - (v / maxValue) * chartH;

  return (
    <View onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={summary}>
      <Svg width={width} height={height}>
        <Line x1={left} x2={width} y1={top + chartH} y2={top + chartH} stroke={colors.border} strokeWidth={1} />
        {data.map((d, i) => {
          const v = d.value ?? 0;
          const x = left + i * slot + (slot - barW) / 2;
          const over = !!goal && v > goal;
          return (
            <React.Fragment key={d.key}>
              {d.value !== null && v > 0 ? (
                <Rect
                  x={x}
                  y={y(v)}
                  width={barW}
                  height={Math.max(1, top + chartH - y(v))}
                  rx={Math.min(4, barW / 2)}
                  fill={over ? colors.danger : colors[color]}
                  opacity={0.9}
                />
              ) : null}
              {i % labelEvery === 0 ? (
                <SvgText x={x + barW / 2} y={height - 6} fontSize={10} fill={colors.textMuted} textAnchor="middle">
                  {d.label}
                </SvgText>
              ) : null}
            </React.Fragment>
          );
        })}
        {goal ? (
          <>
            <Line
              x1={left}
              x2={width}
              y1={y(goal)}
              y2={y(goal)}
              stroke={colors.textMuted}
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <SvgText x={width - 2} y={y(goal) - 4} fontSize={10} fill={colors.textMuted} textAnchor="end">
              {formatValue(goal)}
            </SvgText>
          </>
        ) : null}
      </Svg>
    </View>
  );
}

export interface LinePoint {
  x: number;
  y: number;
}

/** Line chart for weight: raw points and an optional smoothed trend line. */
export function LineChart({
  points,
  trend,
  height = 180,
  summary,
  formatValue,
  xLabels,
}: {
  points: LinePoint[];
  trend?: LinePoint[];
  height?: number;
  summary: string;
  formatValue: (v: number) => string;
  xLabels?: [string, string];
}) {
  const { colors } = useTheme();
  const [width, onLayout] = useWidth();
  const { m } = useI18n();
  const pad = { top: 16, bottom: 22, left: 8, right: 44 };
  const all = [...points, ...(trend ?? [])];
  if (points.length === 0) return null;
  const minX = Math.min(...all.map((p) => p.x));
  const maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const maxY = Math.max(...all.map((p) => p.y));
  const spanY = Math.max(1, maxY - minY);
  const lowY = minY - spanY * 0.15;
  const highY = maxY + spanY * 0.15;
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const sx = (x: number) => pad.left + (maxX === minX ? w / 2 : ((x - minX) / (maxX - minX)) * w);
  const sy = (v: number) => pad.top + h - ((v - lowY) / (highY - lowY)) * h;
  const path = (ps: LinePoint[]) => ps.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');

  return (
    <View onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={`${m.a11y.chart}: ${summary}`}>
      <Svg width={width} height={height}>
        {[highY, (highY + lowY) / 2, lowY].map((v) => (
          <React.Fragment key={v}>
            <Line x1={pad.left} x2={pad.left + w} y1={sy(v)} y2={sy(v)} stroke={colors.border} strokeWidth={1} />
            <SvgText x={width - 2} y={sy(v) + 4} fontSize={10} fill={colors.textMuted} textAnchor="end">
              {formatValue(v)}
            </SvgText>
          </React.Fragment>
        ))}
        {points.length > 1 ? <Path d={path(points)} stroke={colors.border} strokeWidth={1.5} fill="none" /> : null}
        {points.map((p, i) => (
          <Circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={3} fill={colors.textMuted} />
        ))}
        {trend && trend.length > 1 ? <Path d={path(trend)} stroke={colors.primary} strokeWidth={3} fill="none" /> : null}
        {xLabels ? (
          <>
            <SvgText x={pad.left} y={height - 6} fontSize={10} fill={colors.textMuted}>
              {xLabels[0]}
            </SvgText>
            <SvgText x={pad.left + w} y={height - 6} fontSize={10} fill={colors.textMuted} textAnchor="end">
              {xLabels[1]}
            </SvgText>
          </>
        ) : null}
      </Svg>
    </View>
  );
}

export function Legend({ items }: { items: { color: keyof ColorTokens; label: string }[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors[i.color] }} />
          <AppText variant="small" tone="muted">
            {i.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}
