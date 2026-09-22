# UI5 control coverage plan

The goal is broad realistic HCM coverage, not an artificial copy of the UI5 documentation site.

## Shell and navigation
- ShellBar
- UserMenu or profile menu pattern
- TabContainer
- NavigationLayout
- SideNavigation
- FlexibleColumnLayout
- DynamicPage / Page
- Breadcrumbs
- Toolbar / Bar

## Employee / My Profile
- Avatar / AvatarGroup
- Title / Text / Label / Link
- Tag
- Form / FormGroup / FormItem
- Input / TextArea
- Select / ComboBox / MultiComboBox
- MultiInput / Token / Tokenizer
- DatePicker / DateTimePicker / TimePicker
- CheckBox / RadioButton / Switch
- Button / ToggleButton / SplitButton
- Menu
- Table
- Timeline
- FileUploader / UploadCollection
- MessageStrip / Toast
- Dialog / Popover / ResponsivePopover
- ProgressIndicator
- RatingIndicator for skills

## Leave
- DateRangePicker
- DynamicDateRange
- Calendar / CalendarLegend
- Table/List
- SegmentedButton
- status Tag
- Timeline
- ViewSettingsDialog
- IllustratedMessage for empty state

## Projects
- Table
- Tree or List
- Card / Panel
- ProgressIndicator
- RatingIndicator
- Slider/RangeSlider only where a believable capacity/progress scenario exists
- Toolbar / Menu

## Settings
- ColorPicker
- Input
- Select
- Switch
- Slider / StepInput
- Table
- Dialog
- MessageStrip

## Optional / not forced
Controls such as BarcodeScannerDialog, MediaGallery, Carousel, ProductSwitch and other niche components should only be added if there is a believable HCM use-case. Do not damage the UX just to claim 100% catalog coverage.

## Implemented control locations

The following inventory is derived from the Foundation Lab templates and the two shared floorplan templates and verified against installed Angular wrapper declarations. Structural children such as FormItem and TableCell are counted individually; the inventory count is not an acceptance score. Native controls own rendering, keyboard behavior and responsive layouts. Application CSS supplies spacing and host sizing only.

Installed versions: `@angular/core 22.1.7`, `@fundamental-ngx/ui5-webcomponents 0.64.3`, `@fundamental-ngx/ui5-webcomponents-fiori 0.64.3`, `@ui5/webcomponents 2.26.0`, `@ui5/webcomponents-fiori 2.26.0`, `@ui5/webcomponents-icons 2.26.0`, `@sap-theming/theming-base-content 11.36.5`.

