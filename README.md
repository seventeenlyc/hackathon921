# Inert

Minimalistic tower defense in the browser. [Try it!](https://inert.thomasset.me)

[![demo](.github/demo.png)](https://inert.thomasset.me)

This repository is a fork of [CorentinTh/inert](https://github.com/CorentinTh/inert),
used as the tower-defense base of the **Prompt Defense** hackathon project.
The upstream game is linked above; this fork's build and deployment pipeline is
described in `docs/DEPLOYMENT.md`.

## Dev

```shell
npm install
npm run dev
# open http://localhost:5173/
```

Other scripts:

```shell
npm run build     # vite build -> dist/
npm run preview   # serve the built dist/ locally
npm test          # build + texture-asset checks + agent action tests
```

## Credits

Coded with ❤️ by [Corentin Thomasset](//corentin-thomasset.fr).

The upstream project is continuously deployed using [vercel.com](https://vercel.com).
This fork is deployed from GitHub Actions; see `docs/DEPLOYMENT.md`.

## License

This project is under the [GNU GPL-3.0 license](LICENSE).
