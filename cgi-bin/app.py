from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import weave
import logging
from typing import List, Dict
import numpy as np
from sentence_transformers import SentenceTransformer
from weave import Scorer, op
from dataclasses import dataclass

app = FastAPI()
logging.basicConfig(level=logging.ERROR)
logger = logging.getLogger(__name__)
model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')

class WeaveRequest(BaseModel):
    query: str
    results: List[Dict]
    model_name: str

@weave.op()
def evaluate_result(query: str, metadata: Dict) -> float:
    # Combine title and text for comparison
    text = metadata.get('text', '')
    title = metadata.get('title', '')
    full_text = f"{title} {text}".strip()
    
    # Get embeddings and compute similarity
    query_emb = model.encode(query)
    result_emb = model.encode(full_text)
    similarity = np.dot(query_emb, result_emb) / (np.linalg.norm(query_emb) * np.linalg.norm(result_emb))
    
    return float(similarity)

@app.post("/cgi-bin/weave")
async def evaluate(request: WeaveRequest):
    try:
        weave.init("weave-evaluator")
        
        evaluation = weave.Evaluation(
            name="Query Result Relevance",
            dataset=request.results,
            scorers=[evaluate_result]
        )
        
        results = evaluation.run()
        return results

    except Exception as e:
        logger.error(f"Weave evaluation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    try:
        uvicorn.run(app, host="127.0.0.1", port=5328)
    except KeyboardInterrupt:
        logger.error("Server shutting down...")
        exit(0) 