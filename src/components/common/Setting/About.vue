<script setup lang='ts'>
import { computed, onMounted, ref } from 'vue'
import { NSpin } from 'naive-ui'
import { fetchChatConfig } from '@/api'
import pkg from '@/../package.json'
import { useAuthStore } from '@/store'

interface ConfigState {
  timeoutMs?: number
  reverseProxy?: string
  apiModel?: string
  socksProxy?: string
  httpsProxy?: string
  usage?: string
	userQuota?: string
	modelChoices?: string
	aboutHtml: string
}

const authStore = useAuthStore()

const loading = ref(false)

const config = ref<ConfigState>()

const isChatGPTAPI = computed<boolean>(() => !!authStore.isChatGPTAPI)

async function fetchConfig() {
  try {
    loading.value = true
    const { data } = await fetchChatConfig<ConfigState>()
    config.value = data
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchConfig()
})
</script>

<template>
  <NSpin :show="loading">
    <div class="p-4 space-y-4">
      <h2 class="text-xl font-bold">
        Shansing Helper - UpVer {{ pkg.version }}
      </h2>
      <div class="p-2 space-y-2 rounded-md bg-neutral-100 dark:bg-neutral-700">
        <p>
					Shout out to
					<a
						class="text-blue-600 dark:text-blue-500"
						href="https://openai.com"
						target="_blank"
					>OpenAI</a> · From <a
					class="text-blue-600 dark:text-blue-500"
					href="https://github.com/Chanzhaoyu/chatgpt-web"
					target="_blank"
				>Chanzhaoyu</a>
					mod by
					<a
            class="text-blue-600 dark:text-blue-500"
            href="https://github.com/shansing/chatgpt-web"
            target="_blank"
          >Shansing</a>
        </p>
				<div class="space-y-2" v-html="config?.aboutHtml"></div>
      </div>
			<p>{{ $t("shansing.userQuota") }}：{{ config?.userQuota ?? '-' }}</p>
      <p>{{ $t("setting.api") }}：{{ config?.apiModel ?? '-' }}</p>
      <p v-if="isChatGPTAPI">
        {{ $t("shansing.monthlyUsage") }}：{{ config?.usage ?? '-' }}
      </p>
      <p v-if="!isChatGPTAPI">
        {{ $t("setting.reverseProxy") }}：{{ config?.reverseProxy ?? '-' }}
      </p>
      <p>{{ $t("setting.timeout") }}：{{ config?.timeoutMs ?? '-' }}ms</p>
<!--      <p>{{ $t("setting.socks") }}：{{ config?.socksProxy ?? '-' }}</p>-->
<!--      <p>{{ $t("setting.httpsProxy") }}：{{ config?.httpsProxy ?? '-' }}</p>-->
<!--			<p>{{ $t("shansing.modelChoices") }}：{{ config?.modelChoices ?? '-' }}</p>-->
    </div>
  </NSpin>
</template>
