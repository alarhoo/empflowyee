import type { ValidationError } from '@angular/forms/signals'

export interface HcmServerFieldError {
	readonly field: string
	readonly message: string
}

/** Map explicit server field identifiers to known Signal Form fields; unknown identifiers become form errors. */
export function mapServerValidation(
	errors: readonly HcmServerFieldError[],
	fields: Readonly<Record<string, ValidationError.WithFieldTree['fieldTree']>>,
	root: ValidationError.WithFieldTree['fieldTree'],
): ValidationError.WithFieldTree[] {
	return errors.map(
		/** Treat server messages as text and never traverse untrusted property paths. */ (error) => ({
			kind: 'server',
			message: error.message,
			fieldTree: Object.hasOwn(fields, error.field) ? fields[error.field] : root,
		}),
	)
}
