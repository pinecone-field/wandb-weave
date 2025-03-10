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

interface IndividualScore {
  relevance: number;
  has_title: boolean;
  text_length: number;
  latency: number;
}

export interface WeaveEvaluation {
  metrics: {
    similarity: number;
    rerank_score: number;
    latency: number;
    model_latency: number;
  };
  individual_scores?: IndividualScore[];  // Make it optional since it might not exist
}