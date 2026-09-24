import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, rmdir, symlink, writeFile, link } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { LocalDocumentFiles, provisionDocumentRoot } from './local-document-files'

let home: string
let root: string
let files: LocalDocumentFiles
const pdf = Buffer.from('%PDF-1.7\nDocument storage acceptance\n%%EOF')
/** Supply incremental bytes rather than an artificial unbounded in-memory storage adapter. */
async function* chunks(value: Uint8Array, size = 32768): AsyncGenerator<Uint8Array> {
	for (let offset = 0; offset < value.byteLength; offset += size)
		yield value.subarray(offset, offset + size)
}
/** Collect only already-authorized bounded attachment bytes for equality assertions. */
async function collect(value: AsyncIterable<Uint8Array>): Promise<Buffer> {
	const bytes: Uint8Array[] = []
	for await (const chunk of value) bytes.push(chunk)
	return Buffer.concat(bytes)
}
beforeEach(
	/** Provision a unique real filesystem root without touching local business files. */ async () => {
		home = await mkdtemp(join(tmpdir(), 'hcm-document-files-'))
		root = join(home, 'private')
		await provisionDocumentRoot(root)
		files = new LocalDocumentFiles(root)
	},
)
afterEach(
	/** Remove only the unique test-owned directory after checking its resolved parent. */ async () => {
		if (
			resolve(home).startsWith(resolve(tmpdir()) + '\\') ||
			resolve(home).startsWith(resolve(tmpdir()) + '/')
		)
			await rm(home, { recursive: true, force: true })
	},
)
it('keeps staging private and resumes publication after adapter restart', /** A restart never creates a business version or removes a reserved file. */ async () => {
	const file = await files.stage(chunks(pdf, 2), 'reference.pdf', 'application/pdf')
	expect(await files.inventory()).toEqual({ staged: 1, published: 0 })
	await expect(files.open(file)).rejects.toMatchObject({ code: 'storage-unavailable' })
	const restarted = new LocalDocumentFiles(root)
	expect(await restarted.inventory()).toEqual({ staged: 1, published: 0 })
	await restarted.publish(file)
	await restarted.publish(file)
	const download = await restarted.open(file)
	try {
		expect(await collect(download.bytes)).toEqual(pdf)
	} finally {
		await download.close()
	}
	expect(await restarted.inventory()).toEqual({ staged: 0, published: 1 })
})
it('enforces exact ten MiB and leaves no invalid unreserved staging file', /** Test streaming at and beyond the approved byte boundary, including empty input. */ async () => {
	const exact = Buffer.alloc(10 * 1024 * 1024, 32)
	pdf.copy(exact)
	const good = await files.stage(chunks(exact), 'maximum.pdf', 'application/pdf')
	expect(good.byteLength).toBe(exact.length)
	await expect(
		files.stage(chunks(Buffer.concat([exact, Buffer.from('x')])), 'large.pdf', 'application/pdf'),
	).rejects.toMatchObject({ code: 'file-too-large' })
	await expect(
		files.stage(chunks(Buffer.alloc(0)), 'empty.pdf', 'application/pdf'),
	).rejects.toMatchObject({ code: 'unsupported-file' })
	expect(await readdir(join(root, 'staging'))).toEqual([good.key])
})
it('rejects mismatched file signatures, unsafe names and unsupported formats', /** Neither MIME claims nor a filename can authorize other file kinds or construct paths. */ async () => {
	for (const [name, type, value] of [
		['bad.png', 'image/png', pdf],
		['bad.pdf', 'image/jpeg', pdf],
		['bad.pdf', 'application/pdf', Buffer.from('not a PDF')],
		['bad.html', 'text/html', Buffer.from('<html>')],
	] as const)
		await expect(files.stage(chunks(value), name, type)).rejects.toMatchObject({
			code: 'unsupported-file',
		})
	for (const name of ['../outside.pdf', 'x\\outside.pdf', 'bad\r\n.pdf', '', 'a'.repeat(201)])
		await expect(files.stage(chunks(pdf), name, 'application/pdf')).rejects.toMatchObject({
			code: 'invalid-request',
		})
	const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]),
		jpeg = Buffer.from([255, 216, 255, 224])
	expect((await files.stage(chunks(png, 1), 'image.png', 'image/png')).mediaType).toBe('image/png')
	expect((await files.stage(chunks(jpeg, 1), 'image.jpeg', 'image/jpeg')).mediaType).toBe(
		'image/jpeg',
	)
	const safe = await files.stage(chunks(pdf), 'safe";name.pdf', 'application/pdf')
	expect(safe.filename).toBe('safe__name.pdf')
})
it('fails safely for missing or changed published bytes without removing evidence', /** A Ready database record must never produce fake bytes or silently repair a corrupt file. */ async () => {
	const file = await files.stage(chunks(pdf), 'reference.pdf', 'application/pdf')
	await files.publish(file)
	await writeFile(join(root, 'blobs', file.key), Buffer.alloc(pdf.length, 0))
	await expect(files.open(file)).rejects.toMatchObject({ code: 'storage-unavailable' })
	await expect(files.publish(file)).rejects.toMatchObject({ code: 'storage-unavailable' })
	expect(await readdir(join(root, 'blobs'))).toEqual([file.key])
	await expect(files.open({ ...file, key: randomUUID() })).rejects.toMatchObject({
		code: 'storage-unavailable',
	})
})
it('rejects linked private directories, hard links and forged storage keys', /** Exercise actual Windows junctions or POSIX directory links rather than mocking path checks. */ async () => {
	const outside = join(home, 'outside')
	await provisionDocumentRoot(outside)
	await rmdir(join(root, 'staging'))
	await symlink(join(outside, 'staging'), join(root, 'staging'), 'junction')
	await expect(files.inventory()).rejects.toMatchObject({ code: 'storage-unavailable' })
	await expect(files.stage(chunks(pdf), 'reference.pdf', 'application/pdf')).rejects.toMatchObject({
		code: 'storage-unavailable',
	})
	expect(await readdir(join(outside, 'staging'))).toEqual([])
	await rmdir(join(root, 'staging'))
	await provisionDocumentRoot(root)
	const file = await files.stage(chunks(pdf), 'reference.pdf', 'application/pdf')
	await link(join(root, 'staging', file.key), join(outside, 'linked'))
	await expect(files.publish(file)).rejects.toMatchObject({ code: 'storage-unavailable' })
	await expect(files.open({ ...file, key: '../outside' })).rejects.toMatchObject({
		code: 'storage-unavailable',
	})
	expect(await readFile(join(outside, 'linked'))).toEqual(pdf)
})
it('cleans only its unreserved partial file when a stream disconnects', /** Failed writes cannot leave a successful metadata envelope or remove another staged upload. */ async () => {
	const prior = await files.stage(chunks(pdf), 'keep.pdf', 'application/pdf')
	/** Interrupt a stream after its initial bytes to exercise partial-write cleanup. */
	async function* interrupted(): AsyncGenerator<Uint8Array> {
		yield pdf
		throw new Error('Connection lost')
	}
	await expect(files.stage(interrupted(), 'partial.pdf', 'application/pdf')).rejects.toMatchObject({
		code: 'storage-unavailable',
	})
	expect(await readdir(join(root, 'staging'))).toEqual([prior.key])
})
