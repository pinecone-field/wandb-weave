'use client'

import { useState } from 'react'
import { PineconeResponse, RerankResponse, Metadata } from '@/types'

interface QueryDetails {
  vector: string
  topK: number
  totalLatency: number
  queryLatency: number
}

interface Evaluation {
  response: PineconeResponse
  score: number
  metrics: Record<string, number>
}

interface EmbeddingModel {
  id: string
  name: string
  dimensions: number
  description: string
}

const COMPATIBLE_MODELS: EmbeddingModel[] = [
  {
    id: "llama-text-embed-v2",
    name: "Llama Text Embed v2",
    dimensions: 1024,
    description: "Meta's Llama 2 embedding model optimized for semantic similarity"
  },
  {
    id: "gpt-4-1106-preview",
    name: "GPT-4 Turbo",
    dimensions: 1024,
    description: "Latest GPT-4 model with enhanced embedding capabilities"
  },
  {
    id: "e5-large-v2",
    name: "E5 Large v2",
    dimensions: 1024,
    description: "Efficient and accurate text embeddings"
  },
  {
    id: "cohere-embed-english-v3.0",
    name: "Cohere Embed v3.0",
    dimensions: 1024,
    description: "Optimized for English text similarity"
  }
]

const truncateText = (text: string, maxLength: number = 50) => {
  const cleanText = text.replace(/[\n\r]+/g, ' ').trim();
  if (cleanText.length <= maxLength) return cleanText;
  return cleanText.slice(0, maxLength) + '...';
};

const MetadataTooltip = ({ label, value }: { label: string, value: string }) => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  return (
    <div key={label} className="group relative" onMouseMove={handleMouseMove}>
      <span className="font-medium text-xs">{label}:</span>
      <p className="text-xs break-words whitespace-pre-wrap">
        {truncateText(value)}
      </p>
      
      <div className="fixed z-10 invisible group-hover:visible bg-gray-900 text-white p-4 rounded 
                      text-sm whitespace-pre-wrap break-words shadow-lg
                      leading-relaxed min-w-[40rem] max-w-[40rem]"
           style={{ 
             top: `${mousePos.y}px`, 
             left: `${mousePos.x}px` 
           }}>
        {value}
      </div>
    </div>
  );
};

