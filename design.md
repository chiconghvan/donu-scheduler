# Design System

## Style
Dark OLED technical cockpit. Dense but calm. No legacy layout, colors, spacing, tabs, or rail copied.

## Tokens
Backgrounds: `#09090b`, `#18181b`, `#27272a`.

Text: `#fafafa`, `#a1a1aa`, `#71717a`.

Accent: blue `#3b82f6`, green `#22c55e`, yellow `#eab308`, red `#ef4444`, purple `#a855f7`, cyan `#06b6d4`.

Radius: 4, 6, 8, 12, full.

Spacing: 4, 8, 12, 16, 20, 24, 32, 40, 48.

Typography: Inter/system for UI, mono for logs/code.

## Components
Shell: 36px top header, 56px sidebar, scrollable content.

Sidebar: icon-only, tooltip on hover, active blue surface.

Card: raised surface, 1px border, 8px radius, no scale hover.

Button: primary/secondary/danger/ghost/success, 32px default height.

Input/select/textarea: dark surface, visible focus glow.

Table: sticky header, dense rows, hover surface.

Tabs: underline active state.

Dialog: centered overlay, raised surface, explicit footer actions.

Toast: bottom-right stack, semantic left border.

Badge/status: semantic colors, running uses pulse dot.

Log viewer: black mono panel, source-specific line color, auto-scroll.

Empty/loading/error: reusable visual states.

Theme: dark default. Light theme deferred.
