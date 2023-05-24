import { ss } from '@/utils/storage'

const LOCAL_NAME = 'settingsStorage'

export interface SettingsState {
  systemMessage: string
  temperature: number
  top_p: number
}

export function defaultSetting(): SettingsState {
	const currentDate = new Date().toISOString().split('T')[0]
	return {
		systemMessage: `You are ChatGPT, a large language model trained by OpenAI. Knowledge cutoff: 2021-09-01 Current date: ${currentDate}`,
		temperature: 1,
		top_p: 1,
	}
}

export function getLocalState(): SettingsState {
  const localSetting: SettingsState | undefined = ss.get(LOCAL_NAME)
  return { ...defaultSetting(), ...localSetting }
}

export function setLocalState(setting: SettingsState): void {
  ss.set(LOCAL_NAME, setting)
}

export function removeLocalState() {
  ss.remove(LOCAL_NAME)
}
