import { useChatStore } from '@/store'

export function useChat() {
  const chatStore = useChatStore()

  const getChatByUuidAndIndex = (uuid: number, index: number) => {
    return chatStore.getChatByUuidAndIndex(uuid, index)
  }

	const getHistoryModelNameByUuid = (uuid: number, defaultModelName : string) => {
			return chatStore.getHistoryModelNameByUuid(uuid, defaultModelName)
	}

  const addChat = (uuid: number, chat: Chat.Chat, defaultModelName : string) => {
    chatStore.addChatByUuid(uuid, chat, defaultModelName)
  }

  const updateChat = (uuid: number, index: number, chat: Chat.Chat) => {
    chatStore.updateChatByUuid(uuid, index, chat)
  }

  const updateChatSome = (uuid: number, index: number, chat: Partial<Chat.Chat>) => {
    chatStore.updateChatSomeByUuid(uuid, index, chat)
  }

  return {
    addChat,
    updateChat,
    updateChatSome,
    getChatByUuidAndIndex,
    getHistoryModelNameByUuid,
  }
}
