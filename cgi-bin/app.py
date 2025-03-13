from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import weave
import logging
from typing import List, Dict
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer
import os
import numpy as np
from sentence_transformers import CrossEncoder
from openai import AsyncOpenAI
import json
import wandb
from datetime import datetime
from dotenv import load_dotenv
from pathlib import Path

# Get path to .env.local in project root
root_dir = Path(__file__).parent.parent
env_path = root_dir / '.env.local'

# Load .env.local specifically
load_dotenv(dotenv_path=env_path)

app = FastAPI()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WeaveRequest(BaseModel):
    query: str
    vector_results: List[Dict]
    reranked_results: List[Dict] = []
    model_name: str
    index_name: str = os.getenv("PINECONE_INDEX_NAME")
    top_k: int = Field(default=10)
    rerank_model: str = Field(default="cross-encoder/ms-marco-MiniLM-L-6-v2")

class SearchModel(weave.Model, BaseModel):
    embedding_model: str = Field(...)
    index_name: str = Field(...)
    top_k: int = Field(default=10)
    rerank_model: str = Field(default="cross-encoder/ms-marco-MiniLM-L-6-v2")

    def __init__(self, **data):
        super().__init__(**data)  # Initialize BaseModel
        self.encoder = SentenceTransformer(self.embedding_model)
        self.reranker = CrossEncoder(self.rerank_model)
        self.pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
        self.index = self.pc.Index(self.index_name)

    @weave.op()
    async def predict(self, query: str) -> Dict:
        # Get embeddings
        query_embedding = self.encoder.encode(query)
        
        # Vector search
        vector_results = self.index.query(
            vector=query_embedding.tolist(),
            top_k=self.top_k,
            include_metadata=True
        )

        # Rerank if available
        reranked_results = await self.rerank_results(query, vector_results.matches)

        return {
            "vector_results": vector_results.matches,
            "reranked_results": reranked_results,
            "latency": vector_results.latency
        }

    async def rerank_results(self, query: str, results: List[Dict]) -> List[Dict]:
        pairs = [(query, result["metadata"].get("text", "")) for result in results]
        scores = self.reranker.predict(pairs)
        
        reranked = []
        for score, result in zip(scores, results):
            reranked.append({
                **result,
                "rerank_score": float(score),
                "score_spread": float(score) - result["score"]
            })
        return sorted(reranked, key=lambda x: x["rerank_score"], reverse=True)

@weave.op()
async def predict(result: Dict) -> Dict:
    """Process each result before scoring"""
    return {
        "score": result.get("score", 0),
        "latency": result.get("latency", 0),
        "metadata": result.get("metadata", {})
    }

@weave.op()
def evaluate_search(model_output: Dict) -> Dict:
    """Evaluate both vector search and reranking"""
    vector_results = model_output["vector_results"]
    reranked_results = model_output["reranked_results"]
    
    return {
        "vector": {
            "ndcg": np.mean([r["score"] for r in vector_results]),
            "diversity": len(set(r["metadata"].get("text", "") for r in vector_results)) / len(vector_results),
            "latency": model_output["latency"]
        },
        "rerank": {
            "ndcg": np.mean([r["rerank_score"] for r in reranked_results]),
            "score_spread": np.mean([r["score_spread"] for r in reranked_results]),
            "latency": sum(r.get("latency", 0) for r in reranked_results) / len(reranked_results)
        }
    }

class SearchEvaluator:
    def __init__(self):
        self.client = AsyncOpenAI()
        # Use raw string to avoid any escape sequence issues
        self.eval_prompt = r"""You are evaluating search results for relevance and diversity.

Query: {query}

Results to evaluate:
{results}

Please evaluate these results on:
1. Relevance: How well do the results answer the query? (0-1 score)
2. Diversity: How diverse and non-redundant are the results? (0-1 score)
3. Coverage: How well do the results cover different aspects of the query? (0-1 score)

Return a JSON object with this exact structure:
{{
  "relevance": <float 0-1>,
  "diversity": <float 0-1>,
  "coverage": <float 0-1>,
  "explanations": {{
    "relevance": "<explanation>",
    "diversity": "<explanation>",
    "coverage": "<explanation>"
  }}
}}"""

    async def evaluate_results(self, query: str, results: List[Dict]) -> Dict:
        try:
            formatted_results = "\n".join([
                f"Result {i+1}:\n{r['metadata'].get('text', '')[:500]}..."  
                for i, r in enumerate(results)
            ])
            
            logger.info(f"Query: {query}")
            logger.info(f"Evaluating {len(results)} results")
            
            prompt = self.eval_prompt.format(
                query=query,
                results=formatted_results
            )

            response = await self.client.chat.completions.create(
                model="gpt-4-1106-preview",
                messages=[{
                    "role": "user",
                    "content": prompt
                }],
                response_format={ "type": "json_object" }
            )

            return json.loads(response.choices[0].message.content)
        except Exception as e:
            logger.error(f"Evaluation error: {str(e)}", exc_info=True)
            raise

