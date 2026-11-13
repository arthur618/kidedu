import { serverDeps } from "../../../../src/server/deps";
import { httpHandlers } from "../../../../src/server/http";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> { return httpHandlers(serverDeps).get((await context.params).id); }
