import { serverDeps } from '../../../../../src/server/deps';
import { httpHandlers } from '../../../../../src/server/http';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> { return httpHandlers(serverDeps).resume((await context.params).id, request); }
