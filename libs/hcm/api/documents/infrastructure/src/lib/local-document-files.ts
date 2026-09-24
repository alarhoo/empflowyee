import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import {
	lstat,
	mkdir,
	open,
	readdir,
	realpath,
	rename,
	unlink,
	type FileHandle,
} from 'node:fs/promises'
import { dirname, isAbsolute, join, parse, resolve } from 'node:path'
import { DocumentError } from '@empflowyee/hcm-documents-contract'
import {
	DocumentFiles,
	type DocumentFile,
	type OpenDocumentFile,
} from '@empflowyee/hcm-api-documents-application'

const maximum = 10 * 1024 * 1024
const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** Reject linked ancestors, network locations and noncanonical private roots. */
async function directory(path: string): Promise<void> {
	if (!isAbsolute(path) || path.startsWith('\\\\') || path.startsWith('//'))
		throw new DocumentError('storage-unavailable')
	const parent = dirname(path)
	if (parent !== path) await directory(parent)
	const stat = await lstat(path)
	if (
		!stat.isDirectory() ||
		stat.isSymbolicLink() ||
		resolve(await realpath(path)).toLowerCase() !== resolve(path).toLowerCase()
	)
		throw new DocumentError('storage-unavailable')
}
/** Provision directories only from explicit local tooling, never repair business state at startup. */
export async function provisionDocumentRoot(root: string): Promise<void> {
	if (!isAbsolute(root) || root.startsWith('\\\\') || root.startsWith('//'))
		throw new DocumentError('storage-unavailable')
	const parent = dirname(root)
	await directory(parent)
	await mkdir(root, { recursive: true, mode: 0o700 })
	await directory(root)
	for (const name of ['staging', 'blobs']) {
		await mkdir(join(root, name), { mode: 0o700 }).catch(
			/** Existing folders are verified below, never blindly trusted. */ (
				error: NodeJS.ErrnoException,
			) => {
				if (error.code !== 'EEXIST') throw error
			},
		)
		await directory(join(root, name))
	}
}
/** Restrict attachment names without deriving a storage path from user input. */
function safeFilename(value: string): string {
	if (
		typeof value !== 'string' ||
		!value.trim() ||
		value.length > 200 ||
		/[\\/\p{Cc}]/u.test(value) ||
		value === '.' ||
		value === '..'
	)
		throw new DocumentError('invalid-request')
	return value.trim().replace(/[";:<>|?*]/g, '_')
}
/** Require the approved signature, filename suffix and declared media type to agree. */
function media(first: Buffer, filename: string, declared: string): DocumentFile['mediaType'] {
	const ext = parse(filename).ext.toLowerCase()
	if (
		ext === '.pdf' &&
		declared === 'application/pdf' &&
		first.subarray(0, 5).equals(Buffer.from('%PDF-'))
	)
		return declared
	if (
		ext === '.png' &&
		declared === 'image/png' &&
		first.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
	)
		return declared
	if (
		['.jpg', '.jpeg'].includes(ext) &&
		declared === 'image/jpeg' &&
		first.length >= 3 &&
		first[0] === 255 &&
		first[1] === 216 &&
		first[2] === 255
	)
		return declared
	throw new DocumentError('unsupported-file')
}
/** Verify evidence before constructing any path or trusting a database record. */
function evidence(file: DocumentFile): void {
	if (
		!keyPattern.test(file.key) ||
		!/^[a-f0-9]{64}$/.test(file.sha256) ||
		!Number.isSafeInteger(file.byteLength) ||
		file.byteLength < 1 ||
		file.byteLength > maximum ||
		safeFilename(file.filename) !== file.filename ||
		!['application/pdf', 'image/png', 'image/jpeg'].includes(file.mediaType)
	)
		throw new DocumentError('storage-unavailable')
}
export class LocalDocumentFiles extends DocumentFiles {
	/** Bind a single local runtime adapter to an explicitly provisioned persistent private root. */
	constructor(private readonly root: string) {
		super()
	}
	/** Inspect storage at startup without deleting files or finalizing reserved commands. */
	async inventory(): Promise<{ staged: number; published: number }> {
		try {
			await directory(this.root)
			const counts: number[] = []
			for (const area of ['staging', 'blobs'] as const) {
				await directory(join(this.root, area))
				const entries = await readdir(join(this.root, area), { withFileTypes: true })
				for (const entry of entries)
					if (!entry.isFile() || entry.isSymbolicLink() || !keyPattern.test(entry.name))
						throw new DocumentError('storage-unavailable')
				counts.push(entries.length)
			}
			return { staged: counts[0], published: counts[1] }
		} catch {
			throw new DocumentError('storage-unavailable')
		}
	}
	/** Stream with a hard byte limit and fsync before returning reservation evidence. */
	async stage(
		bytes: AsyncIterable<Uint8Array>,
		filename: string,
		mediaType: string,
	): Promise<DocumentFile> {
		const name = safeFilename(filename),
			key = randomUUID()
		let handle: FileHandle | undefined,
			created = false
		try {
			const path = await this.path('staging', key)
			handle = await open(
				path,
				constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
				0o600,
			)
			created = true
			const hash = createHash('sha256')
			let length = 0,
				first = Buffer.alloc(0)
			for await (const chunk of bytes) {
				length += chunk.byteLength
				if (length > maximum) throw new DocumentError('file-too-large')
				if (first.length < 8)
					first = Buffer.concat([first, Buffer.from(chunk).subarray(0, 8 - first.length)])
				hash.update(chunk)
				let written = 0
				while (written < chunk.byteLength) {
					const result = await handle.write(chunk, written, chunk.byteLength - written)
					if (!result.bytesWritten) throw new DocumentError('storage-unavailable')
					written += result.bytesWritten
				}
			}
			if (!length) throw new DocumentError('unsupported-file')
			const verified = media(first, name, mediaType)
			await handle.sync()
			await handle.close()
			handle = undefined
			return {
				key,
				sha256: hash.digest('hex'),
				byteLength: length,
				mediaType: verified,
				filename: name,
			}
		} catch (error) {
			await handle?.close()
			if (created)
				await unlink(await this.path('staging', key)).catch(
					/** Invalid unreserved bytes may be removed; missing bytes are already absent. */ () =>
						undefined,
				)
			if (error instanceof DocumentError) throw error
			throw new DocumentError('storage-unavailable')
		}
	}
	/** Make bytes durable before the final business transaction; retries never replace existing bytes. */
	async publish(file: DocumentFile): Promise<void> {
		evidence(file)
		try {
			const destination = await this.path('blobs', file.key)
			try {
				await lstat(destination)
				const prior = await this.verified('blobs', file)
				await prior.close()
				return
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
			}
			const staged = await this.verified('staging', file)
			await staged.close()
			await rename(await this.path('staging', file.key), destination)
			// The immutable file was fsynced before rename; verify the actual destination before Ready.
			const ready = await this.verified('blobs', file)
			await ready.close()
		} catch {
			throw new DocumentError('storage-unavailable')
		}
	}
	/** Verify the same descriptor that will provide download bytes, failing safely for missing/corrupt content. */
	async open(file: DocumentFile): Promise<OpenDocumentFile> {
		evidence(file)
		try {
			const handle = await this.verified('blobs', file)
			return {
				bytes: handle.createReadStream({ start: 0, autoClose: false }),
				close: /** Close after streaming or abort. */ () => handle.close(),
			}
		} catch {
			throw new DocumentError('storage-unavailable')
		}
	}
	/** Resolve only a server UUID directly below a verified private directory. */
	private async path(area: 'staging' | 'blobs', key: string): Promise<string> {
		if (!keyPattern.test(key)) throw new DocumentError('storage-unavailable')
		const folder = join(this.root, area)
		await directory(folder)
		return join(folder, key)
	}
	/** Reject links and hash a bounded regular descriptor before any business publication or download. */
	private async verified(area: 'staging' | 'blobs', file: DocumentFile): Promise<FileHandle> {
		const path = await this.path(area, file.key),
			before = await lstat(path)
		if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1)
			throw new DocumentError('storage-unavailable')
		const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
		try {
			const stat = await handle.stat()
			if (
				!stat.isFile() ||
				stat.size !== file.byteLength ||
				stat.ino !== before.ino ||
				stat.dev !== before.dev
			)
				throw new DocumentError('storage-unavailable')
			const hash = createHash('sha256'),
				buffer = Buffer.alloc(65536)
			let position = 0
			while (position < file.byteLength) {
				const { bytesRead } = await handle.read(
					buffer,
					0,
					Math.min(buffer.length, file.byteLength - position),
					position,
				)
				if (!bytesRead) throw new DocumentError('storage-unavailable')
				hash.update(buffer.subarray(0, bytesRead))
				position += bytesRead
			}
			if (hash.digest('hex') !== file.sha256) throw new DocumentError('storage-unavailable')
			return handle
		} catch (error) {
			await handle.close()
			throw error
		}
	}
}
