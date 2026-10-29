# Component registry

A [shadcn registry](https://ui.shadcn.com/docs/registry) of core's
components, for projects outside the framework: a website, a documentation
site. It is generated from `components/ui`, `lib/utils.ts`, `hooks/` and the
theme contract by `scripts/build-registry.ts`; do not edit it by hand.

```sh
bun run registry:build   # regenerate after changing a component
bun run registry:check   # fails when this folder is out of date (so do the tests)
```

## Installing components

Add the registry to your `components.json`, pointing at the branch or tag you
want to follow:

```json
"registries": {
  "@recommand": "https://raw.githubusercontent.com/recommand/recommand-core/main/registry/{name}.json"
}
```

Then install components by name:

```sh
npx shadcn@latest add @recommand/button @recommand/dialog
```

Each component brings what it needs: other components, `utils`, hooks, npm
packages and the `theme` item.

## Theme

The `theme` item writes `styles/recommand-ui/theme-default.css` (the theme
contract with neutral defaults) and `styles/recommand-ui/variants.css` (the
state variants the components use). Import them after Tailwind and
tw-animate-css, then your own theme, which sets any token of the contract:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "./styles/recommand-ui/variants.css";
@import "./styles/recommand-ui/theme-default.css";
@import "./my-theme.css";
```

`THEMING.md` in this repository describes the tokens.

## Translations

A few components carry text, mostly for screen readers ("Close", "Toggle
Sidebar"). They call `useTranslation` from `hooks/use-translation.ts`, which
the registry installs as a stand-in that returns the English text. Replace
it with an adapter to your own i18n library to translate them.
