from python_engine.vector_store import InMemoryVectorStore,VectorRecord
def test_vector_store_returns_best_match():
 s=InMemoryVectorStore();s.upsert(VectorRecord('a',[1.0,0.0],{}));s.upsert(VectorRecord('b',[0.0,1.0],{}));assert s.search([1.0,0.0],1)[0][0].id=='a'
