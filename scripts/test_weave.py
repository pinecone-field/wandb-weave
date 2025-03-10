import weave
import json
import asyncio

async def test_weave():
    print("Testing Weave connection...")
    
    # Sample data that matches our real data structure
    test_results = [
        {
            "score": 0.85,
            "rerank_score": 0.9,
            "latency": 150.5,
            "metadata": {
                "text": "Sample text for testing",
                "title": "Test Document"
            }
        },
        {
            "score": 0.75,
            "rerank_score": 0.8,
            "latency": 160.2,
            "metadata": {
                "text": "Another test document",
                "title": "Test Doc 2"
            }
        }
    ]

    try:
        # Initialize Weave
        weave.init("weave-evaluator")
        
        # Define model function as an Op that matches dataset columns
        @weave.op
        def baseline_model(score: float, rerank_score: float, latency: float):
            return {
                "score": score,
                "rerank_score": rerank_score,
                "latency": latency
            }
        
        # Define scoring function as an Op that receives model output
        @weave.op
        def check_relevance(model_output, score: float, rerank_score: float, latency: float):
            return {
                "semantic_match": model_output["score"],
                "rerank_score": model_output["rerank_score"],
                "latency": model_output["latency"]
            }
        
        # Create evaluation
        evaluation = weave.Evaluation(
            name="Test Search Results",
            dataset=test_results,
            scorers=[check_relevance]
        )
        
        # Run evaluation with our model Op
        results = await evaluation.evaluate(baseline_model)
        print("\nEvaluation successful!")
        print(f"Raw results: {results}")
        
    except Exception as e:
        print(f"\nError testing Weave: {str(e)}")

if __name__ == "__main__":
    asyncio.run(test_weave()) 