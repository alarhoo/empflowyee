import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const cataloguePath = path.join(root, 'docs/hcm/catalogue/hcm-app-catalogue.json')
export const launchpadPath = path.join(root, 'docs/hcm/catalogue/hcm-launchpad.json')
export const catalogue = JSON.parse(fs.readFileSync(cataloguePath, 'utf8'))
export const launchpad = JSON.parse(fs.readFileSync(launchpadPath, 'utf8'))
/** Find one canonical app by its stable code without consulting reference inventories. */
export function getApp(code) {
	return catalogue.apps.find(/** Match the canonical app identity. */ (a) => a.appCode === code)
}
/** Convert a validated app code into its domain-owned feature/document slug. */
export function appSlug(code) {
	return code.toLowerCase().replaceAll('_', '-')
}
