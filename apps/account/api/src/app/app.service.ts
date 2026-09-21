import { Injectable } from '@nestjs/common'

@Injectable()
export class AppService {
	/** Return the scaffold greeting used by the root API endpoint. */
	getData(): { message: string } {
		return { message: 'Hello API' }
	}
}
