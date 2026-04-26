# Components

Use this file to map UI needs to Pixel components, then verify uncertain props with `get-component`.

## Mapping Guide

| UI Need              | Pixel Component                       | Notes                                               |
| -------------------- | ------------------------------------- | --------------------------------------------------- |
| Heading or body text | `MpText`                              | Check valid `size` values before setting them       |
| Icon                 | `MpIcon`                              | Check valid `name` values before setting them       |
| Action button        | `MpButton`, `MpButtonGroup`           | Validate `variant`, `size`, and icon props          |
| Text input           | `MpInput` in `MpFormControl`          | Add label, help text, and error state explicitly    |
| Textarea             | `MpTextarea` in `MpFormControl`       | Keep validation and help text close to the field    |
| Select or dropdown   | `MpSelect` in `MpFormControl`         | Verify option shape and supported slots             |
| Select with tag      | `MpInputTag`                          | Verify props and supported slots                    |
| Checkbox or radio    | `MpCheckbox`, `MpRadio`, `MpToggle`   | Preserve accessible labels and state                |
| Date picker          | `MpDatePicker` in `MpFormControl`     | Verify formatting and value contract                |
| Modal or drawer      | `MpModal`, `MpDrawer`                 | Handle open state, close action, and focus behavior |
| Tooltip or popover   | `MpTooltip`, `MpPopover`              | Use for supporting context, not core content        |
| Table                | `MpTable`                             | Validate column and row APIs                        |
| Banner or alert      | `MpBanner`                            | Use for status and critical feedback                |
| Badge or tag         | `MpBadge`, `MpTag`                    | Use documented color and variant props only         |
| Avatar or icon       | `MpAvatar`, `MpIcon`                  | Use only valid icon names                           |
| Loading state        | `MpSpinner`, `MpSkeleton`, `MpLoader` | Match loading shape to final content                |
| Layout container     | `MpFlex`, `Pixel.div`                 | Prefer these over raw layout HTML                   |

## Validation Rules

1. Run `get-component("ComponentName")` before choosing unfamiliar props.
2. Prefer documented defaults instead of force-setting every prop.
3. Resolve TypeScript errors by checking docs first, not by force-casting.
4. Keep field labeling, help text, and error messaging explicit.

## Common Traps

- Do not assume generic size values like `sm`, `md`, `lg`, or `xl`.
- Do not assume arbitrary icon names exist in the Pixel icon set.
- Do not pass numbers where the component expects strings.
- Do not skip `MpFormControl` when the field needs validation or error messaging.

## Mini Patterns

### Validated Field

```vue
<MpFormControl id="email" :is-error="isError" is-required>
  <MpFormLabel>Email</MpFormLabel>
  <MpInput v-model="email" type="email" placeholder="name@company.com" />
  <MpFormErrorMessage>Email is required</MpFormErrorMessage>
</MpFormControl>
```

### Modal Action Flow

```vue
<MpModal v-model="isOpen">
  <MpModalHeader>
    Confirm action
    <MpModalCloseButton />
  </MpModalHeader>
  <MpModalContent>
    <MpModalBody>
      <MpText>Review the impact before continuing.</MpText>
    </MpModalBody>
    <MpModalFooter>
      <MpButtonGroup>
        <MpButton variant="secondary" @click="isOpen = false">Cancel</MpButton>
        <MpButton variant="primary">Confirm</MpButton>
      </MpButtonGroup>
    </MpModalFooter>
  </MpModalContent>
</MpModal>
```
