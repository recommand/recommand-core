# Theming core

Core's components read a fixed set of CSS variables and Tailwind tokens: the
theme contract. `app/theme-default.css` defines all of them with neutral
values. A deployment gives the app its own look by setting any of them in a
theme of its own; tokens the theme leaves out keep their default.

## Adding a theme

List the theme's stylesheets under `recommand.theme` in the deployment's root
`package.json`, as package specifiers or paths:

```json
{
  "recommand": {
    "theme": ["@acme/brand/fonts.css", "@acme/brand/theme.css"]
  }
}
```

The framework imports them after `theme-default.css`, in the same Tailwind
build. A theme is plain CSS: set the variables in `:root` and in `.dark` (or
`[data-theme="dark"]`), and Tailwind tokens in an `@theme` block. It may also
define tokens of its own for the deployment's packages to use; core
components never read those.

## The contract

### Colours

Set each as a variable in `:root` and `.dark`. Each is available as a
Tailwind colour (`bg-<name>`, `text-<name>`, `border-<name>`).

The standard shadcn/ui variables, with their usual meaning: `background`,
`foreground`, `card`, `card-foreground`, `popover`, `popover-foreground`,
`primary`, `primary-foreground`, `secondary`, `secondary-foreground`,
`muted`, `muted-foreground`, `accent`, `accent-foreground`, `destructive`,
`border`, `input`, `ring`, `chart-1` to `chart-5`, `sidebar`,
`sidebar-foreground`, `sidebar-primary`, `sidebar-primary-foreground`,
`sidebar-accent`, `sidebar-accent-foreground`, `sidebar-border`,
`sidebar-ring`. `accent` is the hover and menu highlight.

Extensions:

| Token | Used for |
| --- | --- |
| `active` | A selected row, item, chip or option |
| `placeholder` | Placeholder text in fields |
| `disabled` | Text of disabled controls |
| `overlay` | The backdrop behind dialogs and sheets |
| `sidebar-muted-foreground` | Group labels and secondary text in the sidebar |
| `success`, `success-soft`, `success-line` | Success text and icons; the fill and border of a success notice |
| `warning`, `warning-foreground`, `warning-soft`, `warning-line` | Warning marks and borders (and invalid fields); warning text; the fill and border of a warning notice |
| `destructive-soft` | The border of a destructive button and the fill of a destructive notice |
| `info-soft`, `info-line` | The fill and border of an informational notice |
| `status-normal`, `status-positive`, `status-attention` | Status indicators: in progress or in order; the outcome the user is after; needs attention |

### Sizes

Tailwind spacing tokens, so `h-control`, `w-sidebar` and so on.

| Token | Default | Used for |
| --- | --- | --- |
| `control` | 2rem | Buttons, inputs, selects, toggles |
| `control-sm` | 1.75rem | Small buttons and controls |
| `control-lg` | 2.25rem | Large buttons; fields in standalone forms |
| `table-head` | 2.5rem | Table header row |
| `table-row` | 3rem | Minimum table row height |
| `topbar` | 3.5rem | The top bar of the app |
| `sidebar` | 16rem | The sidebar width |
| `drawer` | 24rem | The width of a sheet used as a drawer |
| `card` | 1rem | Padding inside cards |
| `tabs` | 2.5rem | The height of a row of underlined tabs |

### Type

| Token | Default | Used for |
| --- | --- | --- |
| `--font-weight-button` | 500 | Button labels (`font-button`) |
| `--font-weight-title` | 500 | Card and dialog titles (`font-title`) |
| `--text-button-sm` | 12.8 / 16 | Labels of small buttons (`text-button-sm`) |
| `--text-micro` | 11 / 16 | Counts, hints and other very small text (`text-micro`) |
| `--text-table-head` | 14 / 20, 500 | Table header cells (`text-table-head`) |
| `--table-head-transform` | `none` | `uppercase` to set table heads in capitals |

Body text uses Tailwind's own scale (`text-sm`, `text-xs`, ...) and
`--font-sans` and `--font-mono`; a theme may redefine those too.

### Shape and depth

`--radius` sets the default radius, and `--radius-sm` to `--radius-xl` derive
from it unless the theme sets them itself. Shadows use Tailwind's `shadow-*`
steps, which a theme may redefine.

## Keeping components on the contract

`bun run check:theme` fails when a component under `components/` uses a
colour, size or type token outside this contract, or a raw colour such as
`bg-red-500` or `text-[#123456]`.
