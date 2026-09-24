import { NotificationError } from '@empflowyee/hcm-notifications-contract'
/** Reject stale commands without replacing newer read state or preference choices. */
export function requireNotificationRevision(current: number, expected: number): void {
	if (current !== expected) throw new NotificationError('revision-conflict')
}
/** Evaluate the approved future in-app delivery policy independently from transport and SQL. */
export function notificationDelivery(
	ruleEnabled: boolean,
	preferenceEnabled: boolean | undefined,
	recipientEnabled: boolean,
): 'Delivered' | 'Suppressed' | 'Undeliverable' {
	if (!recipientEnabled) return 'Undeliverable'
	if (!ruleEnabled || preferenceEnabled === false) return 'Suppressed'
	return 'Delivered'
}
