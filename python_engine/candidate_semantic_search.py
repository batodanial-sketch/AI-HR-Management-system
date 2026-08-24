from __future__ import annotations
from python_engine.embeddings_generator import generate_embedding
from python_engine.vector_store import InMemoryVectorStore

def semantic_search(store:InMemoryVectorStore,query:str,limit:int=10): return store.search(generate_embedding(query),limit)