| Component / element | Exact Angular import | Lab location |
| --- | --- | --- |
| `Avatar` / `ui5-avatar` | `@fundamental-ngx/ui5-webcomponents/avatar` | Shell/Home, Demo, Employee |
| `AvatarGroup` / `ui5-avatar-group` | `@fundamental-ngx/ui5-webcomponents/avatar-group` | Demo |
| `Bar` / `ui5-bar` | `@fundamental-ngx/ui5-webcomponents/bar` | Demo, Settings |
| `Breadcrumbs` / `ui5-breadcrumbs` | `@fundamental-ngx/ui5-webcomponents/breadcrumbs` | Demo |
| `BreadcrumbsItem` / `ui5-breadcrumbs-item` | `@fundamental-ngx/ui5-webcomponents/breadcrumbs-item` | Demo |
| `BusyIndicator` / `ui5-busy-indicator` | `@fundamental-ngx/ui5-webcomponents/busy-indicator` | Shell/Home |
| `Button` / `ui5-button` | `@fundamental-ngx/ui5-webcomponents/button` | Shell/Home, Demo, Employee, Settings |
| `Calendar` / `ui5-calendar` | `@fundamental-ngx/ui5-webcomponents/calendar` | Demo |
| `CalendarLegend` / `ui5-calendar-legend` | `@fundamental-ngx/ui5-webcomponents/calendar-legend` | Demo |
| `Card` / `ui5-card` | `@fundamental-ngx/ui5-webcomponents/card` | Shell/Home, Demo, Employee |
| `CardHeader` / `ui5-card-header` | `@fundamental-ngx/ui5-webcomponents/card-header` | Shell/Home, Demo, Employee |
| `ComboBoxItem` / `ui5-cb-item` | `@fundamental-ngx/ui5-webcomponents/combo-box-item` | Employee |
| `CheckBox` / `ui5-checkbox` | `@fundamental-ngx/ui5-webcomponents/check-box` | Employee |
| `ColorPicker` / `ui5-color-picker` | `@fundamental-ngx/ui5-webcomponents/color-picker` | Settings |
| `ComboBox` / `ui5-combobox` | `@fundamental-ngx/ui5-webcomponents/combo-box` | Employee |
| `DatePicker` / `ui5-date-picker` | `@fundamental-ngx/ui5-webcomponents/date-picker` | Employee |
| `DateRangePicker` / `ui5-daterange-picker` | `@fundamental-ngx/ui5-webcomponents/date-range-picker` | Demo, Employee |
| `DateTimePicker` / `ui5-datetime-picker` | `@fundamental-ngx/ui5-webcomponents/date-time-picker` | Employee |
| `Dialog` / `ui5-dialog` | `@fundamental-ngx/ui5-webcomponents/dialog` | Demo, Settings |
| `DynamicDateRange` / `ui5-dynamic-date-range` | `@fundamental-ngx/ui5-webcomponents/dynamic-date-range` | Demo |
| `DynamicPage` / `ui5-dynamic-page` | `@fundamental-ngx/ui5-webcomponents-fiori/dynamic-page` | Shared Object Page consumed by Employee |
| `DynamicPageHeader` / `ui5-dynamic-page-header` | `@fundamental-ngx/ui5-webcomponents-fiori/dynamic-page-header` | Employee |
| `DynamicPageTitle` / `ui5-dynamic-page-title` | `@fundamental-ngx/ui5-webcomponents-fiori/dynamic-page-title` | Employee |
| `ExpandableText` / `ui5-expandable-text` | `@fundamental-ngx/ui5-webcomponents/expandable-text` | Employee |
| `FileUploader` / `ui5-file-uploader` | `@fundamental-ngx/ui5-webcomponents/file-uploader` | Employee |
| `FlexibleColumnLayout` / `ui5-flexible-column-layout` | `@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout` | Demo |
| `Form` / `ui5-form` | `@fundamental-ngx/ui5-webcomponents/form` | Shell/Home, Demo, Employee, Settings |
| `FormGroup` / `ui5-form-group` | `@fundamental-ngx/ui5-webcomponents/form-group` | Employee, Settings |
| `FormItem` / `ui5-form-item` | `@fundamental-ngx/ui5-webcomponents/form-item` | Shell/Home, Demo, Employee, Settings |
| `IllustratedMessage` / `ui5-illustrated-message` | `@fundamental-ngx/ui5-webcomponents-fiori/illustrated-message` | Employee |
| `Input` / `ui5-input` | `@fundamental-ngx/ui5-webcomponents/input` | Shell/Home, Demo, Employee, Settings |
| `Label` / `ui5-label` | `@fundamental-ngx/ui5-webcomponents/label` | Shell/Home, Demo, Employee, Settings |
| `ListItemCustom` / `ui5-li-custom` | `@fundamental-ngx/ui5-webcomponents/list-item-custom` | Demo |
| `ListItemStandard` / `ui5-li` | `@fundamental-ngx/ui5-webcomponents/list-item-standard` | Shell/Home, Demo |
| `Link` / `ui5-link` | `@fundamental-ngx/ui5-webcomponents/link` | Demo, Employee |
| `List` / `ui5-list` | `@fundamental-ngx/ui5-webcomponents/list` | Shell/Home, Demo |
| `MultiComboBoxItem` / `ui5-mcb-item` | `@fundamental-ngx/ui5-webcomponents/multi-combo-box-item` | Employee |
| `Menu` / `ui5-menu` | `@fundamental-ngx/ui5-webcomponents/menu` | Shell/Home, Demo |
| `MenuItem` / `ui5-menu-item` | `@fundamental-ngx/ui5-webcomponents/menu-item` | Shell/Home, Demo |
| `MessageStrip` / `ui5-message-strip` | `@fundamental-ngx/ui5-webcomponents/message-strip` | Shell/Home, Demo, Employee, Settings |
| `MultiComboBox` / `ui5-multi-combobox` | `@fundamental-ngx/ui5-webcomponents/multi-combo-box` | Employee |
| `MultiInput` / `ui5-multi-input` | `@fundamental-ngx/ui5-webcomponents/multi-input` | Employee |
| `NavigationLayout` / `ui5-navigation-layout` | `@fundamental-ngx/ui5-webcomponents-fiori/navigation-layout` | Shared ToolPageLayout consumed by Demo |
| `Option` / `ui5-option` | `@fundamental-ngx/ui5-webcomponents/option` | Shell/Home, Demo, Employee, Settings |
| `Page` / `ui5-page` | `@fundamental-ngx/ui5-webcomponents-fiori/page` | Shell/Home, Demo, Settings |
| `Panel` / `ui5-panel` | `@fundamental-ngx/ui5-webcomponents/panel` | Demo, Settings |
| `Popover` / `ui5-popover` | `@fundamental-ngx/ui5-webcomponents/popover` | Demo |
| `ProgressIndicator` / `ui5-progress-indicator` | `@fundamental-ngx/ui5-webcomponents/progress-indicator` | Demo, Employee |
| `RadioButton` / `ui5-radio-button` | `@fundamental-ngx/ui5-webcomponents/radio-button` | Employee |
| `RangeSlider` / `ui5-range-slider` | `@fundamental-ngx/ui5-webcomponents/range-slider` | Demo |
| `RatingIndicator` / `ui5-rating-indicator` | `@fundamental-ngx/ui5-webcomponents/rating-indicator` | Employee |
| `ResponsivePopover` / `ui5-responsive-popover` | `@fundamental-ngx/ui5-webcomponents/responsive-popover` | Shell/Home |
| `SegmentedButton` / `ui5-segmented-button` | `@fundamental-ngx/ui5-webcomponents/segmented-button` | Demo |
| `SegmentedButtonItem` / `ui5-segmented-button-item` | `@fundamental-ngx/ui5-webcomponents/segmented-button-item` | Demo |
| `Select` / `ui5-select` | `@fundamental-ngx/ui5-webcomponents/select` | Shell/Home, Demo, Employee, Settings |
| `ShellBar` / `ui5-shellbar` | `@fundamental-ngx/ui5-webcomponents-fiori/shell-bar` | Shell/Home |
| `ShellBarBranding` / `ui5-shellbar-branding` | `@fundamental-ngx/ui5-webcomponents-fiori/shell-bar-branding` | Shell/Home |
| `SideNavigation` / `ui5-side-navigation` | `@fundamental-ngx/ui5-webcomponents-fiori/side-navigation` | Demo |
| `SideNavigationItem` / `ui5-side-navigation-item` | `@fundamental-ngx/ui5-webcomponents-fiori/side-navigation-item` | Demo |
| `Slider` / `ui5-slider` | `@fundamental-ngx/ui5-webcomponents/slider` | Demo |
| `SortItem` / `ui5-sort-item` | `@fundamental-ngx/ui5-webcomponents-fiori/sort-item` | Demo |
| `SplitButton` / `ui5-split-button` | `@fundamental-ngx/ui5-webcomponents/split-button` | Demo |
| `StepInput` / `ui5-step-input` | `@fundamental-ngx/ui5-webcomponents/step-input` | Settings |
| `Switch` / `ui5-switch` | `@fundamental-ngx/ui5-webcomponents/switch` | Employee, Settings |
| `Tab` / `ui5-tab` | `@fundamental-ngx/ui5-webcomponents/tab` | Shell/Home, Employee |
| `TabContainer` / `ui5-tabcontainer` | `@fundamental-ngx/ui5-webcomponents/tab-container` | Shell/Home, Employee |
| `Table` / `ui5-table` | `@fundamental-ngx/ui5-webcomponents/table` | Demo, Employee, Settings |
| `TableCell` / `ui5-table-cell` | `@fundamental-ngx/ui5-webcomponents/table-cell` | Demo, Employee, Settings |
| `TableHeaderCell` / `ui5-table-header-cell` | `@fundamental-ngx/ui5-webcomponents/table-header-cell` | Demo, Employee, Settings |
| `TableHeaderRow` / `ui5-table-header-row` | `@fundamental-ngx/ui5-webcomponents/table-header-row` | Demo, Employee, Settings |
| `TableRow` / `ui5-table-row` | `@fundamental-ngx/ui5-webcomponents/table-row` | Demo, Employee, Settings |
| `Tag` / `ui5-tag` | `@fundamental-ngx/ui5-webcomponents/tag` | Shell/Home, Demo, Employee, Settings |
| `Text` / `ui5-text` | `@fundamental-ngx/ui5-webcomponents/text` | Shell/Home, Demo, Employee, Settings |
| `TextArea` / `ui5-textarea` | `@fundamental-ngx/ui5-webcomponents/text-area` | Demo, Employee, Settings |
| `TimePicker` / `ui5-time-picker` | `@fundamental-ngx/ui5-webcomponents/time-picker` | Employee |
| `Timeline` / `ui5-timeline` | `@fundamental-ngx/ui5-webcomponents-fiori/timeline` | Demo, Employee |
| `TimelineItem` / `ui5-timeline-item` | `@fundamental-ngx/ui5-webcomponents-fiori/timeline-item` | Demo, Employee |
| `Title` / `ui5-title` | `@fundamental-ngx/ui5-webcomponents/title` | Shell/Home, Demo, Employee, Settings |
| `Toast` / `ui5-toast` | `@fundamental-ngx/ui5-webcomponents/toast` | Shell/Home |
| `ToggleButton` / `ui5-toggle-button` | `@fundamental-ngx/ui5-webcomponents/toggle-button` | Demo |
| `Token` / `ui5-token` | `@fundamental-ngx/ui5-webcomponents/token` | Employee |
| `Tokenizer` / `ui5-tokenizer` | `@fundamental-ngx/ui5-webcomponents/tokenizer` | Employee |
| `Toolbar` / `ui5-toolbar` | `@fundamental-ngx/ui5-webcomponents/toolbar` | Demo, Employee |
| `ToolbarButton` / `ui5-toolbar-button` | `@fundamental-ngx/ui5-webcomponents/toolbar-button` | Demo, Employee |
| `UploadCollection` / `ui5-upload-collection` | `@fundamental-ngx/ui5-webcomponents-fiori/upload-collection` | Employee |
| `UploadCollectionItem` / `ui5-upload-collection-item` | `@fundamental-ngx/ui5-webcomponents-fiori/upload-collection-item` | Employee |
| `ViewSettingsDialog` / `ui5-view-settings-dialog` | `@fundamental-ngx/ui5-webcomponents-fiori/view-settings-dialog` | Demo |

