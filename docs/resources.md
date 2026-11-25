# UI resources

Rule: **before writing any component by hand, search the shadcn MCP and this file.** The project uses shadcn/ui on Base UI (`components.json` style `base-nova`), Tailwind v4 and CSS-variable themes.

## shadcn registry

- Search: `npx shadcn@latest search @shadcn -q "<keyword>"`; inspect: `npx shadcn@latest view @shadcn/<item>`; add: `npx shadcn@latest add <item>`.
- The shadcn MCP server (tools `list_components`, `get_component`, `get_component_demo`, `list_blocks`, `get_block`) exposes the same registry to agents.
- Generated components land in `src/components/ui/` (excluded from coverage, do not hand-edit beyond what is needed).

## Blocks and starter dashboards

| Need | Item |
| --- | --- |
| Dashboard shell with sidebar, charts and data table | `@shadcn/dashboard-01` |
| Simple sidebar with grouped navigation | `@shadcn/sidebar-01` |
| Sidebar that collapses to icons | `@shadcn/sidebar-07` |
| Sidebar with collapsible submenus | `@shadcn/sidebar-05` |
| Login page | `@shadcn/login-01` (see `list_blocks` category `login`) |

## Widgets

| Widget | Start from |
| --- | --- |
| `line`, `bar`, `donut` | `@shadcn/chart` (Recharts) and its chart examples |
| `table` | `@shadcn/table` with TanStack Table and TanStack Virtual |
| `kpi`, `status` | `@shadcn/card`, `@shadcn/badge` |
| Dashboard grid | react-grid-layout |

## Themes

Themes are CSS variables in `src/app/globals.css` (light and dark). The theme and the rules for using its colors are in [design.md](design.md): read it before changing a color. Keep the variable names shadcn expects so components keep working.
