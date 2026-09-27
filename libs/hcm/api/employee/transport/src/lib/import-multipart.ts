import busboy from 'busboy'
import type { IncomingMessage } from 'node:http'
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'

/** Largest accepted import source; one byte more marks the upload too large. */
const MAX_BYTES = 5 * 1024 * 1024

/** A parsed import upload: JSON metadata first, then exactly one bounded file. */
export interface ImportUpload {
	metadata: unknown
	fileName: string
	bytes: Buffer
}

/** Read `metadata` then one `file` part, buffering at most 5 MiB; anything else is refused. */
export function importMultipart(request: IncomingMessage): Promise<ImportUpload> {
	return new Promise(
		/** Settle once the parser closes or fails. */ (resolve, reject) => {
			let parser: ReturnType<typeof busboy>
			try {
				parser = busboy({
					headers: request.headers,
					limits: { fieldSize: 16384, fields: 1, files: 1, parts: 3, fileSize: MAX_BYTES },
				})
			} catch {
				reject(new HcmDomainError('invalid-request'))
				return
			}
			let failure: HcmDomainError | null = null
			let metadata: unknown
			let hasMetadata = false
			let file: { fileName: string; chunks: Buffer[]; truncated: boolean } | null = null
			/** Keep the first failure only. */
			const fail = (error: HcmDomainError) => {
				failure ??= error
			}
			parser.on(
				'field',
				/** One JSON metadata part before the file. */ (name, value, info) => {
					if (name !== 'metadata' || hasMetadata || file || info.valueTruncated) {
						fail(new HcmDomainError('invalid-request'))
						return
					}
					try {
						metadata = JSON.parse(value)
						hasMetadata = true
					} catch {
						fail(new HcmDomainError('invalid-request'))
					}
				},
			)
			parser.on(
				'file',
				/** One file part after the metadata. */ (name, stream, info) => {
					if (name !== 'file' || !hasMetadata || file) {
						fail(new HcmDomainError('invalid-request'))
						stream.resume()
						return
					}
					const current = {
						fileName: info.filename ?? '',
						chunks: [] as Buffer[],
						truncated: false,
					}
					file = current
					stream.on('data', /** Buffer. */ (chunk: Buffer) => current.chunks.push(chunk))
					stream.on('limit', /** Too large. */ () => (current.truncated = true))
				},
			)
			for (const event of ['partsLimit', 'filesLimit', 'fieldsLimit'] as const)
				parser.on(event, /** Extra parts. */ () => fail(new HcmDomainError('invalid-request')))
			parser.on(
				'error',
				/** Malformed input. */ () => {
					fail(new HcmDomainError('invalid-request'))
					request.unpipe(parser)
					request.resume()
					reject(failure)
				},
			)
			parser.on(
				'close',
				/** Settle with the upload or the first failure. */ () => {
					if (!failure && file?.truncated) fail(new HcmDomainError('file-too-large'))
					if (!failure && (!file || !file.fileName)) fail(new HcmDomainError('invalid-request'))
					if (failure || !file) reject(failure)
					else resolve({ metadata, fileName: file.fileName, bytes: Buffer.concat(file.chunks) })
				},
			)
			request.pipe(parser)
		},
	)
}
