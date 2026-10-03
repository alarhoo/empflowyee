import {
	parseAttendanceOverrideDraft,
	type AttendanceOverrideDraft,
} from '@empflowyee/hcm-attendance-contract'
import { invalidField } from '@empflowyee/hcm-runtime-contract'
import type { SegmentForm } from '@empflowyee/hcm-web-attendance-ui-schedule-pattern'

export interface OverrideForm {
	kind: string
	zone: string
	segments: SegmentForm[]
	reason: string
}
/** Keep initial editing state incomplete until the administrator explicitly chooses a dated replacement. */
export function emptyOverrideForm(zone = ''): OverrideForm {
	return { kind: '', zone, segments: [], reason: '' }
}
/** Reuse authoritative override validation and exact native interval fields without accepting client source identities or quantities. */
export function overrideFromForm(
	model: OverrideForm,
	basis: Pick<AttendanceOverrideDraft, 'employmentId' | 'workDate' | 'workdayRevision'>,
): AttendanceOverrideDraft {
	if (!['Work', 'Rest'].includes(model.kind)) invalidField('kind')
	if (model.kind === 'Work' && !model.segments.length) invalidField('segments')
	return parseAttendanceOverrideDraft({
		...basis,
		zone: model.zone,
		reason: model.reason,
		evidenceIds: [],
		segments:
			model.kind === 'Rest'
				? []
				: model.segments.map(
					/** Preserve explicit wall-time precision and occurrence choices; incomplete rollover input is invalid. */ (
						segment,
						index,
					) => {
						if (!['0', '1'].includes(segment.endDayOffset))
							invalidField(`segments.${index}.endDayOffset`)
						return {
							kind: segment.kind,
							startTime: segment.startTime,
							endTime: segment.endTime,
							endDayOffset: Number(segment.endDayOffset),
							...(segment.startOverlap || segment.endOverlap
								? {
									overlapOffset: {
										...(segment.startOverlap ? { start: segment.startOverlap } : {}),
										...(segment.endOverlap ? { end: segment.endOverlap } : {}),
									},
								}
								: {}),
						}
					},
				),
	})
}
