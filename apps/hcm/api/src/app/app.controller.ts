import { Controller, Get } from '@nestjs/common'
import { AppService } from './app.service'

@Controller()
export class AppController {
	/** Receive the application service through Nest dependency injection. */
	constructor(private readonly appService: AppService) {}

	/** Serve the scaffold greeting at GET /api through the application service. */
	@Get()
	getData() {
		return this.appService.getData()
	}
}
