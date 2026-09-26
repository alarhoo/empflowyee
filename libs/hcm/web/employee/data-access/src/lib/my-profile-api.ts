import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	BloodGroupValue,
	CustomValue,
	MyProfileDto,
	MyProfileOptionKind,
	MyReferencePage,
	ProfileFieldRef,
	ProfileVisibility,
	RelationshipCommand,
	SelfContactPointType,
} from '@empflowyee/hcm-employee-contract'

export interface PersonalBody {
	preferredName?: string
	bloodGroup?: BloodGroupValue | null
	expectedRevision: number
}
export type RelationshipBody = Omit<RelationshipCommand, 'genderCode'> & {
	gender: string | null
	expectedRevision?: number
}

const limit = 15000

/** My Profile API; the server resolves the worker from the verified account on every call. */
@Injectable({ providedIn: 'root' })
export class MyProfileApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/employee/me/profile'

	/** Attach the caller-retained idempotency key to one command. */
	private headers(key: string) {
		return { headers: { 'Idempotency-Key': key } }
	}

	/** Read the own profile. */
	read() {
		return this.http.get<MyProfileDto>(this.base).pipe(timeout(limit))
	}

	/** Relationship type or gender options. */
	options(kind: MyProfileOptionKind) {
		return this.http.get<MyReferencePage>(`${this.base}/options/${kind}`).pipe(timeout(limit))
	}

	/** Change the preferred name or blood group. */
	updatePersonal(body: PersonalBody, key: string) {
		return this.http
			.put<MyProfileDto>(`${this.base}/personal`, body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Add a personal email or mobile number. */
	addContact(body: { type: SelfContactPointType; value: string }, key: string) {
		return this.http
			.post<MyProfileDto>(`${this.base}/contact-points`, body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Change a contact point. */
	updateContact(
		id: string,
		body: { value: string; primary: boolean; expectedRevision: number },
		key: string,
	) {
		return this.http
			.put<MyProfileDto>(
				`${this.base}/contact-points/${encodeURIComponent(id)}`,
				body,
				this.headers(key),
			)
			.pipe(timeout(limit))
	}

	/** Remove a contact point. */
	removeContact(id: string, expectedRevision: number, key: string) {
		return this.http
			.post<MyProfileDto>(
				`${this.base}/contact-points/${encodeURIComponent(id)}/deactivate`,
				{ expectedRevision },
				this.headers(key),
			)
			.pipe(timeout(limit))
	}

	/** Add an emergency contact or family member. */
	addRelationship(body: RelationshipBody, key: string) {
		return this.http
			.post<MyProfileDto>(`${this.base}/relationships`, body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Change an emergency contact or family member. */
	updateRelationship(id: string, body: RelationshipBody, key: string) {
		return this.http
			.put<MyProfileDto>(
				`${this.base}/relationships/${encodeURIComponent(id)}`,
				body,
				this.headers(key),
			)
			.pipe(timeout(limit))
	}

	/** Remove an emergency contact or family member. */
	removeRelationship(id: string, expectedRevision: number, key: string) {
		return this.http
			.post<MyProfileDto>(
				`${this.base}/relationships/${encodeURIComponent(id)}/deactivate`,
				{ expectedRevision },
				this.headers(key),
			)
			.pipe(timeout(limit))
	}

	/** Set or clear a Direct custom value. */
	setCustomValue(
		fieldId: string,
		body: { value: CustomValue; expectedRevision: number | null },
		key: string,
	) {
		return this.http
			.put<MyProfileDto>(
				`${this.base}/custom-fields/${encodeURIComponent(fieldId)}`,
				body,
				this.headers(key),
			)
			.pipe(timeout(limit))
	}

	/** Narrow a field's visibility, or return it to the policy with null. */
	setVisibility(
		ref: ProfileFieldRef,
		body: { visibility: ProfileVisibility | null; expectedRevision: number | null },
		key: string,
	) {
		return this.http
			.put<MyProfileDto>(
				`${this.base}/visibility/${encodeURIComponent(ref)}`,
				body,
				this.headers(key),
			)
			.pipe(timeout(limit))
	}
}
