export interface Metadata {
  date?: string
  source?: string
  text?: string
  title?: string
  [key: string]: string | undefined
}

export interface PineconeResponse {
  id: string
  score: number
  metadata: Metadata
  latency: number
}

export interface RerankResponse extends PineconeResponse {
  rerank_score: number
  score_spread: number
}

export interface EvaluationMetrics {
  mean_score: number
  std_score: number
  latency: number
}

export interface WandbEvaluation {
  metrics: EvaluationMetrics
  results: PineconeResponse[]
} 