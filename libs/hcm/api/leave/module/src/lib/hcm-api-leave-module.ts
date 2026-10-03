import { Module } from '@nestjs/common'
import { HcmRuntimeModule } from '@empflowyee/hcm-api-runtime-module'
import { FieldCipher } from '@empflowyee/hcm-api-runtime-application'
import { HcmAccessControlModule } from '@empflowyee/hcm-api-access-control-module'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import { LeavePolicyCommands, LeavePolicyUnit } from '@empflowyee/hcm-api-leave-application'
import { KyselyLeavePolicyUnit } from '@empflowyee/hcm-api-leave-infrastructure'
import {
	LeavePoliciesController,
	LeavePolicyOptionsController,
} from '@empflowyee/hcm-api-leave-transport'

/** Compose Leave's source-owned commands without API scheduling loops or implicit migrations. */
@Module({
	imports: [HcmRuntimeModule, HcmAccessControlModule],
	controllers: [LeavePoliciesController, LeavePolicyOptionsController],
	providers: [
		{
			provide: LeavePolicyUnit,
			inject: [HcmAccessDatabase, FieldCipher],
			useFactory: /** Reuse current Access transactions and tenant field encryption. */ (
				database: HcmAccessDatabase | null,
				cipher: FieldCipher,
			) => new KyselyLeavePolicyUnit(database, cipher),
		},
		{
			provide: LeavePolicyCommands,
			inject: [LeavePolicyUnit],
			useFactory: /** Bind business orchestration to the authorized infrastructure unit. */ (
				unit: LeavePolicyUnit,
			) => new LeavePolicyCommands(unit),
		},
	],
})
export class HcmLeaveModule {}
