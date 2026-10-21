# ADR 0006: Sub2API 站点排除与彻底静默机制

在多站点部署与社区二次开发的 Sub2API 生态中，部分第三方站点存在重度前端魔改，与本插件的 DOM 操作及接口拦截产生兼容性冲突甚至导致页面崩溃。

我们决定引入基于整站域名（Origin）的排除机制，并在被排除站点上实行彻底静默（Total Silence）：
1. **整站域名排除**：以 `location.origin` 为隔离粒度，将排除站点持久化保存在全局名单（`sub2api-helper:global:excluded-origins`）中；
2. **彻底静默与前置旁路**：被排除站点不注入任何 DOM 元素（包括设置悬浮按钮）、不注册页面 MutationObserver，并在 `fetch` / `XHR` 拦截器最顶层首行透传放行；
3. **扩展原生菜单兜底**：通过 Tampermonkey 原生扩展菜单（`GM_registerMenuCommand`）提供「排除当前网站 / 恢复启用」切换命令与设置面板入口，操作后自动触发 `location.reload()` 确保运行时环境干净回滚与重载；
4. **跨站集中管理**：在正常站点的设置面板中展示已排除站点列表，支持全局一键移除解禁。
