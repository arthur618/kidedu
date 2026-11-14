import { serverDeps } from "../../../../../../src/server/deps";
import { httpHandlers } from "../../../../../../src/server/http";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> { return httpHandlers(serverDeps).card((await context.params).id, request); }
