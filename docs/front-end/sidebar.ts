export const CSSSidebar = [
  {
    text: 'CSS基础',
    items: [
      { text: 'CSS选择器', link: '/front-end/css3/base/css选择器' },
      { text: '选择器优先级', link: '/front-end/css3/base/选择器优先级' },
      { text: 'Flex布局', link: '/front-end/css3/base/flex' },
      { text: 'Grid布局', link: '/front-end/css3/base/grid' },
    ],
  },
  {
    text: 'CSS技巧',
    items: [
      { text: '水平垂直居中', link: '/front-end/css3/tricks/center' },
      { text: '绘制三角形', link: '/front-end/css3/tricks/triangle' },
      { text: '滚动条样式', link: '/front-end/css3/tricks/scrollbar' },
      { text: '文本溢出隐藏', link: '/front-end/css3/tricks/ellipsis' },
      // { text: '滚动条样式', link: '/front-end/css3/traick/scrollbar' }
    ],
  },
]

export const VueSidebar = [
  {
    text: 'Vue',
    link: '/front-end/vue/',
    items: [
      { text: 'vue核心基础', link: '/front-end/vue/base/' },
      { text: 'vue-router', link: '/front-end/vue/base/vue-router' },
      { text: 'vuex', link: '/front-end/vue/base/vuex' },
    ],
  },
  {
    text: 'Vue3快速上手',
    items: [
      { text: '认识Vue3', link: '/front-end/vue/vue3/' },
      { text: '创建Vue3项目', link: '/front-end/vue/vue3/create' },
      { text: 'vue3 API', link: '/front-end/vue/vue3/api' },
      { text: 'vue3 通信方式', link: '/front-end/vue/vue3/communication' },
      { text: 'vue3 深入组件', link: '/front-end/vue/vue3/components' },
      { text: 'vue3.3新特性', link: '/front-end/vue/vue3/vue33' },
    ],
  },
  {
    text: 'Vue 底层原理',
    items: [
      { text: '响应式原理', link: '/front-end/vue/advanced/responsive' },
      { text: 'Diff 算法', link: '/front-end/vue/advanced/diff' },
    ],
  },
]

export const ReactSidebar = [
  {
    text: 'React',
    items: [
      { text: 'React 概念', link: '/front-end/react/' },
      { text: 'JSX 语法介绍', link: '/front-end/react/JSX' },
      { text: '生命周期', link: '/front-end/react/lifecycle' },
      { text: 'React Props（属性）', link: '/front-end/react/props' },
      { text: 'React State（状态）', link: '/front-end/react/state' },
      { text: '条件渲染', link: '/front-end/react/条件渲染' },
      { text: '列表渲染', link: '/front-end/react/列表渲染' },
      { text: 'React 路由', link: '/front-end/react/router' },
    ],
  },
]

