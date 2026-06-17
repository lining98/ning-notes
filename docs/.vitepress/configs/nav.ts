import type { DefaultTheme } from 'vitepress'
import { AISidebar } from '../../ai-tech/sidebar'
import { JSSidebar, ES6Sidebar } from '../../front-end/sidebar'
import OthersSidebar from '../../others/sidebar'
import ServerSidebar from '../../server/sidebar'

export const nav: DefaultTheme.Config['nav'] = [
  { text: '导航', link: '/nav/' },
  { text: 'AI', items: AISidebar as [], activeMatch: '^/ai' },
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
    activeMatch: '^/front-end/base',
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
  {
    text: '服务端',
    items: ServerSidebar as [],
    activeMatch: '^/server',
  },
  {
    text: '其他',
    items: OthersSidebar,
    activeMatch: '^/others',
  },
  {
    text: '项目配置',
    link: '/project/configuration',
    activeMatch: '^/project/configuration',
  },
  // {
  //   text: '项目',
  //   items: [
  //     {
  //       text: '项目配置',
  //       link: '/project/configuration',
  //       activeMatch: '^/project/configuration',
  //     },
  //   ],
  //   activeMatch: '^/project',
  // },
]
