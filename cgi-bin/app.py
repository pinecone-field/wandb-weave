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

app = FastAPI()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WeaveRequest(BaseModel):
    query: str
    vector_results: List[Dict]
    reranked_results: List[Dict] = []
    model_name: str
    index_name: str = "pinecone-docs"
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
        self.eval_prompt = """You are evaluating search results for relevance and diversity.

Query: {query}

Results to evaluate:
{results}

Please evaluate these results on:
1. Relevance: How well do the results answer the query? (0-1 score)
2. Diversity: How diverse and non-redundant are the results? (0-1 score)
3. Coverage: How well do the results cover different aspects of the query? (0-1 score)

Return a JSON object with this exact structure:
{
  "relevance": <float 0-1>,
  "diversity": <float 0-1>,
  "coverage": <float 0-1>,
  "explanations": {
    "relevance": "<explanation>",
    "diversity": "<explanation>",
    "coverage": "<explanation>"
  }
}
"""

    async def evaluate_results(self, query: str, results: List[Dict]) -> Dict:
        formatted_results = "\n".join([
            f"Result {i+1}:\n{r['metadata'].get('text', '')[:500]}..."  
            for i, r in enumerate(results[:3])
        ])

        response = await self.client.chat.completions.create(
            model="gpt-4-1106-preview",
            messages=[{
                "role": "user",
                "content": self.eval_prompt.format(
                    query=query,
                    results=formatted_results
                )
            }],
            response_format={ "type": "json_object" }
        )

        return json.loads(response.choices[0].message.content)

@app.post("/cgi-bin/weave")
async def evaluate(request: WeaveRequest):
    logger.info("=== Starting Weave Evaluation ===")
    logger.info(f"Request payload: {request.model_dump_json()}")

    try:
        evaluator = SearchEvaluator()
        
        # Validate input
        if not request.vector_results:
            logger.error("No vector results provided")
            raise HTTPException(
                status_code=422,
                detail="No vector search results provided for evaluation"
            )

        logger.info(f"Query: {request.query}")
        logger.info(f"Vector results: {json.dumps(request.vector_results[:1])}...")  # First result only
        logger.info(f"Reranked results count: {len(request.reranked_results)}")

        try:
            logger.info("Starting vector evaluation with GPT-4...")
            vector_eval = await evaluator.evaluate_results(
                request.query, 
                request.vector_results
            )
            logger.info(f"Vector evaluation result: {json.dumps(vector_eval)}")
        except Exception as e:
            logger.error(f"Vector evaluation failed: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Vector evaluation failed: {str(e)}"
            )

        rerank_eval = None
        if request.reranked_results:
            try:
                logger.info("Starting rerank evaluation with GPT-4...")
                rerank_eval = await evaluator.evaluate_results(
                    request.query,
                    request.reranked_results
                )
                logger.info(f"Rerank evaluation result: {json.dumps(rerank_eval)}")
            except Exception as e:
                logger.error(f"Rerank evaluation failed: {str(e)}", exc_info=True)
                rerank_eval = None

        try:
            logger.info("Logging to W&B...")
            log_data = {
                "query": request.query,
                "vector_evaluation": vector_eval,
                "rerank_evaluation": rerank_eval,
                "vector_results": request.vector_results,
                "reranked_results": request.reranked_results
            }
            logger.info(f"W&B log data: {json.dumps(log_data)}")
            weave.log(log_data)
            logger.info("Successfully logged to W&B")
        except Exception as e:
            logger.error(f"W&B logging failed: {str(e)}", exc_info=True)

        response_data = {
            "metrics": {
                "vector": vector_eval,
                "rerank": rerank_eval
            }
        }
        logger.info(f"Sending response: {json.dumps(response_data)}")
        logger.info("=== Weave Evaluation Complete ===")
        return response_data

    except HTTPException as he:
        logger.error(f"HTTP Exception: {str(he)}")
        raise he
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
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