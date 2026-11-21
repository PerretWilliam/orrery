# Changelog

## [0.2.0](https://github.com/PerretWilliam/orrery/compare/orrery-v0.1.0...orrery-v0.2.0) (2026-11-21)


### Features

* **access:** apply the admin's sign-in allowlist and per-project rules ([#19](https://github.com/PerretWilliam/orrery/issues/19)) ([520d64e](https://github.com/PerretWilliam/orrery/commit/520d64e658224218efa3ec5809c9a7d8a470529e))
* **access:** map GitHub permissions to capabilities with a fail-closed cache ([#17](https://github.com/PerretWilliam/orrery/issues/17)) ([3abd140](https://github.com/PerretWilliam/orrery/commit/3abd140d794720479dfd9a02dba345d70dc43299))
* **auth:** add GitHub sign-in with rolling sessions and token refresh ([#16](https://github.com/PerretWilliam/orrery/issues/16)) ([ed2507e](https://github.com/PerretWilliam/orrery/commit/ed2507ec7d4badcecb8ebcb243cf097124c1bf76))
* **cli:** publish JSON Schema and add orrery validate ([#13](https://github.com/PerretWilliam/orrery/issues/13)) ([c3eac30](https://github.com/PerretWilliam/orrery/commit/c3eac30ee90cb6bed79c79f9e7f0080e995874cd))
* **config:** add frozen .hub.yml v1 Zod schema ([#10](https://github.com/PerretWilliam/orrery/issues/10)) ([5f737eb](https://github.com/PerretWilliam/orrery/commit/5f737ebbf3c3f09035fe2db7c50b8e0cbaf42d1f))
* **config:** add secure .hub.yml parser and safe JSON path extractor ([#11](https://github.com/PerretWilliam/orrery/issues/11)) ([b841e56](https://github.com/PerretWilliam/orrery/commit/b841e56a192a9b3db3e40f87e56e2e15e9d34da8))
* **config:** add structured error catalog with suggested fixes ([#12](https://github.com/PerretWilliam/orrery/issues/12)) ([351853d](https://github.com/PerretWilliam/orrery/commit/351853dcd08d802d80a127e9468176b2c3e11f99))
* **db:** add Drizzle schema with indexes and startup migrations ([#8](https://github.com/PerretWilliam/orrery/issues/8)) ([87ee117](https://github.com/PerretWilliam/orrery/commit/87ee117374797169ca43bcde9f044766e0183f64))
* **i18n:** add next-intl with English catalog and no-literal-string lint rule ([#7](https://github.com/PerretWilliam/orrery/issues/7)) ([f860656](https://github.com/PerretWilliam/orrery/commit/f860656181af50e73c19eaaefb66c04dd5832c52))
* initialize Next.js app with strict TS, Tailwind v4, shadcn and feature structure ([e3552a0](https://github.com/PerretWilliam/orrery/commit/e3552a0a136f263f4cfd7f921a223f415bf80a13))
* **ops:** add /healthz, /readyz and JSON logger ([#9](https://github.com/PerretWilliam/orrery/issues/9)) ([e3d2ecc](https://github.com/PerretWilliam/orrery/commit/e3d2eccd91743cb5d6f785d4f65e783595368e40))
* **repos:** add the tab shell with project and page navigation ([#21](https://github.com/PerretWilliam/orrery/issues/21)) ([36ec8c6](https://github.com/PerretWilliam/orrery/commit/36ec8c6d7931833c9f53b4685f0ef415178d3079))
* **repos:** discover repositories with a .hub.yml through a GitHub adapter ([#20](https://github.com/PerretWilliam/orrery/issues/20)) ([dafa042](https://github.com/PerretWilliam/orrery/commit/dafa0426a2f22ed360557bcd6f519ea37fe4057d))
* **secrets:** add AES-256-GCM crypto and host-bound secret resolution ([#14](https://github.com/PerretWilliam/orrery/issues/14)) ([77cc097](https://github.com/PerretWilliam/orrery/commit/77cc097c6c062cf15d6748448455a4b4aa62c2ae))
* **setup:** add first-run wizard with setup token and GitHub App manifest flow ([#15](https://github.com/PerretWilliam/orrery/issues/15)) ([26c2777](https://github.com/PerretWilliam/orrery/commit/26c27772e76b22834b80b20b8a2566c077e74460))
* **webhooks:** invalidate cached permissions from signed GitHub webhooks ([#18](https://github.com/PerretWilliam/orrery/issues/18)) ([b558de0](https://github.com/PerretWilliam/orrery/commit/b558de0168bc3ac4f0e19d94abbdd3a7a3b7b662))


### Bug Fixes

* **setup:** leave the webhook out of the manifest when GitHub cannot reach the instance ([#24](https://github.com/PerretWilliam/orrery/issues/24)) ([3128960](https://github.com/PerretWilliam/orrery/commit/3128960ee08d42e3978fd2f6b78c1930a6cae0d6))
