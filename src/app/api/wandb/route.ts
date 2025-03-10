import { NextResponse } from 'next/server'
import { PineconeResponse } from '@/types'

export async function POST(request: Request) {
  try {
    const { responses, rerankedResults, query } = await request.json()
    console.log('wandb route received:', { query, responseCount: responses.length })
    
    // Get host from request URL for internal API calls
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https'
    const host = request.headers.get('host') || 'localhost:3000'
    const baseUrl = `${protocol}://${host}`
    
    // Vector search evaluation
    const vectorEvaluation = await evaluateResults(baseUrl, query, responses, 'vector-search')
    console.log('Vector evaluation:', vectorEvaluation)

    // Reranking evaluation (if available)
    let rerankEvaluation = null
    if (rerankedResults?.length) {
      rerankEvaluation = await evaluateResults(baseUrl, query, rerankedResults, 'reranked')
      console.log('Rerank evaluation:', rerankEvaluation)
    }

    return NextResponse.json({
      vectorEvaluation: vectorEvaluation,
      rerankEvaluation: rerankEvaluation
    })
  } catch (error) {
    console.error('Evaluation error:', error)
    return NextResponse.json({ error: 'Failed to evaluate responses' }, { status: 500 })
  }
}

async function evaluateResults(baseUrl: string, query: string, results: PineconeResponse[], model_name: string) {
  const weaveResponse = await fetch('http://127.0.0.1:5328/cgi-bin/weave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, results, model_name })
  })

  if (!weaveResponse.ok) {
    const errorText = await weaveResponse.text()
    throw new Error(`Weave evaluation failed: ${weaveResponse.statusText}\n${errorText}`)
  }

  return weaveResponse.json()
} 