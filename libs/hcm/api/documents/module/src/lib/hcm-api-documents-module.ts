import { Module } from '@nestjs/common'
import { HcmRuntimeModule } from '@empflowyee/hcm-api-runtime-module'
import { HcmAccessControlModule } from '@empflowyee/hcm-api-access-control-module'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import { DocumentTypes, DocumentUnitOfWork } from '@empflowyee/hcm-api-documents-application'
import { KyselyDocumentUnitOfWork } from '@empflowyee/hcm-api-documents-infrastructure'
import { DocumentTypesController } from '@empflowyee/hcm-api-documents-transport'
@Module({
	imports: [HcmRuntimeModule, HcmAccessControlModule],
	controllers: [DocumentTypesController],
	providers: [
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
