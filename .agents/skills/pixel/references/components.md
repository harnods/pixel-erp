# Components

Use this when creating UI

## Rules

1. Call `get-component("button")` to validate uncertain props, slots, or emits, or call `get-component("button group example")` for a usage example
2. Call `get-block("list all")` to get all available blocks
3. Resolve TypeScript errors by checking docs first, not by force-casting.
4. Keep field labeling, help text, and error messaging explicit.

## Component Mapping

### Airene / AI

| Figma Component    | Pixel Component      | Notes                                      |
| ------------------ | -------------------- | ------------------------------------------ |
| Airene Button      | `MpAireneButton`     | Button component for Mekari Airene product |
| Airene Chat Bubble | `MpAireneChatBubble` | Chat Bubble component for Airene           |
| Airene Chat Input  | `MpAireneChatInput`  | Chat Input component for Airene            |

### Components A–F

| Figma Component | Pixel Component                | Notes                                                                                  |
| --------------- | ------------------------------ | -------------------------------------------------------------------------------------- |
| Accordion       | `MpAccordion` + sub-components | Expandable/collapsible content sections                                                |
| Autocomplete    | `MpAutocomplete`               | Input with filtered suggestion dropdown                                                |
| Avatar          | `MpAvatar`, `MpAvatarGroup`    | Displays user image, initials, or icon; supports group stacking                        |
| Badge           | `MpBadge`                      | Small status indicator; use documented `type` and `variant` props only                 |
| Banner          | `MpBanner`                     | Displays a prominent message and related optional actions                              |
| Broadcast       | `MpBroadcast`                  | Full-width announcement bar for announcements and alerts                               |
| Button          | `MpButton`, `MpButtonGroup`    | Triggers actions when clicked; always verify `variant` and `size` props                |
| Carousel        | `MpCarousel`                   | Cycles through a series of items or slides                                             |
| Chart           | `MpChart`                      | Renders bar, line, pie, doughnut, radar, area, gauge, and mix charts                   |
| Checkbox        | `MpCheckbox`                   | Allows user to toggle between checked, unchecked, and indeterminate states             |
| Collapse        | `MpCollapse`                   | Toggles visibility of content with animation                                           |
| Color Picker    | `MpColorPicker`                | Lets user select or input a color value                                                |
| Date Picker     | `MpDatePicker`                 | Calendar-based input for selecting dates or date ranges                                |
| Divider         | `MpDivider`                    | Separates content horizontally or vertically                                           |
| Drawer          | `MpDrawer` + sub-components    | Panel that slides out from the screen edge without leaving the current page            |
| Dropzone        | `MpDropzone`                   | File upload area with drag-and-drop support                                            |
| Flex            | `MpFlex` / `Pixel.div`         | One-dimensional layout model for arranging children, Prefer these over raw layout HTML |
| Form control    | `MpFormControl`                | Wrapper that passes id, disabled, invalid, and required state to form fields           |

### Components I–R

| Figma Component  | Pixel Component                         | Notes                                                                                        |
| ---------------- | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| Icon             | `MpIcon`                                | SVG icon; always verify name with `get-icon-name` — 403 icons available                      |
| Image            | `MpImage`                               | Renders images with layout, lazy loading, srcset, and placeholder support                    |
| Input            | `MpInput`                               | Text input with variants, sizes, clearable, and input-group support; wrap in `MpFormControl` |
| Input Tag        | `MpInputTag`                            | Multi-value tag input with suggestions, free-tag, and infinity scroll                        |
| Loader           | `MpLoader` / `MpSkeleton` / `MpSpinner` | Use Skeleton for content placeholder, Spinner for in-progress, Loader for page-level         |
| Modal            | `MpModal` + sub-components              | Overlay dialog with scroll behavior, size, and focus management                              |
| Popover          | `MpPopover` + sub-components            | Provides supplemental information or action lists anchored to a trigger element              |
| Progress         | `MpProgress`                            | Linear or circular progress indicator                                                        |
| Radio            | `MpRadio`                               | Represents a single option in a mutually exclusive list                                      |
| Rating           | `MpRating`                              | Displays and captures star or heart ratings with optional value description                  |
| Rich text editor | `MpRichTextEditor`                      | Full-featured content editor based on Tiptap.js with mention, attach, and format tools       |

### Components S–Z

