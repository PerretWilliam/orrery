# Design

The visual charter of Orrery, theme **Violet vif**. A dashboard shows many numbers at once: colour has to say something, so each colour has one job.

The values live in [`src/app/globals.css`](../src/app/globals.css), light and dark. Components use the token classes (`bg-card`, `text-muted-foreground`, `text-success`), never raw colours such as `text-emerald-600` or hand-written `dark:` colour overrides.

## One job per colour

| Job | Tokens | Rule |
| --- | --- | --- |
| Surfaces and text | `background`, `card`, `muted`, `foreground`, `muted-foreground`, `border` | Violet-tinted neutrals. Most of the screen. |
| Action and navigation | `primary`, `ring` | Primary buttons, links, focus. Violet. |
| Selection | `secondary`, `accent` | The active item: soft violet. |
| Data | `chart-1` to `chart-5` | Charts only. |
| State | `success`, `warning`, `destructive` | Up, degraded, down, alerts, errors. |
| Brand | `brand`, `brand-deep`, `brand-foreground` | The sign-in panel only: `#6a3cf0` to `#3b1f9e` with white text, the same in both modes. |

| Token | Light | Dark |
| --- | --- | --- |
| `background` | `#f6f4fd` | `#15131d` |
| `card` | `#ffffff` | `#201d2b` |
| `foreground` | `#17132a` | `#f0eefa` |
| `muted-foreground` | `#625d75` | `#a39fb8` |
| `border` | `#e8e4f6` | `#332f45` |
| `primary` | `#6a3cf0` | `#a587ff` |
| `secondary` | `#eee8fe` | `#30264f` |
| `success` | `#087a08` | `#3fcf4a` |
| `warning` | `#8a5a00` | `#fab219` |
| `destructive` | `#b42323` | `#ff7b7b` |

## Charts

| Order | Hue | Light | Dark |
| --- | --- | --- | --- |
| `chart-1` | violet | `#6250d6` | `#9085e9` |
| `chart-2` | orange | `#eb6834` | `#d95926` |
| `chart-3` | blue | `#2a78d6` | `#3987e5` |
| `chart-4` | yellow | `#eda100` | `#c98500` |
| `chart-5` | pink | `#e87ba4` | `#d55181` |

- A single series uses `chart-1`. Several series take the colours in this order, which keeps neighbours apart for colour-blind readers.
- Colour is never the only way to tell two things apart: name them in a legend, a label or a table. In light mode this is required, because yellow and pink are below 3:1 on a white card.
- Chart colours never mean a state, and state colours are never used for a series.
- Past five categories, group the rest as "Other" rather than adding a colour. The donut widget does not do this yet: it repeats the colours.
- Changing a chart colour or the order means checking the whole set again for colour-blind separation, in both modes.

## State

Always a word with the colour, and an icon where the state stands alone (see the `status` and `kpi` widgets).

GitHub activity badges:

| Colour | States |
| --- | --- |
| `success` | `open`, `success`, `released` |
| `warning` | `queued`, `requested`, `waiting`, `pending`, `in_progress`, `action_required`, `prerelease` |
| `destructive` | `failure`, `timed_out`, `startup_failure` |
| `secondary` (violet) | `merged` |
| outline (neutral) | `closed`, `draft`, `cancelled`, `skipped` and any other |

Badges from a source's own data (a `badge` table column) stay violet: the hub does not know what their words mean. A trend arrow stays neutral for the same reason: the hub does not know whether up is good.

A widget that failed is a card with a `destructive` outline and wash, an icon, then what happened, how to fix it and the stable code. A widget with nothing to show stays neutral.

## Logo

[`src/app/icon.svg`](../src/app/icon.svg): an orrery whose arms are Git branches. The sun and its orbit on a pedestal, each branch ending in a commit that is also a planet: the code and what turns around it. White on the light-mode `primary` (`#6a3cf0`), the same in both modes. A project colour never changes it.

## Feedback

A form that worked says so in a toast (bottom right, [Ding](https://ding.yusufcengiz.dev)) painted with the tokens above. A failure stays on the page, with its code and fix: it must still be there when the reader gets to it.

## Project colour

`project.color` in `.hub.yml` replaces `primary` and `ring` inside that project's view, with black or white text chosen for contrast. It does not change charts' `chart-*` tokens or state colours.

## Loading

What is the same on every visit is drawn at once (the brand, the sign-in panel, the sidebar once loaded). The rest is a skeleton shaped like what is coming, in the same place: never an empty screen. The sidebar stays while pages change.

## Contrast

Text pairs of the tables above are at least 4.5:1 in both modes. Keep it that way when a value changes. A project colour is the repository's choice and is not held to this for text drawn in it on a card.

## Shape and type

- Base radius `0.75rem` (`--radius`); cards use `rounded-xl`. Use the radius scale, not pixel values.
- Geist for text, Geist Mono for code. Numbers in metrics and tables use `tabular-nums`.
- Cards sit on the tinted `background`; the sidebar (and the top bar that replaces it on a phone) is a `card` surface. The current section or page is marked with the soft violet of selection.
