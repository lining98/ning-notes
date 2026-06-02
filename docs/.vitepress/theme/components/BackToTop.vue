<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

// 控制显示/隐藏（布尔值 + 类名控制）
const showToTop = ref(false)
// 滚动多少距离显示（500px）
const visibilityHeight = ref(500)

// 获取页面滚动距离
const getScrollTop = (): number => {
  return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0
}

// 滚动监听
const handleScroll = () => {
  showToTop.value = getScrollTop() > visibilityHeight.value
}

// 平滑回到顶部（原生更流畅，替代定时器写法）
const goBack = () => {
  window.scrollTo({
    top: 0,
    behavior: 'smooth',
  })
}

// 挂载 & 销毁监听（防止内存泄漏）
onMounted(() => {
  window.addEventListener('scroll', handleScroll)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <!-- 显示隐藏动画 + 点击返回顶部 -->
  <div class="top" :class="{ show: showToTop, hide: !showToTop }" @click="goBack">
    <img class="img no-zoom" src="../assets/images/go_top.png" alt="回到顶部" />
  </div>
</template>

<style lang="scss" scoped>
.top {
  position: fixed;
  right: 80px;
  top: -100px;
  z-index: 9999;
  transition: all 0.3s ease;
  cursor: pointer;

  .img {
    width: 50px;
    /* 上下浮动动画 */
    animation: bob 1s linear infinite;
  }
}

/* 显示状态 */
.show {
  opacity: 1;
  transform: translateY(0);
}

/* 隐藏状态 */
.hide {
  opacity: 0;
  transform: translateY(-200px);
  pointer-events: none; /* 隐藏时禁止点击，防止误触 */
}

/* 浮动动画 */
@keyframes bob {
  0% {
    transform: translateY(-8px);
  }
  50% {
    transform: translateY(-4px);
  }
  100% {
    transform: translateY(-8px);
  }
}
</style>
