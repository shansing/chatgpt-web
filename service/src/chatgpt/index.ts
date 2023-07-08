import * as dotenv from 'dotenv'
import 'isomorphic-fetch'
import type { ChatGPTAPIOptions, ChatMessage, SendMessageOptions } from 'chatgpt'
import { ChatGPTAPI, ChatGPTUnofficialProxyAPI } from 'chatgpt'
import { SocksProxyAgent } from 'socks-proxy-agent'
import httpsProxyAgent from 'https-proxy-agent'
import fetch from 'node-fetch'
import { sendResponse } from '../utils'
import { isNotEmptyString } from '../utils/is'
import type { ApiModel, ChatContext, ChatGPTUnofficialProxyAPIOptions, ModelConfig } from '../types'
import type { RequestOptions, SetProxyOptions, UsageResponse } from './types'
import { Decimal } from "decimal.js";
import { readFileSync, writeFileSync } from "fs";
import {opt} from "ts-interface-checker";

const { HttpsProxyAgent } = httpsProxyAgent

dotenv.config()

const ErrorCodeMessage: Record<string, string> = {
  401: '[OpenAI] 提供错误的API密钥 | Incorrect API key provided',
  403: '[OpenAI] 服务器拒绝访问，请稍后再试 | Server refused to access, please try again later',
  502: '[OpenAI] 错误的网关 |  Bad Gateway',
  503: '[OpenAI] 服务器繁忙，请稍后再试 | Server is busy, please try again later',
  504: '[OpenAI] 网关超时 | Gateway Time-out',
  500: '[OpenAI] 服务器繁忙，请稍后再试 | Internal Server Error',
}

const timeoutMs: number = !isNaN(+process.env.TIMEOUT_MS) ? +process.env.TIMEOUT_MS : 100 * 1000
const disableDebug: boolean = process.env.OPENAI_API_DISABLE_DEBUG === 'true'

let apiModel: ApiModel
const model = isNotEmptyString(process.env.OPENAI_API_MODEL) ? process.env.OPENAI_API_MODEL : 'gpt-3.5-turbo'

if (!isNotEmptyString(process.env.OPENAI_API_KEY) && !isNotEmptyString(process.env.OPENAI_ACCESS_TOKEN))
  throw new Error('Missing OPENAI_API_KEY or OPENAI_ACCESS_TOKEN environment variable')

let api: ChatGPTAPI | ChatGPTUnofficialProxyAPI

const MAX_TOKEN_TIMES = process.env.SHANSING_MAX_TOKEN_TIMES
const metaMaxModelTokens = 1024
let maxModelTokens;
let maxResponseTokens;
const lowercaseModel= model.toLowerCase()
if (isNotEmptyString(MAX_TOKEN_TIMES)) {
	const maxTokenTimes = parseInt(MAX_TOKEN_TIMES);
	maxModelTokens = metaMaxModelTokens * maxTokenTimes
	maxResponseTokens = maxModelTokens / 4
} else if (lowercaseModel.includes('16k')) {
	maxModelTokens = metaMaxModelTokens * 16
	maxResponseTokens = maxModelTokens / 4
} else if (lowercaseModel.includes('32k')) {
	maxModelTokens = metaMaxModelTokens *32
	maxResponseTokens = maxModelTokens / 4
} else if (lowercaseModel.includes('64k')) {
	maxModelTokens = metaMaxModelTokens * 64
	maxResponseTokens = maxModelTokens / 4
} else if (lowercaseModel.includes('gpt-4')) {
	maxModelTokens = metaMaxModelTokens * 8
	maxResponseTokens = maxModelTokens / 4
} else {
	maxModelTokens = metaMaxModelTokens * 4
	maxResponseTokens = maxModelTokens / 4
}

