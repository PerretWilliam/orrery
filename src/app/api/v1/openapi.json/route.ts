import { openApiDocument } from "@/features/api/domain/openapi";

/** The spec is public: it describes the API and contains nothing about any project. */
export const GET = () => Response.json(openApiDocument);
