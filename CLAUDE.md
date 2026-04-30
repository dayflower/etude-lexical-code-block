## Commands

```bash
npm run dev      # start Vite dev server
npm run build    # type-check (tsc) then build to docs/ for GitHub Pages
npm run preview  # preview production build locally
npm run check    # Biome lint/format check (read-only)
npm run fix      # auto-fix Biome issues
```

There are no automated tests in this project.

## Architecture

See [notes/DESIGN.md](notes/DESIGN.md) for detailed architecture documentation.

## Tooling

- **Biome** for linting and formatting (double quotes for JS/TS, organize imports on)
- **TypeScript** in strict mode targeting ES2020 (composite project: `tsconfig.app.json` + `tsconfig.node.json`)
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin
