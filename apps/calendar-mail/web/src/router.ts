import { createRouter, createWebHistory } from 'vue-router'
import TodayView from './views/TodayView.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'today', component: TodayView },
    { path: '/mail', name: 'mail', component: () => import('./views/MailView.vue') },
    { path: '/calendar', name: 'calendar', component: () => import('./views/CalendarView.vue') },
  ],
})
