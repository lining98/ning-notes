import type { HeadConfig } from 'vitepress'

export const head: HeadConfig[] = [
  ['link', { link: 'icon', href: '/ning-notes/favicon.ico' }],
  ['meta', { name: 'theme-color', content: '#3eaf7c' }],
  ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
  ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black' }],
  ['meta', { name: 'msapplication-TileImage', content: '/favicon.ico' }],
  ['meta', { name: 'msapplication-TileColor', content: '#000000' }],
  ['link', { rel: 'apple-touch-icon', href: '/ning-notes/favicon.ico' }],
  ['link', { rel: 'mask-icon', href: '/ning-notes/favicon.ico', color: '#3eaf7c' }],
]
