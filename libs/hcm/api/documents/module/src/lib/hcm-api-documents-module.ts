import { DocumentError } from '@empflowyee/hcm-documents-contract'
import { assertLocalRuntime } from '@empflowyee/hcm-api-runtime-infrastructure'
import { Module } from '@nestjs/common'
import { HcmRuntimeModule } from '@empflowyee/hcm-api-runtime-module'
import { HcmAccessControlModule } from '@empflowyee/hcm-api-access-control-module'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import {
	WorkerFiles,
	WorkerFileUnitOfWork,
	DocumentFiles,
	TemplateFiles,
	TemplateFileUnitOfWork,
	DocumentTypes,
	DocumentUnitOfWork,
} from '@empflowyee/hcm-api-documents-application'
import {
	KyselyWorkerFileUnit,
	LocalDocumentFiles,
	KyselyTemplateFileUnit,
	KyselyDocumentUnitOfWork,
} from '@empflowyee/hcm-api-documents-infrastructure'
import {
	WorkerDocumentController,
	TemplateController,
	DocumentTypesController,
} from '@empflowyee/hcm-api-documents-transport'
class UnconfiguredFiles extends DocumentFiles {
	/** Keep file operations unavailable when private storage has not been explicitly configured. */
	async stage(): Promise<never> {
		throw new DocumentError('storage-unavailable')
	}
	/** Never report a published file outside the opted-in local storage runtime. */
	async publish(): Promise<never> {
		throw new DocumentError('storage-unavailable')
	}
	/** Do not expose a filesystem fallback or static public file URL. */
	async open(): Promise<never> {
		throw new DocumentError('storage-unavailable')
	}
}

@Module({
	imports: [HcmRuntimeModule, HcmAccessControlModule],
	controllers: [DocumentTypesController, TemplateController, WorkerDocumentController],
	providers: [
		{
			provide: WorkerFileUnitOfWork,
			inject: [HcmAccessDatabase, TemplateFileUnitOfWork],
			useFactory: /** Bind worker file persistence. */ (
				database: HcmAccessDatabase | null,
				reservations: TemplateFileUnitOfWork,
			) => new KyselyWorkerFileUnit(database, reservations),
		},
		{
			provide: WorkerFiles,
			inject: [WorkerFileUnitOfWork, DocumentFiles],
			useFactory: /** Use the same private storage protocol for worker attachments. */ (
				unit: WorkerFileUnitOfWork,
				files: DocumentFiles,
			) => new WorkerFiles(unit, files),
		},

		{
			provide: DocumentFiles,
			useFactory: /** Inspect private storage without repairs. */ async () => {
				if (process.env['HCM_LOCAL_SESSION'] !== 'true' || !process.env['HCM_DOCUMENT_ROOT'])
					return new UnconfiguredFiles()
				assertLocalRuntime(process.env)
				const files = new LocalDocumentFiles(process.env['HCM_DOCUMENT_ROOT'])
				await files.inventory()
				return files
			},
		},
		{
			provide: TemplateFileUnitOfWork,
			inject: [HcmAccessDatabase],
			useFactory: /** Bind document reservations to existing persisted authority. */ (
				database: HcmAccessDatabase | null,
			) =>
				new KyselyTemplateFileUnit(
					database,
					database ? (process.env['HCM_DATABASE_URL'] ?? null) : null,
				),
		},
		{
			provide: TemplateFiles,
			inject: [TemplateFileUnitOfWork, DocumentFiles],
			useFactory: /** Compose the staged upload coordinator without transport dependencies. */ (
				unit: TemplateFileUnitOfWork,
				files: DocumentFiles,
			) => new TemplateFiles(unit, files),
		},
		{
			provide: DocumentUnitOfWork,
			inject: [HcmAccessDatabase],
			useFactory: /** Bind the document-owned adapters to existing authorized transactions. */ (
				database: HcmAccessDatabase | null,
			) => new KyselyDocumentUnitOfWork(database),
		},
		{
			provide: DocumentTypes,
			inject: [DocumentUnitOfWork],
			useFactory: /** Compose persistence-neutral classification use cases. */ (
				unit: DocumentUnitOfWork,
			) => new DocumentTypes(unit),
		},
	],
})
export class HcmDocumentsModule {}
