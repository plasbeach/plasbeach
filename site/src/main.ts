import { createApp } from 'vue'
import '@theme/theme.css'
import { applyDark, savedDark } from '@theme/theme-mode'
import App from './App.vue'
import { router } from './router'

applyDark(savedDark()) // before first paint
createApp(App).use(router).mount('#app')
