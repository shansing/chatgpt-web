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
import { ModelChoice } from "../types";

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
const kilo = new Decimal('1000')
;

const quotaPath : string = process.env.SHANSING_QUOTA_PATH
const modelChoices : ModelChoice[] = isNotEmptyString(process.env.SHANSING_MODEL_CHOICES) ? JSON.parse(process.env.SHANSING_MODEL_CHOICES) : null
const quotaEnabled : boolean = quotaPath != null && modelChoices != null
const prededuction: boolean = process.env.SHANSING_PREDEDUCTION === 'true'
;

(async () => {
  // More Info: https://github.com/transitive-bullshit/chatgpt-api

  if (isNotEmptyString(process.env.OPENAI_API_KEY)) {
    const OPENAI_API_BASE_URL = process.env.OPENAI_API_BASE_URL

    const options: ChatGPTAPIOptions = {
      apiKey: process.env.OPENAI_API_KEY,
      completionParams: { model },
      debug: !disableDebug,
    }

    if (isNotEmptyString(OPENAI_API_BASE_URL))
      options.apiBaseUrl = `${OPENAI_API_BASE_URL}/v1`

    setupProxy(options)

		if (modelChoices != null) {
			//should be 1024, but it's good to leave some space because token estimation isn't accurate
			const kiloMaxModelTokens = 1000
			for (let modelChoice of modelChoices) {
				let promptTokenPrice = new Decimal(modelChoice.promptTokenPrice1k).div(kilo)
				let completionTokenPrice = new Decimal(modelChoice.completionTokenPrice1k).div(kilo)
				let choiceOptions: ChatGPTAPIOptions = JSON.parse(JSON.stringify(options))
				let maxModelTokens = modelChoice.contextToken1k * kiloMaxModelTokens
				let maxResponseTokens = modelChoice.completionToken1k * kiloMaxModelTokens
				;
				choiceOptions.maxModelTokens = maxModelTokens
				choiceOptions.maxResponseTokens = maxResponseTokens
				let maxPrice = quotaEnabled ? (promptTokenPrice.mul(maxModelTokens - maxResponseTokens)).plus(completionTokenPrice.mul(maxResponseTokens)) : null
				if (modelChoice.maxPrice == null && maxPrice != null)
					modelChoice.maxPrice = maxPrice.toFixed()
				modelChoice.api = new ChatGPTAPI({ ...choiceOptions })
			}
		}
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
  const { message, lastContext, process, systemMessage, temperature, top_p, username, modelName } = options
	let modelChoice : ModelChoice = null;
	if (modelName && modelChoices) {
		modelChoice = modelChoices.find(choice => choice.name === modelName);
	}
	if (modelChoices && modelChoice == null) {
		return sendResponse({ type: 'Fail', message: '[Shansing Helper] Invalid model choice | 模型选择无效' })
	}
	try {
    let options: SendMessageOptions = { timeoutMs }

    if (apiModel === 'ChatGPTAPI') {
      if (isNotEmptyString(systemMessage))
        options.systemMessage = systemMessage
			if (modelChoice != null)
				options.systemMessage = options.systemMessage
					.replace(/{{ShansingHelperCurrentDate}}/g, new Date().toLocaleDateString('ISO', {year: 'numeric', month: '2-digit', day: '2-digit'}).replace(/\//g, '-') )
					.replace(/{{ShansingHelperCurrentTime}}/g, new Date().toLocaleTimeString('UTC') )
					.replace(/{{ShansingHelperModelName}}/g, modelChoice.name)
					.replace(/{{ShansingHelperKnowledgeDate}}/g, modelChoice.knowledgeDate)
      options.completionParams = { model, temperature, top_p }
    }

    if (lastContext != null) {
      if (apiModel === 'ChatGPTAPI')
        options.parentMessageId = lastContext.parentMessageId
      else
        options = { ...lastContext }
    }

		let processApi = api;
		if (modelChoice) {
			processApi = modelChoice.api
			options.completionParams.model = modelChoice.model

			if (prededuction) {
				if (!prePay(username, modelChoice)) {
					globalThis.console.error(username + "'s quota is not enough, need " + modelChoice.maxPrice);
					return sendResponse({ type: 'Fail', message: '[Shansing Helper] Insufficient pre-deduction quota, need 🪙' + modelChoice.maxPrice + ' | 预扣费余额不足，需要🪙' + modelChoice.maxPrice})
				}
			} else {
				if (readUserQuota(username).lessThanOrEqualTo(0)) {
					globalThis.console.error(username + "'s quota is not enough");
					return sendResponse({ type: 'Fail', message: '[Shansing Helper] Insufficient quota | 余额不足'})
				}
			}

		}
    const response = await processApi.sendMessage(message, {
      ...options,
      onProgress: (partialResponse) => {
        process?.(partialResponse)
      },
    })

		if (prededuction) {
			payback(username, response, modelChoice)
		} else {
			pay(username, response, modelChoice)
		}

    return sendResponse({ type: 'Success', data: response })
  }
  catch (error: any) {
    const code = error.statusCode
		payback(username, null, modelChoice)
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
  const usage = null //await fetchUsage()
  const reverseProxy = process.env.API_REVERSE_PROXY ?? '-'
  const httpsProxy = (process.env.HTTPS_PROXY || process.env.ALL_PROXY) ?? '-'
  const socksProxy = (process.env.SOCKS_PROXY_HOST && process.env.SOCKS_PROXY_PORT)
    ? (`${process.env.SOCKS_PROXY_HOST}:${process.env.SOCKS_PROXY_PORT}`)
    : '-'
	const aboutHtml = process.env.SHANSING_ABOUT_HTML ?? ''
  return sendResponse<ModelConfig>({
    type: 'Success',
    data: { apiModel, reverseProxy, timeoutMs, socksProxy, httpsProxy, usage, aboutHtml },
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

function readUserQuota(username : string) : Decimal {
	let fileContent = readFileSync(quotaPath + '/' + username, 'utf8')
	try {
		return new Decimal(fileContent.trim())
	} catch (error) {
		globalThis.console.error(username + "'s quota is not number", error);
		throw error
	}
}
function increaseUserQuota(username : string, delta : Decimal, allowToNegetive : boolean) {
	let quota = readUserQuota(username)
	// globalThis.console.log(username + '\'s old quota: ' + quota.toFixed())
	let newQuota = quota.plus(delta)
	// globalThis.console.log(username + '\'s new quota: ' + newQuota.toFixed())
	if (!allowToNegetive && newQuota.lt(0)) {
		return false;
	}
	writeFileSync(quotaPath + '/' + username, newQuota.toFixed(), 'utf8')
	return true;
}
function decreaseUserQuota(username : string, delta : Decimal, allowToNonPositive : boolean) {
	return increaseUserQuota(username, new Decimal(-1).mul(delta), true)
}
function prePay(username, modelChoice : ModelChoice) {
	if (quotaEnabled && username && modelChoice) {
		// globalThis.console.log('prepay:', 'username', username, 'maxPrice', maxPrice)
		return decreaseUserQuota(username, new Decimal(modelChoice.maxPrice), false)
	}
	return true
}
function payback(username, response : ChatMessage, modelChoice : ModelChoice) {
	if (username && quotaEnabled && modelChoice) {
		let plus;
		// globalThis.console.log('response.detail', response.detail)
		if (response && response.detail && response.detail.usage && response.detail.usage.completion_tokens != null) {
			let usage = response.detail.usage;
			//退还费用
			let thisBilling = (new Decimal(modelChoice.promptTokenPrice1k).div(kilo).mul(usage.prompt_tokens))
				.plus(new Decimal(modelChoice.completionTokenPrice1k).div(kilo).mul(usage.completion_tokens))
			plus = new Decimal(modelChoice.maxPrice).sub(thisBilling)
		} else {
			//退还所有费用
			plus = new Decimal(modelChoice.maxPrice)
		}
		// globalThis.console.log('payback:', 'username', username, 'plus', plus)
		increaseUserQuota(username, plus, false)
	}
}
function pay(username, response : ChatMessage, modelChoice : ModelChoice) {
	if (username && quotaEnabled && modelChoice) {
		globalThis.console.log('response.detail', response.detail)
		if (response && response.detail && response.detail.usage && response.detail.usage.completion_tokens != null) {
			let usage = response.detail.usage;
			let thisBilling = (new Decimal(modelChoice.promptTokenPrice1k).div(kilo).mul(usage.prompt_tokens))
				.plus(new Decimal(modelChoice.completionTokenPrice1k).div(kilo).mul(usage.completion_tokens))
			globalThis.console.log('pay:', 'username', username, 'thisBilling', thisBilling)
			decreaseUserQuota(username, thisBilling, true)
		}
	}
}
async function getModelChoices() {
	return sendResponse<ModelChoice[]>({
		type: 'Success',
		data: isNotEmptyString(process.env.SHANSING_MODEL_CHOICES) ? JSON.parse(process.env.SHANSING_MODEL_CHOICES) : null,
	})
}
function isQuotaEnabled() {
	return quotaEnabled
}

export type { ChatContext, ChatMessage }

export { chatReplyProcess, chatConfig, currentModel, readUserQuota, getModelChoices, isQuotaEnabled }
