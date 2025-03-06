import { NextResponse } from 'next/server'
import wandb from '@wandb/sdk'
import { PineconeResponse, WandbEvaluation } from '@/types'

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

  await wandb.log({ query, evaluation });
  return evaluation;
};

export async function POST(request: Request) {
  try {
    const { responses, rerankedResults, query } = await request.json()
    
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