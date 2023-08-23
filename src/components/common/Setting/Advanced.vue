<script lang="ts" setup>
import { onMounted, Ref, ref } from 'vue'
import { NButton, NInput, NSelect, NSlider, useMessage } from 'naive-ui'
import { useSettingStore } from '@/store'
import type { SettingsState } from '@/store/modules/settings/helper'
import { t } from '@/locales'
import { fetchModelChoices } from "@/api";

const settingStore = useSettingStore()

const ms = useMessage()

const systemMessage = ref(settingStore.systemMessage ?? '')

const temperature = ref(settingStore.temperature ?? 0.5)

const top_p = ref(settingStore.top_p ?? 1)

const modelName = ref(settingStore.modelName ?? 'GPT-4')

const modelNameOptions: Ref<{ label: string; key: string; value: string }[]> = ref([])

const loading = ref(false)

function updateSettings(options: Partial<SettingsState>) {
  settingStore.updateSetting(options)
  ms.success(t('common.success'))
}

function handleReset() {
  settingStore.resetSetting()
  ms.success(t('common.success'))
  window.location.reload()
}

interface ModelChoice {
	name: string
	model: string
	promptTokenPrice?: string
	completionTokenPrice?: string
	maxPrice: string
}
async function getModelChoices() {
	try {
		loading.value = true
		const { data } = await fetchModelChoices<ModelChoice[]>()
		modelNameOptions.value = data.map(choice => {
			let label = choice.name /*  + " / " + choice.model */
			if (choice.promptTokenPrice)
				label += " / P:🪙" + choice.promptTokenPrice
			if (choice.completionTokenPrice)
				label += " / C:🪙" + choice.completionTokenPrice
			return {label, key: choice.name, value: choice.name}
		})}
	finally {
		loading.value = false
	}
}
onMounted(() => {
	getModelChoices()
})
</script>

<template>
  <div class="p-4 space-y-5 min-h-[200px]">
    <div class="space-y-6">
			<div class="flex items-center space-x-4">
				<span class="flex-shrink-0 w-[120px]">{{ $t('shansing.modelNameOption') }}</span>
				<div class="flex-1 overflow-hidden">
					<NSelect
						:options="modelNameOptions"
						v-model:value="modelName"
					/>
				</div>
				<NButton size="tiny" text type="primary" @click="updateSettings({ modelName })">
					{{ $t('common.save') }}
				</NButton>
			</div>
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[120px]">{{ $t('setting.role') }}</span>
        <div class="flex-1">
          <NInput v-model:value="systemMessage" type="textarea" :autosize="{ minRows: 1, maxRows: 4 }" />
        </div>
        <NButton size="tiny" text type="primary" @click="updateSettings({ systemMessage })">
          {{ $t('common.save') }}
        </NButton>
      </div>
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[120px]">{{ $t('setting.temperature') }} </span>
        <div class="flex-1">
          <NSlider v-model:value="temperature" :max="2" :min="0" :step="0.1" />
        </div>
        <span>{{ temperature }}</span>
        <NButton size="tiny" text type="primary" @click="updateSettings({ temperature })">
          {{ $t('common.save') }}
        </NButton>
      </div>
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[120px]">{{ $t('setting.top_p') }} </span>
        <div class="flex-1">
          <NSlider v-model:value="top_p" :max="1" :min="0" :step="0.1" />
        </div>
        <span>{{ top_p }}</span>
        <NButton size="tiny" text type="primary" @click="updateSettings({ top_p })">
          {{ $t('common.save') }}
        </NButton>
      </div>
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[120px]">&nbsp;</span>
        <NButton size="small" @click="handleReset">
          {{ $t('common.reset') }}
        </NButton>
      </div>
    </div>
  </div>
</template>
