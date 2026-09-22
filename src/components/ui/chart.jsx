import * as React from 'react';
import { cn } from '../../lib/utils';

const ChartContext = React.createContext(null);

export function ChartContainer({ config, className, children, ...props }) {
  const style = {};
  Object.entries(config || {}).forEach(([key, value]) => {
    if (value.color) style[`--color-${key}`] = value.color;
  });
  return (
    <ChartContext.Provider value={{ config }}>
      <div className={cn('w-full', className)} style={style} {...props}>{children}</div>
    </ChartContext.Provider>
  );
}

export function ChartTooltip(props) {
  return props.content ? React.cloneElement(props.content, props) : null;
}

export function ChartTooltipContent({ active, payload, label }) {
  const { config } = React.useContext(ChartContext) || { config: {} };
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-foreground">{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{config?.[entry.dataKey]?.label || entry.dataKey}:</span>
          <span className="font-medium text-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}