export const JSSidebar = [
  {
    text: 'JavaScript 基础',
    collapsed: true,
    link: '/front-end/JavaScript/base/',
    items: [
      { text: '基本语法', link: '/front-end/JavaScript/base/' },
      { text: '变量', link: '/front-end/JavaScript/base/variable' },
      { text: '数据类型', link: '/front-end/JavaScript/base/types' },
      { text: '运算符', link: '/front-end/JavaScript/base/operator' },
      { text: '流程控制', link: '/front-end/JavaScript/base/flow' },
      { text: '数组', link: '/front-end/JavaScript/base/array' },
      { text: '对象', link: '/front-end/JavaScript/base/object' },
      { text: '函数', link: '/front-end/JavaScript/base/function' },
    ],
  },
  {
    text: 'JavaScript 进阶',
    collapsed: true,
    link: '/front-end/JavaScript/core/closure',
    items: [
      { text: '闭包', link: '/front-end/JavaScript/core/closure' },
      { text: '函数柯里化', link: '/front-end/JavaScript/core/currying' },
      { text: '原型', link: '/front-end/JavaScript/core/prototype' },
      { text: '作用域', link: '/front-end/JavaScript/core/scope' },
      { text: '节流和防抖', link: '/front-end/JavaScript/core/debounce' },
      { text: '深拷贝', link: '/front-end/JavaScript/core/copy' },
      { text: 'promise', link: '/front-end/JavaScript/core/promise' },
      { text: '数组去重', link: '/front-end/JavaScript/core/duplicate' },
      { text: '数组扁平化', link: '/front-end/JavaScript/core/flattening' },

      { text: 'Ajax', link: '/front-end/JavaScript/core/ajax' },
      { text: '详解数组中的reduce方法', link: '/front-end/JavaScript/core/reduce' },
      { text: 'Event Loop 事件循环机制', link: '/front-end/JavaScript/core/eventLoop' },
    ],
  },
  {
    text: '内置对象',
    collapsed: true,
    link: '/front-end/JavaScript/BuiltIn/',
    items: [
      { text: '内置对象', link: '/front-end/JavaScript/BuiltIn/' },
      { text: '内置对象: Number', link: '/front-end/JavaScript/BuiltIn/Number' },
      { text: '内置对象: Math', link: '/front-end/JavaScript/BuiltIn/Math' },
      { text: '内置对象: Date', link: '/front-end/JavaScript/BuiltIn/Date' },
      { text: '内置对象: RegExp', link: '/front-end/JavaScript/BuiltIn/RegExp' },
    ],
  },
  {
    text: '面向对象',
    collapsed: true,
    link: '/front-end/JavaScript/OOP/',
    items: [
      { text: '面向对象概念', link: '/front-end/JavaScript/OOP/' },
      { text: '实例对象与方法', link: '/front-end/JavaScript/OOP/new' },
      { text: '类和构造函数', link: '/front-end/JavaScript/OOP/class' },
      { text: '继承、封装和多态', link: '/front-end/JavaScript/OOP/char' },
      { text: 'this 关键字', link: '/front-end/JavaScript/OOP/this' },
      { text: '原型和原型链', link: '/front-end/JavaScript/OOP/prototype' },
      { text: '严格模式', link: '/front-end/JavaScript/OOP/strict' },
    ],
  },
  {
    text: 'DOM',
    collapsed: true,
    link: '/front-end/JavaScript/DOM/',
    items: [
      { text: 'DOM介绍', link: '/front-end/JavaScript/DOM/' },
      { text: '获取和修改元素', link: '/front-end/JavaScript/DOM/获取和修改元素' },
      { text: '创建和操作元素', link: '/front-end/JavaScript/DOM/创建和操作元素' },
      { text: 'DOM节点', link: '/front-end/JavaScript/DOM/DOM节点' },
      { text: '事件处理', link: '/front-end/JavaScript/DOM/事件处理' },
      { text: '样式和类操作', link: '/front-end/JavaScript/DOM/样式和类操作' },
    ],
  },
  {
    text: 'BOM',
    collapsed: true,
    link: '/front-end/JavaScript/BOM/',
    items: [
      { text: 'BOM介绍', link: '/front-end/JavaScript/BOM/' },
      { text: 'window对象', link: '/front-end/JavaScript/BOM/window' },
      { text: 'document对象', link: '/front-end/JavaScript/BOM/document' },
      { text: 'location对象', link: '/front-end/JavaScript/BOM/location' },
      { text: 'histoty对象', link: '/front-end/JavaScript/BOM/history' },
      { text: 'navigator对象', link: '/front-end/JavaScript/BOM/navigator' },
      { text: 'screen对象', link: '/front-end/JavaScript/BOM/screen' },
    ],
  },
  {
    text: '本地存储',
    collapsed: true,
    link: '/front-end/JavaScript/storage/localStorage',
    items: [
      { text: 'localStorage', link: '/front-end/JavaScript/storage/localStorage' },
      { text: 'sessionStorage', link: '/front-end/JavaScript/storage/sessionStorage' },
      { text: 'cookie', link: '/front-end/JavaScript/storage/cookie' },
    ],
  },
]

export const ES6Sidebar = [
  { text: 'ECMAScript的介绍', link: '/front-end/ES6/' },
  { text: 'Set 数据结构', link: '/front-end/ES6/Set数据结构' },
  { text: 'Map 数据结构', link: '/front-end/ES6/Map数据结构' },
  { text: '解构赋值', link: '/front-end/ES6/解构赋值' },
  { text: '字符串的扩展', link: '/front-end/ES6/字符串的扩展' },
  { text: '字符串的常用方法', link: '/front-end/ES6/字符串的常用方法' },
  { text: '数组的扩展', link: '/front-end/ES6/数组的扩展' },
  { text: '对象的扩展', link: '/front-end/ES6/对象的扩展' },
  { text: '函数的扩展', link: '/front-end/ES6/函数的扩展' },
  { text: 'class', link: '/front-end/ES6/class' },
  { text: '模块化', link: '/front-end/ES6/module' },
]
