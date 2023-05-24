import { ss } from '@/utils/storage'

const LOCAL_NAME = 'userStorage'

export interface UserInfo {
  avatar: string
  name: string
  description: string
}

export interface UserState {
  userInfo: UserInfo
}

export function defaultSetting(): UserState {
  return {
    userInfo: {
      avatar: 'https://cdn.shansing.net/gravatar/53f4768c62aa59ff9c6511b8255193fd',
      name: 'Shansing',
      description: 's/o to <a href="https://openai.com" target="_blank" >OpenAI</a> & <a href="https://github.com/shansing/chatgpt-web" target="_blank">GitHub</a>',
    },
  }
}

export function getLocalState(): UserState {
  const localSetting: UserState | undefined = ss.get(LOCAL_NAME)
  return { ...defaultSetting(), ...localSetting }
}

export function setLocalState(setting: UserState): void {
  ss.set(LOCAL_NAME, setting)
}
