import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { title: 'plasbea.ch' } },
    { path: '/chibre', name: 'schieber', component: () => import('./schieber/SchieberView.vue'), meta: { title: 'Schieber · plasbea.ch' } },
    { path: '/schieber', redirect: '/chibre' },
    { path: '/about', name: 'about', component: () => import('./about/AboutView.vue'), meta: { title: 'About me · plasbea.ch' } },
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { title: 'Log in · plasbea.ch' } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./views/NotFoundView.vue'), meta: { title: 'Not found · plasbea.ch' } },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => { document.title = String(to.meta.title ?? 'plasbea.ch') })
