import { NextResponse } from 'next/server'
import { Pinecone } from '@pinecone-database/pinecone'
import { PineconeResponse } from '@/types'

const calculateScoreSpread = (scores: number[]) => {
  return Math.max(...scores) - Math.min(...scores);
};

export async function POST(request: Request) {
  try {
    const { query, documents }: { query: string, documents: PineconeResponse[] } = await request.json()
    
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!
    })
    const rerankingModel = "bge-reranker-v2-m3"
    const rerankOptions = {
      topN: 3,
      returnDocuments: true,
      parameters: {
        truncate: 'END'
      }, 
    };

    const startTime = performance.now()
    const result = await pinecone.inference.rerank(
      rerankingModel,
      query,
      documents.map((doc: PineconeResponse) => ({
        id: doc.id,
        text: doc.metadata.text || ''
      })),
      rerankOptions
    )
    const endTime = performance.now()
    const latency = endTime - startTime

    // Map the reranked results to match our expected format
    const reranked = result.data.map(item => {
      // Normalize rerank score to be between 0-1 like vector scores
      const normalizedRerankScore = (item.score + 1) / 2; // Most rerankers output scores from -1 to 1
      
      return {
        ...documents[item.index],
        score: documents[item.index].score,  // Keep original vector score
        rerank_score: normalizedRerankScore,
        evaluation_score: normalizedRerankScore,  // Use normalized rerank score
        latency,
        score_spread: calculateScoreSpread(result.data.map(r => (r.score + 1) / 2)),
        metrics: {
          similarity_score: documents[item.index].score * 100,
          rerank_score: normalizedRerankScore * 100,
          avg_relevance: (documents[item.index].score + normalizedRerankScore) / 2 * 100,
          latency,
          score_spread: calculateScoreSpread(result.data.map(r => (r.score + 1) / 2)) * 100
        }
      }
    })

    return NextResponse.json({ reranked })
  } catch (error) {
    console.error('Reranking error:', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json({ error: 'Failed to rerank results' }, { status: 500 })
  }
} 