import { ignoreCustomElements } from '@ui5/webcomponents-base/dist/IgnoreCustomElements.js'
import { setDefaultFontLoading } from '@ui5/webcomponents-base/dist/config/Fonts.js'
import '@ui5/webcomponents/dist/Assets.js'
import '@ui5/webcomponents-fiori/dist/Assets.js'
// Register the workspace's explicit icon vocabulary without importing the entire icon catalog.
import '@ui5/webcomponents-icons/dist/home.js'
import '@ui5/webcomponents-icons/dist/action-settings.js'
import '@ui5/webcomponents-icons/dist/menu2.js'
import '@ui5/webcomponents-icons/dist/calendar.js'
import '@ui5/webcomponents-icons/dist/project-definition-triangle.js'
import '@ui5/webcomponents-icons/dist/employee.js'
import '@ui5/webcomponents-icons/dist/nav-back.js'
import '@ui5/webcomponents-icons/dist/accept.js'
import '@ui5/webcomponents-icons/dist/document.js'
import '@ui5/webcomponents-icons/dist/upload.js'
import '@ui5/webcomponents-icons/dist/decline.js'
import '@ui5/webcomponents-icons/dist/information.js'
import '@ui5/webcomponents-icons/dist/sort.js'

// Prevent UI5 from waiting for Angular-owned custom element prefixes inside UI5 slots/cells.
ignoreCustomElements('ef-')
// Both application and Storybook load the same locked, local font assets.
setDefaultFontLoading(false)
