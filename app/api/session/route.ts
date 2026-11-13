import { serverDeps } from "../../../src/server/deps";
import { httpHandlers } from "../../../src/server/http";
export async function POST(request: Request): Promise<Response> { return httpHandlers(serverDeps).post("start", request); }
