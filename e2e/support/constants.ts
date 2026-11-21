// Test-only values, shared by playwright.config.ts (which hands them to the server under test) and the tests.
export const SETUP_TOKEN = "e2e-setup-token-0123456789abcdef";
export const ENCRYPTION_KEYS = `e2e:${Buffer.alloc(32, 7).toString("base64")}`;
export const INSTANCE_URL = "http://localhost:3001";
