import { ignoreCustomElements } from '@ui5/webcomponents-base/dist/IgnoreCustomElements.js'
import { setDefaultFontLoading } from '@ui5/webcomponents-base/dist/config/Fonts.js'
import '@ui5/webcomponents/dist/Assets.js'
import '@ui5/webcomponents-fiori/dist/Assets.js'

// Prevent UI5 from waiting for Angular-owned custom element prefixes inside UI5 slots/cells.
ignoreCustomElements('ef-')
// Both application and Storybook load the same locked, local font assets.
setDefaultFontLoading(false)
