import { defineConfig } from 'vitepress';
import { head, nav, sidebar } from './configs';

// https://vitepress.dev/reference/site-config
export default defineConfig({
	base: '/ning-notes/',
	title: "lemon's blog",
	description: '学习并分享各类前端的项目和知识',

	themeConfig: {
		siteTitle: '柠檬小窝', //左上角的
		logo: '/logo.png', //左上角的logo,注意：它的路径是从public文件夹开始的，所以这里引用的是public/logo.jpg这张图
		nav,
		sidebar,
		/* 右侧大纲配置 */
		outline: {
			level: 'deep',
			label: '本页目录',
		},

		// 最后更新时间
		lastUpdatedText: '上次更新',

		socialLinks: [{ icon: 'github', link: 'https://github.com/lining98' }],

		// 页脚配置
		footer: {
			message: "lemon's personal blog.",
			copyright: 'Copyright © 2023-present lemon/lining',
		},
		docFooter: {
			prev: '上一篇',
			next: '下一篇',
		},

		// 仅移动端生效
		darkModeSwitchLabel: '外观',
		sidebarMenuLabel: '菜单',
		returnToTopLabel: '返回顶部',
	},
});
