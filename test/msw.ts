import { setupServer } from "msw/node";

// Shared msw server. Tests register per-case handlers with `server.use(...)`;
// any request without a matching handler fails the test (see test/setup.ts).
export const server = setupServer();
