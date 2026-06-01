import type { DefaultTheme } from 'vitepress'

import {
  CSSSidebar,
  JSSidebar,
  ES6Sidebar,
  VueSidebar,
  ReactSidebar,
} from '../../front-end/sidebar'
export const sidebar: DefaultTheme.Config['sidebar'] = {
  '/front-end/css3/': CSSSidebar,
  '/front-end/vue/': VueSidebar,
  '/front-end/react/': ReactSidebar,
  '/front-end/JavaScript/': JSSidebar,
  '/front-end/ES6/': ES6Sidebar,
}
