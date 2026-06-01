---
layout: home
layoutClass: 'm-home-layout'

hero:
  name: 柠檬小窝
  text: 成长之路
  tagline: 记录前端技术文档，个人知识库
  image:
    src: /logo.png
    alt: 柠檬小窝
  actions:
    - text: 前端导航
      link: /nav/
      theme: alt

features:
  - icon: ⚡️
    title: 知识点分享
    details: 前端八股，踩坑小贴士
  - icon: 🛠️
    title: 技术扩展
    details: 前端技术的扩展
---

<style>
/*爱的魔力转圈圈*/
.m-home-layout .image-src:hover {
  transform: translate(-50%, -50%) rotate(666turn);
  transition: transform 59s 1s cubic-bezier(0.3, 0, 0.8, 1);
}

.m-home-layout .details small {
  opacity: 0.8;
}

.m-home-layout .bottom-small {
  display: block;
  margin-top: 2em;
  text-align: right;
}
</style>
