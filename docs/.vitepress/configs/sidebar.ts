import type { DefaultTheme } from 'vitepress'

import {
  CSSSidebar,
  JSSidebar,
  ES6Sidebar,
  VueSidebar,
  ReactSidebar,
} from '../../front-end/sidebar'
import { AISidebar } from '../../ai-tech/sidebar'
import OthersSidebar from '../../others/sidebar'
import ServerSidebar from '../../server/sidebar'

export const sidebar: DefaultTheme.Config['sidebar'] = {
  '/ai-tech/': AISidebar,
  '/front-end/css3/': CSSSidebar,
  '/front-end/vue/': VueSidebar,
  '/front-end/react/': ReactSidebar,
  '/front-end/JavaScript/': JSSidebar,
  '/front-end/ES6/': ES6Sidebar,
  '/server/': ServerSidebar,
  '/others/': OthersSidebar,
}
