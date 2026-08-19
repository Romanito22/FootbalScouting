import type { MetricDef } from '@vivier/metrics';

export function formatMetricValue(value: number, format: MetricDef['format']): string {
  switch (format) {
    case 'int':
      return Math.round(value).toString();
    case 'dec1':
      return value.toFixed(1);
    case 'dec2':
      return value.toFixed(2);
    case 'pct':
      return `${Math.round(value * 100)} %`;
  }
}
