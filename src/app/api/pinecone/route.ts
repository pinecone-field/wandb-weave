import { Pinecone } from '@pinecone-database/pinecone'
import { NextResponse } from 'next/server'
import { Metadata } from '@/types'

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
    console.log('Using model:', model)
    
    // Get index info first to verify dimensions
    const index = pinecone.index(process.env.PINECONE_INDEX_NAME!)
    const indexStats = await index.describeIndexStats()
    console.log('Index stats:', indexStats)
    
    try {
      // Use Pinecone's inference API to generate embeddings
      const embedding = await pinecone.inference.embed(
        model,
        [query],
        { 
          inputType: 'passage',  
          truncate: 'END'
        }
      )

      const values = 'values' in embedding.data[0] 
        ? (embedding.data[0].values as number[])
        : ('indices' in embedding.data[0] && 'values' in embedding.data[0] 
          ? (embedding.data[0].values as number[])
          : [])

      console.log('Generated embedding with dimensions:', values.length)
      const testQuery = {
        vector: values,
        topK: 10,
        includeMetadata: true
      }
      const queryStartTime = performance.now()
      const queryResult = await index.query(testQuery)
      const queryEndTime = performance.now()

      if (!queryResult.matches?.length) {
        return NextResponse.json({
          error: 'No matches found',
          details: 'The query returned no results. This may be due to using a different embedding model than what was used to create the index.',
          modelUsed: model,
          embeddingDimensions: values.length,
          queryLatency: queryEndTime - queryStartTime
        }, { status: 404 })
      }
      
      const fetchedResponses = queryResult.matches.map(match => ({
        id: match.id,
        score: match.score,
        metadata: match.metadata as Metadata,
        latency: queryEndTime - queryStartTime
      }))
      
      const totalTime = performance.now() - startTime
      return NextResponse.json({ 
        responses: fetchedResponses,
        queryDetails: {
          vector: `${values.length}-dimensional vector`,
          topK: testQuery.topK,
          totalLatency: totalTime,
          queryLatency: queryEndTime - queryStartTime,
          modelUsed: model
        }
      })
    } catch (embeddingError) {
      console.error('Embedding generation error:', embeddingError)
      return NextResponse.json({
        error: 'Failed to generate embeddings',
        details: embeddingError instanceof Error ? embeddingError.message : 'Unknown embedding error',
        modelUsed: model
      }, { status: 400 })
    }
  } catch (error) {
    console.error('Pinecone API error:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch responses',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 