# Weave Search Evaluator

A tool for evaluating and comparing vector search results with reranked results, using Pinecone for vector search and Weights & Biases (W&B) for tracking and evaluation.

## Features

- Vector similarity search using Pinecone
- Cross-encoder reranking for improved relevance
- Real-time evaluation metrics:
  - Similarity scores
  - Response latency
  - Average relevance
  - Result consistency
- Interactive metadata exploration with hover tooltips
- Support for multiple embedding models:
  - Llama Text Embed v2
  - GPT-4 Turbo
  - E5 Large v2
  - Cohere Embed v3.0

## Getting Started

### Prerequisites

- Node.js 18+
- Pinecone API key
- Weights & Biases account

### Environment Setup

Create a `.env.local` file with:

```bash
PINECONE_API_KEY=your_pinecone_key
WANDB_API_KEY=your_wandb_key
WANDB_PROJECT=your_project_name
```

### Installation

```bash
npm install
npm run dev
```

## How It Works

1. **Vector Search**:
   - Converts query text to embeddings using selected model
   - Performs similarity search using Pinecone
   - Returns top K most similar documents

2. **Reranking**:
   - Takes initial vector search results
   - Uses cross-encoder model to rerank based on semantic similarity
   - Provides more contextually relevant ordering

3. **Evaluation**:
   - Calculates similarity scores and relevance metrics
   - Tracks performance with W&B
   - Compares vector search vs reranked results

## API Routes

- `/api/pinecone`: Handles vector similarity search
- `/api/rerank`: Performs cross-encoder reranking
- `/api/wandb`: Logs evaluation metrics and results

## Component Structure

The main `WeaveEvaluator` component provides:

- Model selection
- Query input
- Results display with metrics
- Interactive metadata exploration
- Side-by-side comparison of vector and reranked results

## Metrics Explained

- **Similarity Score**: Direct measure of vector similarity (0-1)
- **Response Time**: Latency in milliseconds
- **Average Relevance**: Combined score from vector and rerank results
- **Result Consistency**: Variation in scores across results

## Contributing

Pull requests welcome! Please ensure you update tests as appropriate.

## License

MIT
