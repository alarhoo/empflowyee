import {
	dateValue,
	idValue,
	invalidField,
	readBody,
	revisionValue,
} from '@empflowyee/hcm-runtime-contract'
import { configurationText } from './configuration-validation'

export interface ConfigurationPreviewCommand {
	expectedRevision: number
	effectiveFrom: string
	effectiveTo: string
}
export interface ConfigurationReasonCommand {
	expectedRevision: number
	reason: string
}
export interface ConfigurationPublishCommand extends ConfigurationReasonCommand {
	previewId: string
	digest: string
}
export interface ConfigurationInputRevision {
	sourceType: 'Schedule'
	id: string
	revision: number
}
export interface ConfigurationPreviewView {
	previewId: string
	digest: string
	state: 'Ready'
	inputRevisions: ConfigurationInputRevision[]
	affectedEmploymentCount: number
	affectedWorkdayCount: number
	conflicts: number
	lockedImpact: boolean
	expiresAt: string
}
export interface ConfigurationCommandResult {
	id: string
	versionId: string
	revision: number
	state: 'Published' | 'Retired'
}

/** Parse a bounded inclusive preview range; omission of the end selects the single explicit start date. */
export function parseConfigurationPreview(value: unknown): ConfigurationPreviewCommand {
	const input = readBody(value, ['expectedRevision', 'effectiveFrom'], ['effectiveTo'])
	const effectiveFrom = dateValue(input['effectiveFrom'], 'effectiveFrom')
	const effectiveTo =
		input['effectiveTo'] === undefined
			? effectiveFrom
			: dateValue(input['effectiveTo'], 'effectiveTo')
	if (
		effectiveTo < effectiveFrom ||
		Date.parse(effectiveTo) - Date.parse(effectiveFrom) > 365 * 86400000
	)
		invalidField('effectiveTo')
	return { expectedRevision: revisionValue(input['expectedRevision']), effectiveFrom, effectiveTo }
}

/** Require a current source revision and preserve the submitted private reason verbatim. */
export function parseConfigurationReason(value: unknown): ConfigurationReasonCommand {
	const input = readBody(value, ['expectedRevision', 'reason'])
	return {
		expectedRevision: revisionValue(input['expectedRevision']),
		reason: configurationText(input['reason'], 'reason', 2000),
	}
}

/** Require an exact preview identity and canonical digest without accepting source state overrides. */
export function parseConfigurationPublish(value: unknown): ConfigurationPublishCommand {
	const input = readBody(value, ['expectedRevision', 'reason', 'previewId', 'digest'])
	const { previewId, digest, ...reason } = input
	if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) invalidField('digest')
	return { ...parseConfigurationReason(reason), previewId: idValue(previewId, 'previewId'), digest }
}
