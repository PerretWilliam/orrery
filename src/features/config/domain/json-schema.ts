import { z } from "zod";
import { ConfigV1 } from "./schema-v1";

/** The JSON Schema of `.hub.yml` version 1, as published at `public/schema/hub-v1.json` for editor autocompletion. */
export const configJsonSchema = (): Record<string, unknown> => ({
  ...z.toJSONSchema(ConfigV1, { io: "input", target: "draft-2020-12" }),
  title: "Orrery .hub.yml, version 1",
  description: "Dashboard description of a repository. Every field has a description and an example.",
});
