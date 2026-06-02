import type { HeadConfig } from 'vitepress'
import { basename } from 'node:path'

// 获取 GitHub 仓库名作为 base 路径
const APP_BASE_PATH = basename(process.env.GITHUB_REPOSITORY || '')
const BASE_URL = APP_BASE_PATH ? `/${APP_BASE_PATH}/` : '/'

export const head: HeadConfig[] = [
  ['link', { rel: 'icon', href: `${BASE_URL}favicon.ico` }],
  ['link', { rel: 'apple-touch-icon', href: `${BASE_URL}favicon.ico` }],
  ['link', { rel: 'mask-icon', href: `${BASE_URL}favicon.ico`, color: '#3eaf7c' }],
  ['meta', { name: 'theme-color', content: '#3eaf7c' }],
  ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
  ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black' }],
  ['meta', { name: 'msapplication-TileImage', content: `${BASE_URL}favicon.ico` }],
  ['meta', { name: 'msapplication-TileColor', content: '#000000' }],
  ['link', { rel: 'manifest', href: `${BASE_URL}manifest.webmanifest` }],
]
