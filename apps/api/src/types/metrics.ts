export interface MetricsLabels {
  status: string
  handler: string
  code: string
}

export type MetricsCounter = (labels: MetricsLabels) => void
export type MetricsHistogram = (labels: MetricsLabels, value: number) => void