import { ss } from '@/utils/storage'

const LOCAL_NAME = 'settingsStorage'

export interface SettingsState {
  systemMessage: string
  temperature: number
  top_p: number
	modelName: string
}

export function defaultSetting(): SettingsState {
	return {
		systemMessage: `You are ChatGPT, a large language model trained by OpenAI, based on the {{ShansingHelperModelName}} architecture. Knowledge cutoff: {{ShansingHelperKnowledgeDate}}. Current date: {{ShansingHelperUserDate}}.`,
		temperature: 1,
		top_p: 1,
		modelName: 'GPT-4o',
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
