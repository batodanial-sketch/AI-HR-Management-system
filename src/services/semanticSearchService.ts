import 'server-only'
import {semanticSearchBridge}from'@/src/lib/ai/vectorSearch'
export async function findSemanticCandidates(query:string,limit=10){if(query.trim().length<3)throw new Error('Semantic search query must contain at least three characters.');return semanticSearchBridge(query.trim(),Math.min(Math.max(limit,1),25))}