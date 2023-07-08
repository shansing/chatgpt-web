import type { FetchFn } from 'chatgpt'
import {ChatGPTAPI, ChatGPTUnofficialProxyAPI} from "chatgpt";

export interface RequestProps {
  prompt: string
  options?: ChatContext
  systemMessage: string
  temperature?: number
  top_p?: number
	modelName?: string
}

export interface ModelChoice {
	name: string
	model: string
	promptTokenPrice?: string
	completionTokenPrice?: string
	api: ChatGPTAPI | ChatGPTUnofficialProxyAPI
	maxPrice: string
}

export interface ChatContext {
  conversationId?: string
  parentMessageId?: string
}

export interface ChatGPTUnofficialProxyAPIOptions {
  accessToken: string
  apiReverseProxyUrl?: string
  model?: string
  debug?: boolean
  headers?: Record<string, string>
  fetch?: FetchFn
}

export interface ModelConfig {
  apiModel?: ApiModel
  reverseProxy?: string
  timeoutMs?: number
  socksProxy?: string
  httpsProxy?: string
  usage?: string
	userQuota?: string
}

export type ApiModel = 'ChatGPTAPI' | 'ChatGPTUnofficialProxyAPI' | undefined
