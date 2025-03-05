import { Pinecone } from '@pinecone-database/pinecone'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  console.log('Pinecone API route called')
  const startTime = performance.now()
  
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || 'This is an example query.'
    const model = searchParams.get('model') || 'llama-text-embed-v2'
    
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!
    })
    console.log('Pinecone client initialized')
    
    // Get index info first to verify dimensions
    const index = pinecone.index(process.env.PINECONE_INDEX_NAME!)
    const indexStats = await index.describeIndexStats()
    console.log('Index stats:', indexStats)
    
    // Use Pinecone's inference API to generate embeddings
    const embedding = await pinecone.inference.embed(
      model,
      [query],  // Wrap single query in array
      { 
        inputType: 'passage',  
        truncate: 'END'
      }
    )

    console.log('Generated embedding')
    const testQuery = {
      // @ts-expect-error - Pinecone SDK type mismatch with actual response
      vector: embedding.data[0]?.values || [],
      topK: 10,
      includeMetadata: true
    }
    const queryStartTime = performance.now()
    const queryResult = await index.query(testQuery)
    const queryEndTime = performance.now()
    
    const fetchedResponses = queryResult.matches.map(match => ({
      id: match.id,
      score: match.score,
      metadata: match.metadata,
      latency: queryEndTime - queryStartTime
    }))
    
    const totalTime = performance.now() - startTime
    console.log('Query details:', { testQuery, latency: totalTime })
    console.log('Fetched responses:', fetchedResponses)
    
    return NextResponse.json({ 
      responses: fetchedResponses,
      queryDetails: {
        vector: 'Embedding vector (1024 dims)',
        topK: testQuery.topK,
        totalLatency: totalTime,
        queryLatency: queryEndTime - queryStartTime
      }
    })
  } catch (error: any) {
    console.error('Pinecone API error:', {
      message: error.message,
      cause: error.cause,
      stack: error.stack
    })
    return NextResponse.json({ 
      error: 'Failed to fetch responses',
      details: error.message
    }, { status: 500 })
  }
} 