def get_run_name(query: str, model_name: str) -> str:
    # Clean the query - remove special chars and spaces
    clean_query = "".join(c for c in query if c.isalnum() or c.isspace()).strip()
    # Truncate query to fit within limit, leaving room for timestamp and model name
    max_query_length = 80  # 128 - (len("2024-03-12-13:15:18") + len("-pinecone-docs-") + buffer)
    truncated_query = clean_query[:max_query_length] + ("..." if len(clean_query) > max_query_length else "")
    timestamp = datetime.now().strftime('%Y-%m-%d-%H:%M:%S')
    return f"{truncated_query}-{model_name}-{timestamp}"

@app.post("/cgi-bin/weave")
async def evaluate(request: WeaveRequest):
    run = None
    try:
        run_name = get_run_name(request.query, request.model_name)
        
        (entity, project) = (os.getenv("WANDB_ENTITY"), os.getenv("WEAVE_PROJECT"))
        logger.info(f"Initializing W&B run with: entity={entity}, project={project}")
        
        # Initialize W&B with error handling
        try:
            run = wandb.init(
                entity=entity,
                project=project,
                name=run_name,
                reinit=True,
                settings=wandb.Settings(
                    start_method="thread",
                    _disable_stats=True
                ),
                config={
                    "model": request.model_name,
                    "index": request.index_name,
                    "top_k": request.top_k,
                    "rerank_model": request.rerank_model
                }
            )
            logger.info(f"W&B run initialized successfully: {run.name}")
        except Exception as e:
            logger.error(f"W&B initialization failed: {str(e)}", exc_info=True)
            logger.debug(f"W&B parameters: entity='{entity}', project='{project}', name='{run_name}'")
            raise HTTPException(
                status_code=500,
                detail=f"W&B initialization failed: {str(e)}"
            )

        evaluator = SearchEvaluator()
        
        # Get evaluations
        vector_eval = await evaluator.evaluate_results(
            request.query, 
            request.vector_results
        )
        logger.info(f"Vector evaluation result: {json.dumps(vector_eval)}")

        rerank_eval = None
        if request.reranked_results:
            rerank_eval = await evaluator.evaluate_results(
                request.query,
                request.reranked_results
            )

        # Log to W&B with error handling
        try:
            wandb.log({
                "query": request.query,
                "vector_relevance": vector_eval["relevance"],
                "vector_diversity": vector_eval["diversity"],
                "vector_coverage": vector_eval["coverage"],
                "rerank_relevance": rerank_eval["relevance"] if rerank_eval else None,
                "rerank_diversity": rerank_eval["diversity"] if rerank_eval else None,
                "rerank_coverage": rerank_eval["coverage"] if rerank_eval else None,
            })
            logger.info("Successfully logged metrics to W&B")
        except Exception as e:
            logger.error(f"W&B logging failed: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"W&B logging failed: {str(e)}"
            )

        # Get leaderboard URL with error handling
        try:
            leaderboard_url = f"https://wandb.ai/{run.entity}/{run.project}/leaderboard"
            logger.info(f"Generated leaderboard URL: {leaderboard_url}")
        except Exception as e:
            logger.error(f"Failed to generate leaderboard URL: {e}", exc_info=True)
            leaderboard_url = None

        # Return response with direct evaluation results
        response_data = {
            "metrics": {
                "vector": vector_eval,
                "rerank": rerank_eval
            },
            "leaderboard_url": leaderboard_url
        }

        # Finish W&B run with error handling
        try:
            if wandb.run is not None:
                wandb.finish()
                logger.info("W&B run finished successfully")
        except Exception as e:
            logger.error(f"W&B finish failed: {str(e)}", exc_info=True)

        return response_data

    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        # Ensure W&B run is finished even on error
        try:
            if wandb.run is not None:
                wandb.finish()
        except Exception as finish_error:
            logger.error(f"Failed to finish W&B run on error: {str(finish_error)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Evaluation failed: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    try:
        uvicorn.run(app, host="127.0.0.1", port=5328)
    except KeyboardInterrupt:
        logger.error("Server shutting down...")
        exit(0) 