(async () => {
  // More Info: https://github.com/transitive-bullshit/chatgpt-api

  if (isNotEmptyString(process.env.OPENAI_API_KEY)) {
    const OPENAI_API_BASE_URL = process.env.OPENAI_API_BASE_URL

    const options: ChatGPTAPIOptions = {
      apiKey: process.env.OPENAI_API_KEY,
      completionParams: { model },
      debug: !disableDebug,
    }

		options.maxModelTokens = maxModelTokens
		options.maxResponseTokens = maxResponseTokens

    if (isNotEmptyString(OPENAI_API_BASE_URL))
      options.apiBaseUrl = `${OPENAI_API_BASE_URL}/v1`

    setupProxy(options)

    api = new ChatGPTAPI({ ...options })
    apiModel = 'ChatGPTAPI'
  }
  else {
    const options: ChatGPTUnofficialProxyAPIOptions = {
      accessToken: process.env.OPENAI_ACCESS_TOKEN,
      apiReverseProxyUrl: isNotEmptyString(process.env.API_REVERSE_PROXY) ? process.env.API_REVERSE_PROXY : 'https://ai.fakeopen.com/api/conversation',
      model,
      debug: !disableDebug,
    }

    setupProxy(options)

    api = new ChatGPTUnofficialProxyAPI({ ...options })
    apiModel = 'ChatGPTUnofficialProxyAPI'
  }
})()

async function chatReplyProcess(options: RequestOptions) {
  const { message, lastContext, process, systemMessage, temperature, top_p, username } = options
  try {
    let options: SendMessageOptions = { timeoutMs }

    if (apiModel === 'ChatGPTAPI') {
      if (isNotEmptyString(systemMessage))
        options.systemMessage = systemMessage
      options.completionParams = { model, temperature, top_p }
    }

    if (lastContext != null) {
      if (apiModel === 'ChatGPTAPI')
        options.parentMessageId = lastContext.parentMessageId
      else
        options = { ...lastContext }
    }

		if (!prePay(username)) {
			globalThis.console.error(username + "'s quota is not enough, need " + maxPrice.toFixed());
			return sendResponse({ type: 'Fail', message: '[Shansing Helper] 预扣除余额不足，需要 ' + maxPrice.toFixed() })
		}
    const response = await api.sendMessage(message, {
      ...options,
      onProgress: (partialResponse) => {
        process?.(partialResponse)
      },
    })
		payback(username, response)

    return sendResponse({ type: 'Success', data: response })
  }
  catch (error: any) {
    const code = error.statusCode
    global.console.log(error)
    if (Reflect.has(ErrorCodeMessage, code))
      return sendResponse({ type: 'Fail', message: ErrorCodeMessage[code] })
    return sendResponse({ type: 'Fail', message: error.message ?? 'Please check the back-end console' })
  }
}

async function fetchUsage() {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
  const OPENAI_API_BASE_URL = process.env.OPENAI_API_BASE_URL

  if (!isNotEmptyString(OPENAI_API_KEY))
    return Promise.resolve('-')

  const API_BASE_URL = isNotEmptyString(OPENAI_API_BASE_URL)
    ? OPENAI_API_BASE_URL
    : 'https://api.openai.com'

  const [startDate, endDate] = formatDate()

  // 每月使用量
  const urlUsage = `${API_BASE_URL}/v1/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`

  const headers = {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  }

  const options = {} as SetProxyOptions

  setupProxy(options)

  try {
    // 获取已使用量
    const useResponse = await options.fetch(urlUsage, { headers })
    if (!useResponse.ok)
      throw new Error('获取使用量失败')
    const usageData = await useResponse.json() as UsageResponse
    const usage = Math.round(usageData.total_usage) / 100
    return Promise.resolve(usage ? `$${usage}` : '-')
  }
  catch (error) {
    global.console.log(error)
    return Promise.resolve('-')
  }
}

function formatDate(): string[] {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth() + 1
  const lastDay = new Date(year, month, 0)
  const formattedFirstDay = `${year}-${month.toString().padStart(2, '0')}-01`
  const formattedLastDay = `${year}-${month.toString().padStart(2, '0')}-${lastDay.getDate().toString().padStart(2, '0')}`
  return [formattedFirstDay, formattedLastDay]
}

async function chatConfig() {
  const usage = await fetchUsage()
  const reverseProxy = process.env.API_REVERSE_PROXY ?? '-'
  const httpsProxy = (process.env.HTTPS_PROXY || process.env.ALL_PROXY) ?? '-'
  const socksProxy = (process.env.SOCKS_PROXY_HOST && process.env.SOCKS_PROXY_PORT)
    ? (`${process.env.SOCKS_PROXY_HOST}:${process.env.SOCKS_PROXY_PORT}`)
    : '-'
  return sendResponse<ModelConfig>({
    type: 'Success',
    data: { apiModel, reverseProxy, timeoutMs, socksProxy, httpsProxy, usage },
  })
}

