import type { DefaultTheme } from 'vitepress'
// import JS from '../../front-end/JavaScript/sidebar'
import { JSSidebar, ES6Sidebar } from '../../front-end/sidebar'

export const nav: DefaultTheme.Config['nav'] = [
  { text: '导航', link: '/nav/' },
  {
    text: '前端',
    items: [
      {
        text: '基础',
        items: [
          { text: 'CSS3', link: '/front-end/css3/base/css选择器', activeMatch: '^/front-end/css3' },
        ],
      },
      {
        text: '框架',
        items: [
          { text: 'Vue', link: '/front-end/vue/base/', activeMatch: '^/front-end/vue' },
          { text: 'React', link: '/front-end/react/', activeMatch: '^/front-end/react' },
        ],
      },
    ],
    activeMatch: '^/front-end',
  },
  {
    text: 'JavaScript',
    items: JSSidebar as [],
    activeMatch: '^/front-end/JavaScript',
  },
  {
    text: 'ES6',
    items: ES6Sidebar as [],
    activeMatch: '^/front-end/ES6',
  },
]
