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

export interface WeaveModelOutput {
  vector_results: PineconeResponse[];
  reranked_results: RerankResponse[];
  latency: number;
}

export interface EvaluationResult {
  relevance: number;
  diversity: number;
  coverage: number;
  explanations: {
    relevance: string;
    diversity: string;
    coverage: string;
  };
}

export interface WeaveEvaluation {
  metrics: {
    vector: EvaluationResult;
    rerank: EvaluationResult | null;
  };
  model_outputs: WeaveModelOutput[];
  individual_scores?: Array<{
    relevance: number;
    diversity: number;
    coverage: number;
    explanations?: {
      relevance?: string;
      diversity?: string;
      coverage?: string;
    };
  }>;
  leaderboard_url?: string;
}