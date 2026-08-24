import 'server-only'

import { Groq } from 'groq-sdk'

export const supportedGroqModels = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768'
] as const

export type GroqModel = (typeof supportedGroqModels)[number]

export type GroqClientResult =
  | { success: true; client: Groq; model: GroqModel }
  | { success: false; error: string }

let cachedClient: Groq | null = null
let cachedKey: string | null = null

export function isGroqConfigured() {
  return Boolean(process.env.GROQ_API_KEY)
}

export function getGroqClient(model?: string): GroqClientResult {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return { success: false, error: 'GROQ_API_KEY is not configured in the server environment.' }
  const requestedModel = model || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
  if (!supportedGroqModels.includes(requestedModel as GroqModel)) return { success: false, error: `Unsupported Groq model: ${requestedModel}` }
  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new Groq({ apiKey })
    cachedKey = apiKey
  }
  return { success: true, client: cachedClient, model: requestedModel as GroqModel }
}
