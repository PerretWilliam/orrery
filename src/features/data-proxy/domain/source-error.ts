/**
 * Failures of a source request. Codes are stable: once released they are never renamed, reused or removed.
 * Messages describe the failure and never contain anything read from the source.
 */
export const SOURCE_ERRORS = {
  source_bad_status: {
    message: "The source answered with an error status",
    fix: "Check that the URL is right and that the source is up; a 2xx answer is required.",
  },
  source_content_type: {
    message: "The source did not answer with JSON",
    fix: "Make the source send `Content-Type: application/json`. Only JSON sources are supported.",
  },
  source_too_large: {
    message: "The source answer is larger than the 5 MB limit",
    fix: "Return less data: filter or paginate on the source side, or point to a smaller endpoint.",
  },
  source_timeout: {
    message: "The source did not answer within 3 seconds",
    fix: "Make the source faster or cache its answer on the source side.",
  },
  source_invalid_json: {
    message: "The source answer is not valid JSON",
    fix: "Make the source return a well-formed JSON document, uncompressed and encoded in UTF-8.",
  },
  source_internal: {
    message: "Orrery could not prepare the request to the source",
    fix: "Try again in a moment. If it keeps failing, ask the instance admin to check the server logs.",
  },
  source_unreachable: {
    message: "The source could not be reached",
    fix: "Check the URL, the network path and the TLS certificate of the source.",
  },
} as const;

export type SourceErrorCode = keyof typeof SOURCE_ERRORS;

export class SourceError extends Error {
  readonly fix: string;
  constructor(readonly code: SourceErrorCode) {
    const { message, fix } = Reflect.get(SOURCE_ERRORS, code) as {
      message: string;
      fix: string;
    };
    super(message);
    this.name = "SourceError";
    this.fix = fix;
  }
}
