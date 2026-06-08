# Vue 响应式原理

## Vue2 响应式原理

Vue 2 的响应式原理主要是基于 Object.defineProperty 实现的。以下是 Vue 2 响应式系统的核心原理：

### 1. 数据劫持：

当你创建一个 Vue 实例时，Vue 会遍历 data 对象中的所有属性。

- **遍历过程**：Vue 通过 `Observer` 类递归遍历 data 的所有属性
- **属性定义**：对每个属性使用 `Object.defineProperty` 定义 getter 和 setter
- **深层监听**：对于嵌套对象，会递归调用 `Observer` 进行处理

### 2. 依赖追踪：

在模板中使用数据属性时，Vue 会建立依赖关系：

- **Dep（依赖管理器）**：每个响应式属性对应一个 Dep 实例，用于管理依赖
- **Watcher（观察者）**：每个组件或表达式对应一个 Watcher，负责更新视图
- **依赖收集时机**：当 getter 被调用时，将当前 Watcher 添加到 Dep 中

**依赖收集流程**：

1. 组件渲染时触发数据属性的 getter
2. getter 调用 `dep.depend()` 将 Watcher 加入依赖列表
3. 数据变化时通过 `dep.notify()` 通知所有 Watcher 更新

### 3. 响应式触发：

- 当数据对象的属性被修改时，它的 setter 会被调用。
- Setter 负责通知相关的 watcher 更新视图。
- 这种方式实现了数据的响应式更新，确保视图总是与数据保持同步。

### 4. 虚拟 DOM：

- Vue 2 使用虚拟 DOM 来管理视图的渲染和更新。
- 当数据变化时，Vue 2 会比较前后两个虚拟 DOM 树，找到需要更新的部分，并将更新应用到实际的 DOM 上，从而避免直接操作 DOM，提高了性能和效率。

## Vue3 响应式原理

Vue 3 的响应式原理使用了 Proxy 对象，相比 Vue 2 使用的 Object.defineProperty 有一些重要的改进和性能优化。

### 1. Proxy 对象：

- Vue 3 引入了 Proxy 对象作为响应式系统的基础。Proxy 可以用来监听对象的读取、设置、删除等操作，以及数组的变化。
- 通过 Proxy，Vue 3 能够更灵活地捕获数据的变化。

```javascript
const proxy = new Proxy(target, {
  get(target, key, receiver) {
    // 依赖收集
    track(target, key)
    // 处理嵌套对象的响应式
    const result = Reflect.get(target, key, receiver)
    if (isObject(result)) {
      return reactive(result)
    }
    return result
  },
  set(target, key, value, receiver) {
    // 依赖触发
    trigger(target, key)
    return Reflect.set(target, key, value, receiver)
  },
  deleteProperty(target, key) {
    trigger(target, key)
    return Reflect.deleteProperty(target, key)
  },
})
```

### 2. Proxy 相比 Object.defineProperty 的优势

| 特性     | Vue2 (Object.defineProperty) | Vue3 (Proxy)           |
| -------- | ---------------------------- | ---------------------- |
| 数组监听 | 需要重写数组方法             | 原生支持               |
| 属性添加 | 无法检测                     | 原生支持               |
| 属性删除 | 无法检测                     | 原生支持               |
| 性能     | 初始化慢（需遍历）           | 懒代理（按需响应式）   |
| 嵌套对象 | 预递归处理                   | 懒递归（访问时才处理） |

### 3. 依赖追踪机制

Vue 3 使用基于 `Map` 的依赖收集系统：

- **Target Map**：`WeakMap(target -> Key Map)`
- **Key Map**：`Map(key -> Dep Set)`
- **Dep Set**：存储所有依赖该属性的 effect

**核心数据结构**：

```javascript
const targetMap = new WeakMap()

function track(target, key) {
  let depsMap = targetMap.get(target)
  if (!depsMap) {
    depsMap = new Map()
    targetMap.set(target, depsMap)
  }

  let dep = depsMap.get(key)
  if (!dep) {
    dep = new Set()
    depsMap.set(key, dep)
  }

  dep.add(activeEffect)
}
```

### 4. Effect 系统

Vue 3 使用 `effect` 函数管理副作用：

```javascript
function effect(fn, options = {}) {
  const effect = createReactiveEffect(fn, options)
  if (!options.lazy) {
    effect()
  }
  return effect
}
```

**Effect 类型**：

- **组件渲染 effect**：负责组件视图更新
- **computed effect**：计算属性的求值
- **watch effect**：监听数据变化的回调

### 5. 响应式 API

Vue 3 提供了多个响应式创建函数：

| API                 | 作用           | 特点                 |
| ------------------- | -------------- | -------------------- |
| `reactive()`        | 创建响应式对象 | 递归响应式           |
| `ref()`             | 创建响应式引用 | 适合基本类型         |
| `readonly()`        | 创建只读响应式 | 不可修改             |
| `shallowReactive()` | 浅响应式       | 只监听第一层         |
| `shallowRef()`      | 浅响应式引用   | 只监听 `.value` 变化 |

### 6. 计算属性原理

计算属性使用 lazy effect 实现：

```javascript
function computed(getter) {
  let value
  let dirty = true

  const effect = createReactiveEffect(getter, {
    lazy: true,
    scheduler: () => {
      dirty = true
    },
  })

  return {
    get value() {
      if (dirty) {
        value = effect()
        dirty = false
      }
      return value
    },
  }
}
```

**计算属性特点**：

- **惰性求值**：只在访问时计算
- **缓存机制**：依赖不变时返回缓存值
- **自动依赖追踪**：自动追踪 getter 中的响应式数据

### 7. 性能优化策略

Vue 3 引入了多项性能优化：

1. **懒代理**：只在访问属性时才创建响应式代理
2. **缓存优化**：缓存 getter 结果，避免重复计算
3. **effect 调度**：支持调度器控制更新时机
4. **树形抖动**：编译时静态分析，标记静态节点

---

## Vue2 与 Vue3 响应式对比

### 核心差异总结

| 方面       | Vue2                  | Vue3             |
| ---------- | --------------------- | ---------------- |
| 底层实现   | Object.defineProperty | Proxy            |
| 数组监听   | 重写 7 个方法         | 原生支持         |
| 对象监听   | 需手动调用 $set       | 自动检测         |
| 初始化方式 | 预递归所有属性        | 懒递归           |
| 性能       | 大型对象初始化慢      | 按需创建，更高效 |
| 依赖管理   | Dep 类 + Watcher 类   | Effect 系统      |

### 迁移注意事项

从 Vue2 迁移到 Vue3 时：

1. **不再需要 $set/$delete**：Proxy 原生支持属性添加和删除
2. **数组操作**：可以直接使用 `arr[index] = value`
3. **响应式创建**：使用 `reactive()` 代替 `Vue.observable()`
4. **computed 写法**：Composition API 中使用 `computed()` 函数