function setupProxy(options: SetProxyOptions) {
  if (isNotEmptyString(process.env.SOCKS_PROXY_HOST) && isNotEmptyString(process.env.SOCKS_PROXY_PORT)) {
    const agent = new SocksProxyAgent({
      hostname: process.env.SOCKS_PROXY_HOST,
      port: process.env.SOCKS_PROXY_PORT,
      userId: isNotEmptyString(process.env.SOCKS_PROXY_USERNAME) ? process.env.SOCKS_PROXY_USERNAME : undefined,
      password: isNotEmptyString(process.env.SOCKS_PROXY_PASSWORD) ? process.env.SOCKS_PROXY_PASSWORD : undefined,
    })
    options.fetch = (url, options) => {
      return fetch(url, { agent, ...options })
    }
  }
  else if (isNotEmptyString(process.env.HTTPS_PROXY) || isNotEmptyString(process.env.ALL_PROXY)) {
    const httpsProxy = process.env.HTTPS_PROXY || process.env.ALL_PROXY
    if (httpsProxy) {
      const agent = new HttpsProxyAgent(httpsProxy)
      options.fetch = (url, options) => {
        return fetch(url, { agent, ...options })
      }
    }
  }
  else {
    options.fetch = (url, options) => {
      return fetch(url, { ...options })
    }
  }
}

function currentModel(): ApiModel {
  return apiModel
}

const quotaPath : string = process.env.SHANSING_QUOTA_PATH
const promptTokenPrice : Decimal = !isNaN(+process.env.SHANSING_PROMPT_TOKEN_PRICE) ? new Decimal(process.env.SHANSING_PROMPT_TOKEN_PRICE) : null
const completionTokenPrice : Decimal = !isNaN(+process.env.SHANSING_COMPLETION_TOKEN_PRICE) ? new Decimal(process.env.SHANSING_COMPLETION_TOKEN_PRICE) : null
const quotaEnabled : boolean = quotaPath != null && promptTokenPrice != null && completionTokenPrice != null
const maxPrice = quotaEnabled ? (promptTokenPrice.mul(maxModelTokens - maxResponseTokens)).plus(completionTokenPrice.mul(maxResponseTokens)) : null
if (quotaEnabled)
	globalThis.console.log('quotaEnabled!', quotaPath, 'quotaPath')
function readUserQuota(username : string) : Decimal {
	let fileContent = readFileSync(quotaPath + '/' + username, 'utf8')
	try {
		return new Decimal(fileContent.trim())
	} catch (error) {
		globalThis.console.error(username + "'s quota is not number", error);
		throw error
	}
}
function increaseUserQuota(username : string, delta : Decimal) {
	let quota = readUserQuota(username)
	// globalThis.console.log(username + '\'s old quota: ' + quota.toFixed())
	let newQuota = quota.plus(delta)
	// globalThis.console.log(username + '\'s new quota: ' + newQuota.toFixed())
	if (newQuota.lt(0)) {
		return false;
	}
	writeFileSync(quotaPath + '/' + username, newQuota.toFixed(), 'utf8')
	return true;
}
function decreaseUserQuota(username : string, delta : Decimal) {
	return increaseUserQuota(username, new Decimal(-1).mul(delta))
}
function prePay(username) {
	if (quotaEnabled && username) {
		// globalThis.console.log('prepay:', 'username', username, 'maxPrice', maxPrice)
		return decreaseUserQuota(username, maxPrice)
	}
}
function payback(username, response : ChatMessage) {
	if (username && quotaEnabled) {
		let plus;
		if (response && response.detail && response.detail.usage) {
			let usage = response.detail.usage;
			//退还费用
			let thisBilling = (promptTokenPrice.mul(usage.prompt_tokens)).plus(completionTokenPrice.mul(usage.completion_tokens))
			plus = maxPrice.sub(thisBilling)
		} else {
			//退还所有费用
			plus = maxPrice
		}
		// globalThis.console.log('payback:', 'username', username, 'plus', plus)
		increaseUserQuota(username, plus)
	}
}

export type { ChatContext, ChatMessage }

export { chatReplyProcess, chatConfig, currentModel, readUserQuota }
