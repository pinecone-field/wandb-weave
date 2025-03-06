import { NextResponse } from 'next/server'
import wandb from '@wandb/sdk'
import { PineconeResponse, WandbEvaluation } from '@/types'

// Basic evaluation functions
const checkRelevance = (query: string, response: any) => {
  // For now, use similarity score as a proxy for relevance
  return {
    relevance_score: response.score,
    explanation: `Similarity score: ${response.score}`
  };
};

const checkLatency = (latency: number) => {
  const threshold = 500; // 500ms threshold
  return {
    within_threshold: latency < threshold,
    latency_ms: latency
  };
};

const checkSimilarityScores = (scores: number[]) => {
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const spread = Math.max(...scores) - Math.min(...scores);
  return {
    avg_similarity: avg,
    score_spread: spread
  };
};

const evaluateSearchResults = async (query: string, results: PineconeResponse[]): Promise<WandbEvaluation> => {
  // Calculate basic metrics
  const meanScore = results.reduce((acc, r) => acc + r.score, 0) / results.length;
  const scores = results.map(r => r.score);
  const stdScore = Math.sqrt(
    scores.reduce((acc, score) => acc + Math.pow(score - meanScore, 2), 0) / scores.length
  );

  // Create evaluation object
  const evaluation: WandbEvaluation = {
    metrics: {
      mean_score: meanScore,
      std_score: stdScore,
      latency: results[0]?.latency || 0
    },
    results: results.map(r => ({
      id: r.id,
      score: r.score,
      metadata: r.metadata,
      latency: r.latency
    }))
  };

  // Log to wandb
  await wandb.log({
    query,
    evaluation
  });

  return evaluation;
};

export async function POST(request: Request) {
  try {
    const { responses, rerankedResults, query } = await request.json()
    
    // Evaluate both sets of results
    const vectorResults = await evaluateSearchResults(query, responses);
    const rerankEvaluation = rerankedResults?.length ? 
      await evaluateSearchResults(query, rerankedResults) : null;

    return NextResponse.json({
      vector_evaluation: vectorResults,
      reranked_evaluation: rerankEvaluation
    })

  } catch (error) {
    console.error('W&B API error:', error)
    return NextResponse.json({ error: 'Failed to evaluate responses' }, { status: 500 })
  }
} 