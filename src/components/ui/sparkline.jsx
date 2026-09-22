import { LineChart, Line, ResponsiveContainer } from 'recharts';

export function Sparkline({ data, color = 'hsl(var(--primary))', width = 70, height = 28 }) {
  if (!data || data.length < 2) return null;
  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
