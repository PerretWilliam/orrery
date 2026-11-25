# Changelog

## [1.0.0](https://github.com/PerretWilliam/orrery/compare/v0.1.0...v1.0.0) (2026-11-25)


### Features

* **access:** apply the admin's sign-in allowlist and per-project rules ([#19](https://github.com/PerretWilliam/orrery/issues/19)) ([520d64e](https://github.com/PerretWilliam/orrery/commit/520d64e658224218efa3ec5809c9a7d8a470529e))
* **access:** map GitHub permissions to capabilities with a fail-closed cache ([#17](https://github.com/PerretWilliam/orrery/issues/17)) ([3abd140](https://github.com/PerretWilliam/orrery/commit/3abd140d794720479dfd9a02dba345d70dc43299))
* **admin:** add the instance settings screen, key rotation and audit log ([7b6d054](https://github.com/PerretWilliam/orrery/commit/7b6d054bdad921d134d4a7fd2c63d37d66d0e3be))
* **agents:** add per-user agent tokens, hashed, expiring and revocable ([#41](https://github.com/PerretWilliam/orrery/issues/41)) ([378ee75](https://github.com/PerretWilliam/orrery/commit/378ee751df0d44e0c25056c71167bb4b8b488cb5))
* **api:** add the read-only REST API /api/v1 with its OpenAPI spec ([#42](https://github.com/PerretWilliam/orrery/issues/42)) ([eb84d03](https://github.com/PerretWilliam/orrery/commit/eb84d031409df2034a5d8be0bb78a34ca28362e0))
* **audit:** add the append-only audit log with a one-year retention ([bc73829](https://github.com/PerretWilliam/orrery/commit/bc7382919b492022b6fbd2098c530369af89f90b))
* **auth:** add GitHub sign-in with rolling sessions and token refresh ([#16](https://github.com/PerretWilliam/orrery/issues/16)) ([ed2507e](https://github.com/PerretWilliam/orrery/commit/ed2507ec7d4badcecb8ebcb243cf097124c1bf76))
* **cli:** add orrery preview, a dry run of a source or widget through an instance ([#44](https://github.com/PerretWilliam/orrery/issues/44)) ([63c56e1](https://github.com/PerretWilliam/orrery/commit/63c56e1addfe45ddeb053ae60f09802d7bbc2069))
* **cli:** publish JSON Schema and add orrery validate ([#13](https://github.com/PerretWilliam/orrery/issues/13)) ([c3eac30](https://github.com/PerretWilliam/orrery/commit/c3eac30ee90cb6bed79c79f9e7f0080e995874cd))
* **config:** add frozen .hub.yml v1 Zod schema ([#10](https://github.com/PerretWilliam/orrery/issues/10)) ([5f737eb](https://github.com/PerretWilliam/orrery/commit/5f737ebbf3c3f09035fe2db7c50b8e0cbaf42d1f))
* **config:** add secure .hub.yml parser and safe JSON path extractor ([#11](https://github.com/PerretWilliam/orrery/issues/11)) ([b841e56](https://github.com/PerretWilliam/orrery/commit/b841e56a192a9b3db3e40f87e56e2e15e9d34da8))
* **config:** add structured error catalog with suggested fixes ([#12](https://github.com/PerretWilliam/orrery/issues/12)) ([351853d](https://github.com/PerretWilliam/orrery/commit/351853dcd08d802d80a127e9468176b2c3e11f99))
* **data-proxy:** add the SSRF guard for source URLs ([#26](https://github.com/PerretWilliam/orrery/issues/26)) ([a127aa4](https://github.com/PerretWilliam/orrery/commit/a127aa43047c54befed9f3163c651347bfd5ecb9))
* **data-proxy:** cache source responses with stale-while-revalidate ([#28](https://github.com/PerretWilliam/orrery/issues/28)) ([b47e8ec](https://github.com/PerretWilliam/orrery/commit/b47e8ecebca27ff9361cf83b94022a1230130b59))
* **data-proxy:** limit what a source can send back ([#27](https://github.com/PerretWilliam/orrery/issues/27)) ([58a8a05](https://github.com/PerretWilliam/orrery/commit/58a8a05e6ee0a549fe95955bfb9e0e0f282cab5f))
* **db:** add Drizzle schema with indexes and startup migrations ([#8](https://github.com/PerretWilliam/orrery/issues/8)) ([87ee117](https://github.com/PerretWilliam/orrery/commit/87ee117374797169ca43bcde9f044766e0183f64))
* **docker:** add the image, the reference compose file and publishing on release ([#47](https://github.com/PerretWilliam/orrery/issues/47)) ([79dd41d](https://github.com/PerretWilliam/orrery/commit/79dd41dbfd0600d92628362d779b317f0c7ee50e))
* **i18n:** add next-intl with English catalog and no-literal-string lint rule ([#7](https://github.com/PerretWilliam/orrery/issues/7)) ([f860656](https://github.com/PerretWilliam/orrery/commit/f860656181af50e73c19eaaefb66c04dd5832c52))
* initialize Next.js app with strict TS, Tailwind v4, shadcn and feature structure ([e3552a0](https://github.com/PerretWilliam/orrery/commit/e3552a0a136f263f4cfd7f921a223f415bf80a13))
* **mcp:** add the read-only MCP server over Streamable HTTP ([#43](https://github.com/PerretWilliam/orrery/issues/43)) ([879b296](https://github.com/PerretWilliam/orrery/commit/879b29607e96d81c796806692976ed6d2836cc8d))
* **ops:** add /healthz, /readyz and JSON logger ([#9](https://github.com/PerretWilliam/orrery/issues/9)) ([e3d2ecc](https://github.com/PerretWilliam/orrery/commit/e3d2eccd91743cb5d6f785d4f65e783595368e40))
* **repos:** add the tab shell with project and page navigation ([#21](https://github.com/PerretWilliam/orrery/issues/21)) ([36ec8c6](https://github.com/PerretWilliam/orrery/commit/36ec8c6d7931833c9f53b4685f0ef415178d3079))
* **repos:** discover repositories with a .hub.yml through a GitHub adapter ([#20](https://github.com/PerretWilliam/orrery/issues/20)) ([dafa042](https://github.com/PerretWilliam/orrery/commit/dafa0426a2f22ed360557bcd6f519ea37fe4057d))
* **secrets:** add AES-256-GCM crypto and host-bound secret resolution ([#14](https://github.com/PerretWilliam/orrery/issues/14)) ([77cc097](https://github.com/PerretWilliam/orrery/commit/77cc097c6c062cf15d6748448455a4b4aa62c2ae))
* **secrets:** add the write-only secrets screen for maintainers ([d29f6dd](https://github.com/PerretWilliam/orrery/commit/d29f6ddb08d7698080ad9e38aca992f468bde224))
* **settings:** add the project settings screen with allowed hosts and re-index ([8556e86](https://github.com/PerretWilliam/orrery/commit/8556e8699ff5ca876dc4bf4c120964b05324a941))
* **setup:** add first-run wizard with setup token and GitHub App manifest flow ([#15](https://github.com/PerretWilliam/orrery/issues/15)) ([26c2777](https://github.com/PerretWilliam/orrery/commit/26c27772e76b22834b80b20b8a2566c077e74460))
* **ui:** add light and dark themes with a system default, and the project's accent color ([d746c2f](https://github.com/PerretWilliam/orrery/commit/d746c2f4a8f5ebcb93c7d3e951a45bae9414335c))
* **webhooks:** invalidate cached permissions from signed GitHub webhooks ([#18](https://github.com/PerretWilliam/orrery/issues/18)) ([b558de0](https://github.com/PerretWilliam/orrery/commit/b558de0168bc3ac4f0e19d94abbdd3a7a3b7b662))
* **widgets:** add a registry that loads each widget type lazily, with a weight budget ([1cffa1e](https://github.com/PerretWilliam/orrery/commit/1cffa1e32210cbdae19a323cb6a77d261b2d3845))
* **widgets:** add the cohort retention matrix widget ([17ae641](https://github.com/PerretWilliam/orrery/commit/17ae641da446231a977132b3c05c284774c669e5))
* **widgets:** add the GitHub issues, pull requests, workflow runs and releases widgets ([ba256ba](https://github.com/PerretWilliam/orrery/commit/ba256ba66c1316b3b887955e0b7632c6048fcdcd))
* **widgets:** add the kpi, status and markdown widgets with a strict CSP ([8fc53c8](https://github.com/PerretWilliam/orrery/commit/8fc53c88c9c12fcc491be4bc7b1857ae746029d8))
* **widgets:** add the line, bar and donut widgets on shadcn charts ([8d5c58d](https://github.com/PerretWilliam/orrery/commit/8d5c58da0e5122b7c99faba2859c38c8dc122e54))
* **widgets:** add the table widget, and measure the app shell apart from lazy widget chunks ([3d82230](https://github.com/PerretWilliam/orrery/commit/3d822306e9757ed2e1c6b49bc9ec4953f28f7f78))
* **widgets:** isolate each widget's loading and errors and show how fresh its data is ([b358baf](https://github.com/PerretWilliam/orrery/commit/b358baf74cb4389fef137292cc6549ff8f1f8612))


### Bug Fixes

* **access:** keep prerenders out of the shared permission lookup ([#52](https://github.com/PerretWilliam/orrery/issues/52)) ([95398dd](https://github.com/PerretWilliam/orrery/commit/95398dd472a6163fb1612f59ca65d9a94e7d7282))
* **api:** let a preview send nothing but a GET ([e961743](https://github.com/PerretWilliam/orrery/commit/e96174301a8d7eec5616a8c28ed0ccaf265c2c6b))
* **proxy:** stop showing cached data once its request is no longer allowed ([b07d00a](https://github.com/PerretWilliam/orrery/commit/b07d00a5638cfb05ca5bd6e237d61327924b3ecb))
* **security:** add one negative test per threat and fix the gaps it found ([919396c](https://github.com/PerretWilliam/orrery/commit/919396cc4381d6bc57bfe7ff5d9e1c4954e0ec8b))
* **setup:** leave the webhook out of the manifest when GitHub cannot reach the instance ([#24](https://github.com/PerretWilliam/orrery/issues/24)) ([3128960](https://github.com/PerretWilliam/orrery/commit/3128960ee08d42e3978fd2f6b78c1930a6cae0d6))
* **ui:** set the interface in its font, not the browser's serif default ([beed092](https://github.com/PerretWilliam/orrery/commit/beed0929e594dbf1513820a4a6fe7d77f20a0cfe))
* **ui:** write the theme script as a literal, without interpolation ([367be17](https://github.com/PerretWilliam/orrery/commit/367be179194efc62125d523907524b216926a89f))
* **widgets:** build the crash fallback on the server to keep next-intl out of the client bundle ([c4d4372](https://github.com/PerretWilliam/orrery/commit/c4d43727344c9a71beea42473be17af5b3d34daa))
* **widgets:** keep what a widget shows whole and readable ([d5056d7](https://github.com/PerretWilliam/orrery/commit/d5056d78bceab5eba496912a8907862f8e233291))


### Documentation

* point the version pinning examples at 1.0.0 ([c1c1d3b](https://github.com/PerretWilliam/orrery/commit/c1c1d3bafa08a2b955353ea20adb69989bf3f8d0))
