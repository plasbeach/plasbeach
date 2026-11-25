import { createRouter, createWebHistory } from 'vue-router'
import TodayView from './views/TodayView.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'today', component: TodayView },
    { path: '/mail', name: 'mail', component: () => import('./views/MailView.vue') },
    { path: '/calendar', name: 'calendar', component: () => import('./views/CalendarView.vue') },
    { path: '/quests', name: 'quests', component: () => import('./views/QuestsView.vue') },
    { path: '/quests/done', name: 'archive', component: () => import('./views/ArchiveView.vue') },
    { path: '/quests/:id/focus', name: 'focus', component: () => import('./views/FocusView.vue') },
    { path: '/stats', name: 'stats', component: () => import('./views/StatsView.vue') },
  ],
})
