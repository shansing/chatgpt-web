import express from 'express'
import type { RequestProps } from './types'
import type { ChatMessage } from './chatgpt'
import { chatReplyProcess, chatConfig, currentModel, readUserQuota, getModelChoices, isQuotaEnabled } from './chatgpt'
import { auth } from './middleware/auth'
import { limiter } from './middleware/limiter'
import { isNotEmptyString } from './utils/is'

const app = express()
const router = express.Router()

app.use(express.static('public'))
app.use(express.json())

app.all('*', (_, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'authorization, Content-Type')
  res.header('Access-Control-Allow-Methods', '*')
  next()
})

function getUsernameFromHttpBasicAuth(req) {
	const authHeader = req.headers['authorization'] || '';  // 获取 Authorization 头部字段
	const auth = Buffer.from(authHeader.split(' ')[1] || '', 'base64').toString();  // 解码 Base64
	return  auth.split(':')[0];  // 提取用户名
}

router.post('/chat-process', [auth, limiter], async (req, res) => {
  res.setHeader('Content-type', 'application/octet-stream')
  try {
    const { prompt, options = {}, systemMessage, temperature, top_p, modelName } = req.body as RequestProps
    let firstChunk = true
    let result = await chatReplyProcess({
      message: prompt,
      lastContext: options,
      process: (chat: ChatMessage) => {
        res.write(firstChunk ? JSON.stringify(chat) : `\n${JSON.stringify(chat)}`)
        firstChunk = false
      },
      systemMessage,
      temperature,
      top_p,
			username: getUsernameFromHttpBasicAuth(req),
			modelName,
    })
	}
  catch (error) {
    res.write(JSON.stringify(error))
  }
  finally {
    res.end()
  }
})



router.post('/config', auth, async (req, res) => {
  try {
    const response = await chatConfig()
		const username = getUsernameFromHttpBasicAuth(req);
		if (isQuotaEnabled() && username)
			response.data.userQuota = readUserQuota(username).toFixed() + " @ " + username
		response.data.modelChoices = process.env.SHANSING_MODEL_CHOICES
    res.send(response)
  }
  catch (error) {
    res.send(error)
  }
})

router.post('/modelChoices', auth, async (req, res) => {
	try {
		const response = await getModelChoices()
		res.send(response)
	}
	catch (error) {
		res.send(error)
	}
})

router.post('/session', async (req, res) => {
  try {
    const AUTH_SECRET_KEY = process.env.AUTH_SECRET_KEY
    const hasAuth = isNotEmptyString(AUTH_SECRET_KEY)
    res.send({ status: 'Success', message: '', data: { auth: hasAuth, model: currentModel() } })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body as { token: string }
    if (!token)
      throw new Error('Secret key is empty')

    if (process.env.AUTH_SECRET_KEY !== token)
      throw new Error('密钥无效 | Secret key is invalid')

    res.send({ status: 'Success', message: 'Verify successfully', data: null })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

app.use('', router)
app.use('/api', router)
app.set('trust proxy', 1)

app.listen(3002, () => globalThis.console.log('Server is running on port 3002'))
