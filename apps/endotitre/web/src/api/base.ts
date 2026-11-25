// The app is served under a path prefix (www.plasbea.ch/endotitre/), so API calls must include it.
// BASE_URL comes from `base` in vite.config.ts and always ends with "/".
export const apiUrl = (path: string) => import.meta.env.BASE_URL.replace(/\/$/, '') + path
