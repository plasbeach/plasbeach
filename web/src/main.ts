import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './styles/theme.css'
import './composables/useTheme' // applies the saved theme before first paint

createApp(App).use(router).mount('#app')
