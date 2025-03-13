'use client'

import { useState } from 'react'
import { PineconeResponse, RerankResponse, WeaveEvaluation, EvaluationResult } from '@/types'

interface QueryDetails {
  vector: string
  topK: number
  totalLatency: number
  queryLatency: number
  modelUsed?: string
}

interface EmbeddingModel {
  id: string
  name: string
  dimensions: number
  description: string
}

interface ErrorResponse {
  error: string
  details: string
  modelUsed?: string
  embeddingDimensions?: number
  queryLatency?: number
}

const COMPATIBLE_MODELS: EmbeddingModel[] = [
  {
    id: "llama-text-embed-v2",
    name: "Llama Text Embed v2",
    dimensions: 1024,
    description: "High-performance dense embedding model optimized for text retrieval and ranking tasks"
  },
  {
    id: "multilingual-e5-large",
    name: "Multilingual E5 Large",
    dimensions: 1024,
    description: "Efficient dense embedding model for multilingual text, works well on messy data and short queries"
  }
]

const truncateText = (text: string, maxLength: number = 50) => {
  const cleanText = text.replace(/[\n\r]+/g, ' ').trim();
  if (cleanText.length <= maxLength) return cleanText;
  return cleanText.slice(0, maxLength) + '...';
};

const decodeUrlText = (text: string): string => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

const MetadataTooltip = ({ label, value }: { label: string, value: string }) => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  // Only decode URLs for ID fields
  const decodedValue = decodeUrlText(value);

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  return (
    <div key={label} className="group relative" onMouseMove={handleMouseMove}>
      <span className="font-medium text-xs">{label}:</span>
      <p className="text-xs break-words whitespace-pre-wrap">
        {truncateText(decodedValue)}
      </p>
      
      <div className="fixed z-10 invisible group-hover:visible bg-gray-900 text-white p-4 rounded 
                      text-sm whitespace-pre-wrap break-words shadow-lg
                      leading-relaxed min-w-[40rem] max-w-[40rem]"
           style={{ 
             top: `${mousePos.y}px`, 
             left: `${mousePos.x}px` 
           }}>
        {decodedValue}
      </div>
    </div>
  );
};

interface MetricsSectionProps {
  vector: EvaluationResult;
  rerank: EvaluationResult | null;
}

