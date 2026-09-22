# Changelog
All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Next
- First release

### Changed
- 构建从 `parcel-bundler@1.12` + `pug` + `typescript@3.8` 迁移到 Vite 8 + TypeScript 5.9；
  入口由 `public/index.pug` 改为仓库根目录的 `index.html`（issue #1）
- 样式移到 `src/styles/styles.less`、贴图移到 `src/assets/entities/`，分别由 `src/main.ts`
  与 `src/tools/texturePaths.ts` 静态 import；贴图缺失或改名现在会让构建失败
- `package.json` 的 `engines` 由上游遗留的 `>=14 <18` 改为 `>=20.19.0`，
  并移除 parcel 专用的 `overrides`，因此不再需要 Node 16 虚拟环境（删除 `start.bat`
  与 `.NODE_ENV_README.md`）
- license 声明更正为 GPL-3.0：上游 README 写的是 MIT，但上游 `LICENSE` 与 GitHub
  识别结果都是 GNU GPL-3.0
- 移除 `public/index.pug` 中的 Plausible 条件埋点（本项目未使用；Vite 的静态 HTML
  无法按环境变量条件注入）
