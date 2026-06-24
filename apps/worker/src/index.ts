import { handleRequest } from "./handler.js";
import type { Env } from "./env.js";

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return handleRequest(req, env);
  },
};