### Selection decisions and omissions

- **User menu:** ShellBar profile opens the maintained Menu. Presentation preferences live in Settings, so no duplicate UserSettingsDialog is needed.
- **Employee list:** maintained ListItemCustom owns focus and selection; its content uses native Avatar, Title, Text and Tag. Demo is instantiated on first selection with Angular `@defer`: constructing custom list items inside an initially hidden UI5 tab exposed an installed-library focus traversal race. Native layout/control internals are not patched.
- **Projects:** a List is appropriate for three flat project records. A Tree would imply nonexistent hierarchy. Skills contain the meaningful RatingIndicator example; projects use progress and capacity instead of invented ratings.
- **Table:** modern Table/HeaderRow/HeaderCell/Row/Cell with native pop-in behavior. Data is client-owned; server pagination/HTTP and selection extensions are deferred until a feature TDD requires them.
- **Loading:** BusyIndicator represents actual theme loading. Empty lists/collections use native empty text or IllustratedMessage. No synthetic delay is inserted to inflate state coverage.
- **BarcodeScannerDialog, MediaGallery, Carousel and ProductSwitch:** omitted because these scenarios have no corresponding HCM requirement.

See [the guide](README.md) for interactions and [acceptance criteria](ACCEPTANCE-CRITERIA.md) for verification limits. Official capability references: [NavigationLayout](https://ui5.github.io/webcomponents/components/fiori/NavigationLayout/), [FlexibleColumnLayout](https://ui5.github.io/webcomponents/components/fiori/FlexibleColumnLayout/), [Form](https://ui5.github.io/webcomponents/components/Form/), [Table](https://ui5.github.io/webcomponents/components/Table/).

The avatar theme selector also uses `MenuItemGroup` / `ui5-menu-item-group` from `@fundamental-ngx/ui5-webcomponents/menu-item-group` with native single-selection state. DynamicPageTitle/Header, Toolbar and the employee TabContainer now belong to shared Object Page; their feature content remains in LabProfile.