// Create a shared metrics component
const MetricsSection = ({ 
  score, 
  latency, 
  avgRelevance, 
  scoreSpread,
  evaluationScore 
}: {
  score: number,
  latency: number,
  avgRelevance: number,
  scoreSpread: number,
  evaluationScore: number
}) => (
  <div className="mt-4 pt-4 border-t">
    <div className="space-y-4">
      <div>
        <p className="text-lg font-medium mb-1">
          Evaluation Score: {evaluationScore.toFixed(4)}
        </p>
        <p className="text-sm text-gray-500">
          Overall relevance score based on semantic similarity and content matching
        </p>
      </div>

      <div className="space-y-2">
        <h4 className="text-lg font-medium">Performance Metrics:</h4>
        <div className="space-y-2">
          <div>
            <p className="text-sm">
              <span className="font-medium">Similarity Score:</span>{' '}
              <span className={score > 0.5 ? 'text-green-600' : 'text-gray-600'}>
                {(score * 100).toFixed(1)}%
              </span>
            </p>
            <p className="text-xs text-gray-500">
              Direct measure of semantic match with query
            </p>
          </div>

          <div>
            <p className="text-sm">
              <span className="font-medium">Response Time:</span>{' '}
              <span className={latency < 500 ? 'text-green-600' : 'text-yellow-600'}>
                {latency.toFixed(2)}ms
              </span>
            </p>
            <p className="text-xs text-gray-500">
              {latency < 500 ? '✓ Within performance target' : '⚠️ Above target latency'}
            </p>
          </div>

          <div>
            <p className="text-sm">
              <span className="font-medium">Average Relevance:</span>{' '}
              <span className="text-gray-600">
                {(avgRelevance * 100).toFixed(1)}%
              </span>
            </p>
            <p className="text-xs text-gray-500">
              Based on semantic similarity to query
            </p>
          </div>

          <div>
            <p className="text-sm">
              <span className="font-medium">Result Consistency:</span>{' '}
              <span className={scoreSpread < 0.3 ? 'text-green-600' : 'text-yellow-600'}>
                {(scoreSpread * 100).toFixed(1)}% variation
              </span>
            </p>
            <p className="text-xs text-gray-500">
              Lower variation suggests more consistent relevance
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default function WeaveEvaluator() {
  const [responses, setResponses] = useState<PineconeResponse[]>([])
  const [queryDetails, setQueryDetails] = useState<QueryDetails | null>(null)
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(false)
  const [queryText, setQueryText] = useState("This is an example query.")
  const [selectedModel, setSelectedModel] = useState(COMPATIBLE_MODELS[0])
  const [rerankedResults, setRerankedResults] = useState<RerankResponse[]>([])

  const fetchResponses = async () => {
    console.log('Starting fetchResponses')
    setLoading(true)
    try {
      console.log('Fetching from /api/pinecone with model:', selectedModel.id)
      const res = await fetch(
        `/api/pinecone?q=${encodeURIComponent(queryText)}&model=${selectedModel.id}`
      )
      console.log('Pinecone response:', res.status)
      const data = await res.json()
      console.log('Pinecone data:', data)
      setResponses(data.responses)
      setQueryDetails(data.queryDetails)
    } catch (error) {
      console.error('Error fetching responses:', error)
    }
    setLoading(false)
  }

  const evaluateResponses = async () => {
    console.log('Starting evaluateResponses with:', responses)
    setLoading(true)
    try {
      console.log('Posting to /api/wandb')
      const res = await fetch('/api/wandb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          responses,
          rerankedResults,
          query: queryText
        })
      })
      console.log('W&B response:', res.status)
      const data = await res.json()
      console.log('W&B data:', data)
      
      // Map vector search evaluations using Weave scores
      setEvaluations(responses.map(response => ({
        response,
        score: response.score,
        metrics: {
          latency: response.latency,
          avg_similarity: data.vector_evaluation?.metrics?.mean_score || 0,
          score_spread: data.vector_evaluation?.metrics?.std_score || 0
        }
      })))

    } catch (error) {
      console.error('Error evaluating responses:', error)
    }
    setLoading(false)
  }

  const rerankResponses = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/rerank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryText,
          documents: responses
        })
      })
      const data = await res.json()
      setRerankedResults(data.reranked)
    } catch (error) {
      console.error('Error reranking:', error)
    }
    setLoading(false)
  }

  return (
    <div className="space-y-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex flex-col space-y-2">
          <label htmlFor="model" className="text-sm font-medium text-gray-700">
            Embedding Model
          </label>
          <select
            id="model"
            value={selectedModel.id}
            onChange={(e) => setSelectedModel(COMPATIBLE_MODELS.find(m => m.id === e.target.value) || COMPATIBLE_MODELS[0])}
            className="w-full p-2 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {COMPATIBLE_MODELS.map(model => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
          <p className="text-sm text-gray-500">{selectedModel.description}</p>
        </div>

        <textarea
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          placeholder="Enter your query here..."
          className="w-full p-3 border rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[100px]"
        />
        <div className="flex gap-4 justify-center">
          <button
            onClick={fetchResponses}
            disabled={loading || !queryText.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:bg-gray-400"
          >
            Fetch Responses
          </button>
          <button
            onClick={async () => {
              await evaluateResponses()
              await rerankResponses()
            }}
            disabled={loading || !responses?.length}
            className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:bg-gray-400"
          >
            Evaluate & Rerank
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto" />
          <p className="mt-2">Loading...</p>
        </div>
      )}

      {queryDetails && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-medium mb-2">Query Details</h3>
          <div className="space-y-2 text-sm">
            <p><span className="font-medium">Vector:</span> {queryDetails.vector}</p>
            <p><span className="font-medium">Top K:</span> {queryDetails.topK}</p>
            <p><span className="font-medium">Total Latency:</span> {queryDetails.totalLatency.toFixed(2)}ms</p>
            <p><span className="font-medium">Query Latency:</span> {queryDetails.queryLatency.toFixed(2)}ms</p>
          </div>
        </div>
      )}

      {evaluations.length > 0 && (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Vector Search Results */}
            <div className="bg-white p-6 rounded-lg border">
              <h3 className="text-xl font-semibold mb-4">Top 3 Vector Search Results</h3>
              <div className="space-y-4">
                {evaluations.slice(0, 3).map((evaluation, index) => (
                  <div key={index} className="p-6 border rounded-lg shadow-sm min-h-[600px] flex flex-col">
                    <div className="flex-1">
                      <h3 className="font-medium mb-4">Response {index + 1} of {evaluations.length}</h3>
                      <div className="text-sm text-gray-600 space-y-2">
                        <div>
                          <span className="font-medium">ID:</span>
                          <p className="break-all text-xs mt-1">{evaluation.response?.id || 'N/A'}</p>
                        </div>
                        
                        <p>
                          <span className="font-medium">Similarity Score:</span>{' '}
                          {evaluation.response?.score ? evaluation.response.score.toFixed(4) : 'N/A'}
                        </p>
                        
                        <p>
                          <span className="font-medium">Latency:</span>{' '}
                          {evaluation.response?.latency ? `${evaluation.response.latency.toFixed(2)}ms` : 'N/A'}
                        </p>
                        
                        {Object.entries(evaluation.response.metadata as Metadata).map(([key, value]) => (
                          <MetadataTooltip key={key} label={key} value={value as string} />
                        ))}
                      </div>

                      <MetricsSection
                        score={evaluation.response.score}
                        latency={evaluation.metrics.latency}
                        avgRelevance={evaluation.metrics.avg_similarity}
                        scoreSpread={evaluation.metrics.score_spread}
                        evaluationScore={evaluation.score}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Reranked Results */}
            <div className="bg-white p-6 rounded-lg border">
              <h3 className="text-xl font-semibold mb-4">Top 3 Reranked Results</h3>
              <div className="space-y-4">
                {rerankedResults?.map((result, index) => (
                  <div key={index} className="p-6 border rounded-lg shadow-sm min-h-[600px] flex flex-col">
                    <div className="flex-1">
                      <h3 className="font-medium mb-4">Result {index + 1} of {rerankedResults.length}</h3>
                      <div className="text-sm text-gray-600 space-y-2">
                        <div>
                          <span className="font-medium">ID:</span>
                          <p className="break-all text-xs mt-1">{result.id}</p>
                        </div>
                        
                        <p>
                          <span className="font-medium">Similarity Score:</span>{' '}
                          {result.score.toFixed(4)}
                        </p>
                        
                        <p>
                          <span className="font-medium">Latency:</span>{' '}
                          {result.latency ? `${result.latency.toFixed(2)}ms` : 'N/A'}
                        </p>

                        {Object.entries(result.metadata as Metadata).map(([key, value]) => (
                          <MetadataTooltip key={key} label={key} value={value as string} />
                        ))}

                        <MetricsSection
                          score={result.score}
                          latency={result.latency}
                          avgRelevance={(result.score + result.rerank_score) / 2}
                          scoreSpread={result.score_spread}
                          evaluationScore={result.rerank_score}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 border rounded-lg">
            <h3 className="text-lg font-medium mb-4">Overall Results Summary (All {evaluations.length} Results)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium">Average Similarity Score</p>
                <p className="text-2xl">{(evaluations.reduce((acc, e) => acc + e.response.score, 0) / evaluations.length * 100).toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-sm font-medium">Average Response Time</p>
                <p className="text-2xl">{(evaluations.reduce((acc, e) => acc + e.metrics.latency, 0) / evaluations.length).toFixed(1)}ms</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 