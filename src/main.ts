import { createApp } from 'vue'
import { router } from './router'
import './assets/theme.css'
import './assets/animations.css'
import App from './App.vue'

createApp(App).use(router).mount('#app')