| Figma Component   | Pixel Component            | Notes                                                                     |
| ----------------- | -------------------------- | ------------------------------------------------------------------------- |
| Scrollbar         | `MpScrollbar`              | Custom scrollbar component                                                |
| Segmented control | `MpSegmentedControl`       | Alternative to a radio group; supports icon-only, label, or both          |
| Select            | `MpSelect`                 | Dropdown select; wrap in `MpFormControl` for label and validation         |
| Skeleton          | `MpSkeleton`               | Loading placeholder that mirrors content shape; supports color and timing |
| Slider            | `MpSlider`                 | Range input with label, min/max, step, gradient color, and custom slots   |
| Spinner           | `MpSpinner`                | Indicates loading state of a component or page                            |
| Table             | `MpTable` + sub-components | Data table with fixed header, borders, hover, and shadow container        |
| Tabs              | `MpTabs` + sub-components  | Tabbed navigation for switching between related content panels            |
| Tag               | `MpTag`                    | Label that can optionally be selected, unselected, or removed             |
| Text              | `MpText`                   | Typography component; verify valid `size` values before use               |
| Textarea          | `MpTextarea`               | Multi-line text input; wrap in `MpFormControl` for validation             |
| Textlink          | `MpTextlink`               | Button styled as an inline text link                                      |
| Timeline          | `MpTimeline`               | Displays a list of events in chronological order with status indicators   |
| Toast             | `toast` (function)         | Transient notification with position, variant, and duration options       |
| Toggle            | `MpToggle`                 | On/off switch as an alternative appearance to a checkbox                  |
| Tooltip           | `MpTooltip` / `v-tooltip`  | Shows supplemental label on hover; use for supporting context only        |
| Tour              | `MpTour`                   | Step-by-step product tour that highlights UI elements                     |
| Upload            | `MpUpload`                 | File input with upload list, preview, loading state, and validation       |

## Block Mapping

For each UI section, resolve in this order — stop at the first match:

1. **`pixel-blocks/` folder** — block already installed locally (e.g. `pixel-blocks/general-layout-pagination-default.vue`) → use it directly, no MCP call.
2. **Reference file has full code** — if the pattern reference (`index-view.md`, `mekari-screen.md`, etc.) already has a complete Vue example for the section, then use that; no MCP call is needed.
3. **Call `get-block("<name>")`** — only if neither above applies. Use the table below to find the right block name, then copy and adapt the output.

| UI section you're about to build                               | Block to fetch first                   |
| -------------------------------------------------------------- | -------------------------------------- |
| Full app shell (navbar + sidebar + content area)               | `general-layout-mekari-screen-default` |
| Page header with breadcrumb + title + CTA                      | `general-layout-page-header-backlink`  |
| Page header with title + action buttons (no breadcrumb)        | `general-layout-page-header-default`   |
| Pagination with rows-per-page + page jump + prev/next          | `general-layout-pagination-default`    |
| Pagination minimal (prev/next only)                            | `general-layout-pagination-minimal`    |
| Data table with filter and pagination                          | `general-data-table`                   |
| Key-value description list (detail view / record summary)      | `general-display-description-list`     |
| Blank-slate illustrated empty state (first-time, no data ever) | `general-display-empty-state`          |
| Confirmation / destructive-action modal                        | `general-form-modal-confirmation`      |
| Popover select / dropdown select in a form                     | `general-form-popover-select`          |
| Multi-section form (inputs, select, textarea, upload)          | `general-form-form`                    |

## Common Traps

- Do not assume generic size values like `sm`, `md`, `lg`, or `xl`.
- Do not assume arbitrary icon names exist in the Pixel icon set, call `get-icon-name` for validation.
- Do not pass numbers where the component expects strings, call `get-component` for prop type validation.
- Do not skip `MpFormControl` when the field needs validation or error messaging.

| Custom pattern you might reach for        | Pixel component to check first                     |
| ----------------------------------------- | -------------------------------------------------- |
| `MpFlex + MpIcon + MpText` as a text link | `MpTextlink` (has `left-icon`, `right-icon` props) |
| Colored dot + label for status            | `MpBadge`                                          |
| Pill with count                           | `MpTag` or `MpBadge`                               |
| Horizontal rule / divider line            | `MpDivider`                                        |
| Tooltip-wrapped icon button               | `MpTooltip` wrapping `MpButton variant="ghost"`    |
