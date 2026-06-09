import { afterAll, afterEach, beforeAll } from "vitest";

import { server } from "./msw.ts";

// `onUnhandledRequest: 'error'` turns any un-mocked network call into a test
// failure, so a forgotten handler can never leak a real request to npm/GitHub.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