const MetricsSection = ({ vector, rerank }: MetricsSectionProps) => (
  <div className="bg-white p-6 rounded-lg border">
    <h3 className="text-xl font-semibold mb-4">LLM Evaluation</h3>
    <div className="space-y-6">
      <div>
        <h4 className="text-lg font-medium mb-2">Vector Search Results</h4>
        <div className="grid grid-cols-1 gap-6">
          <div>
            <p className="text-sm font-medium text-gray-600">Relevance</p>
            <p className="text-2xl">{(vector.relevance * 100).toFixed(1)}%</p>
            <p className="text-sm text-gray-500 mt-1">{vector.explanations.relevance}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">Diversity</p>
            <p className="text-2xl">{(vector.diversity * 100).toFixed(1)}%</p>
            <p className="text-sm text-gray-500 mt-1">{vector.explanations.diversity}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">Coverage</p>
            <p className="text-2xl">{(vector.coverage * 100).toFixed(1)}%</p>
            <p className="text-sm text-gray-500 mt-1">{vector.explanations.coverage}</p>
          </div>
        </div>
      </div>

      {rerank && (
        <div>
          <h4 className="text-lg font-medium mb-2">Reranked Results</h4>
          <div className="grid grid-cols-1 gap-6">
            <div>
              <p className="text-sm font-medium text-gray-600">Relevance</p>
              <p className="text-2xl">{(rerank.relevance * 100).toFixed(1)}%</p>
              <p className="text-sm text-gray-500 mt-1">{rerank.explanations.relevance}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Diversity</p>
              <p className="text-2xl">{(rerank.diversity * 100).toFixed(1)}%</p>
              <p className="text-sm text-gray-500 mt-1">{rerank.explanations.diversity}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Coverage</p>
              <p className="text-2xl">{(rerank.coverage * 100).toFixed(1)}%</p>
              <p className="text-sm text-gray-500 mt-1">{rerank.explanations.coverage}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
);

const SafeMetricsSection = ({ vectorEvaluation }: { vectorEvaluation: WeaveEvaluation | null }) => {
  try {
    console.log('Attempting to render metrics with:', vectorEvaluation);
    
    if (!vectorEvaluation?.metrics) {
      console.log('No metrics available in evaluation data');
      return null;
    }

    return (
      <MetricsSection
        vector={vectorEvaluation.metrics.vector}
        rerank={vectorEvaluation.metrics.rerank}
      />
    );
  } catch (error) {
    console.error('Error rendering metrics:', error);
    return (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
        <p className="text-yellow-700">Unable to display metrics: {String(error)}</p>
      </div>
    );
  }
};

const SafeResultsSummary = ({ vectorEvaluation, responses }: { 
  vectorEvaluation: WeaveEvaluation | null;
  responses: PineconeResponse[];
}) => {
  try {
    if (!vectorEvaluation?.metrics?.vector) {
      return null;
    }

    return (
      <div className="p-4 border rounded-lg bg-gray-50">
        <h3 className="text-lg font-medium mb-4">Overall Results Summary</h3>
        <p className="text-sm text-gray-600 mb-4">Search Results ({responses.length})</p>
        
        <div className="grid md:grid-cols-2 gap-6">
          {/* Vector Search Column */}
          <div>
            <h4 className="text-md font-medium mb-4">Vector Search</h4>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-600">Relevance</p>
                <p className="text-2xl">
                  {(vectorEvaluation.metrics.vector.relevance * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Diversity</p>
                <p className="text-2xl">
                  {(vectorEvaluation.metrics.vector.diversity * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Coverage</p>
                <p className="text-2xl">
                  {(vectorEvaluation.metrics.vector.coverage * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          {/* Reranked Results Column */}
          {vectorEvaluation.metrics.rerank && (
            <div>
              <h4 className="text-md font-medium mb-4">Reranked Results</h4>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-600">Relevance</p>
                  <p className="text-2xl">
                    {(vectorEvaluation.metrics.rerank.relevance * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Diversity</p>
                  <p className="text-2xl">
                    {(vectorEvaluation.metrics.rerank.diversity * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Coverage</p>
                  <p className="text-2xl">
                    {(vectorEvaluation.metrics.rerank.coverage * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error rendering results summary:', error);
    return null;
  }
};

export default function WeaveEvaluator() {
  const [responses, setResponses] = useState<PineconeResponse[]>([])
  const [queryDetails, setQueryDetails] = useState<QueryDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [queryText, setQueryText] = useState("This is an example query.")
  const [selectedModel, setSelectedModel] = useState(COMPATIBLE_MODELS[0])
  const [rerankedResults, setRerankedResults] = useState<RerankResponse[]>([])
  const [error, setError] = useState<ErrorResponse | null>(null)
  const [vectorEvaluation, setVectorEvaluation] = useState<WeaveEvaluation | null>(null)
  const [llmLoading, setLlmLoading] = useState(false)

  const fetchAndEvaluate = async () => {
    setError(null)
    setResponses([])
    setQueryDetails(null)
    setVectorEvaluation(null)
    setRerankedResults([])
    
    setLoading(true)
    setLlmLoading(true)
    try {
      // First get vector search results
      const res = await fetch(`/api/pinecone?q=${encodeURIComponent(queryText)}&model=${selectedModel.id}`)
      const data = await res.json()
      
      if ('error' in data) {
        setError(data)
        return
      }

      // Set vector search results
      setResponses(data.responses)
      setQueryDetails(data.queryDetails)
      
      // Then get reranking results
      const rerankRes = await fetch('/api/rerank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryText,
          documents: data.responses
        })
      })
      const rerankData = await rerankRes.json()
      setRerankedResults(rerankData.reranked)
      
      // Finally get evaluation
      const payload = {
        query: queryText,
        vector_results: data.responses,
        reranked_results: rerankData.reranked,
        model_name: selectedModel.id,
        index_name: process.env.PINECONE_INDEX_NAME,
        top_k: 10,
        rerank_model: "cross-encoder/ms-marco-MiniLM-L-6-v2"
      };
      console.log("Sending to /api/wandb:", payload);

      const evalRes = await fetch('/api/wandb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const responseText = await evalRes.text();
      console.log("Response from /api/wandb:", responseText);
      try {
        const evalData = JSON.parse(responseText);
        setVectorEvaluation(evalData);
        
        // We're now getting results from the original request, not from evalData
        setResponses(data.responses);
        setRerankedResults(rerankData.reranked);
      } catch (e) {
        console.error("Failed to parse response:", e);
      }

    } catch (error) {
      setError({
        error: 'Request failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      })
    }
    setLoading(false)
    setLlmLoading(false)
  }

  return (
    <div className="space-y-6">
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
          <p className="text-xs text-amber-600">
            Note: Only Llama Text Embed v2 is currently compatible with the index. Other models may return no results.
          </p>
        </div>

        <textarea
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          placeholder="Enter your query here..."
          className="w-full p-3 border rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px] resize-none"
        />
        <div className="flex justify-center">
          <button
            onClick={fetchAndEvaluate}
            disabled={loading || !queryText.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:bg-gray-400"
          >
            Query and Evaluate
          </button>
        </div>

        {queryDetails && (
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-medium mb-4 text-center">Query Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 text-sm">
                <p><span className="font-medium">Vector:</span> {queryDetails.vector}</p>
                <p><span className="font-medium">Model:</span> {queryDetails.modelUsed}</p>
                <p><span className="font-medium">Top K:</span> {queryDetails.topK}</p>
              </div>
              <div className="space-y-2 text-sm">
                <p><span className="font-medium">Query Latency:</span> {queryDetails.queryLatency.toFixed(2)}ms</p>
                {rerankedResults.length > 0 && (
                  <p><span className="font-medium">Rerank Latency:</span> {rerankedResults[0]?.latency.toFixed(2)}ms</p>
                )}
                <p><span className="font-medium">Total Latency:</span> {queryDetails.totalLatency.toFixed(2)}ms</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          {loading && !llmLoading && (
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto" />
              <p className="mt-2">Searching...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">{error.error}</h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{error.details}</p>
                    {error.modelUsed && (
                      <p className="mt-1">Model used: {error.modelUsed}</p>
                    )}
                    {error.embeddingDimensions && (
                      <p className="mt-1">Embedding dimensions: {error.embeddingDimensions}</p>
                    )}
                    {error.queryLatency && (
                      <p className="mt-1">Query latency: {error.queryLatency.toFixed(2)}ms</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {responses.length > 0 && (
            <div className="bg-white p-6 rounded-lg border">
              <h3 className="text-xl font-semibold mb-4">Top 3 Vector Search Results</h3>
              <div className="space-y-4">
                {responses.slice(0, 3).map((response, index) => (
                  <div key={response.id} className="p-4 border rounded-lg">
                    <p className="text-sm text-gray-500">Response {index + 1} of {responses.length}</p>
                    <p className="mt-2">
                      <span className="font-medium">ID:</span> {decodeUrlText(response.id)}
                    </p>
                    <p className="mt-2">
                      <span className="font-medium">Vector Similarity:</span> {(response.score * 100).toFixed(1)}%
                    </p>
                    {vectorEvaluation?.individual_scores && (
                      <p className="mt-2">
                        <span className="font-medium">LLM Relevance:</span> {(vectorEvaluation.individual_scores[index].relevance * 100).toFixed(1)}%
                      </p>
                    )}
                    {response.metadata && Object.entries(response.metadata).map(([key, value]) => (
                      value && <MetadataTooltip key={key} label={key} value={value} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {rerankedResults.length > 0 && (
            <div className="bg-white p-6 rounded-lg border">
              <h3 className="text-xl font-semibold mb-4">Top 3 Reranked Results</h3>
              <div className="space-y-4">
                {rerankedResults.slice(0, 3).map((result, index) => (
                  <div key={result.id} className="p-4 border rounded-lg">
                    <p className="text-sm text-gray-500">Result {index + 1} of {rerankedResults.length}</p>
                    <p className="mt-2">
                      <span className="font-medium">ID:</span> {decodeUrlText(result.id)}
                    </p>
                    <p className="mt-2">
                      <span className="font-medium">Rerank Score:</span> {(result.rerank_score * 100).toFixed(1)}%
                    </p>
                    {result.metadata && Object.entries(result.metadata).map(([key, value]) => (
                      value && <MetadataTooltip key={key} label={key} value={value} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          {llmLoading && (
            <div className="text-center p-6 bg-white rounded-lg border">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
              <p className="mt-2 text-gray-600">Evaluating results with GPT-4...</p>
            </div>
          )}

          {!llmLoading && (
            <>
              {vectorEvaluation && <SafeMetricsSection vectorEvaluation={vectorEvaluation} />}
              {vectorEvaluation && <SafeResultsSummary vectorEvaluation={vectorEvaluation} responses={responses} />}
              {vectorEvaluation?.leaderboard_url && (
                <div className="text-center">
                  <a 
                    href={vectorEvaluation.leaderboard_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    View Results on Leaderboard →
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
} 