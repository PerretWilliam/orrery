import { z } from "zod";
import type { PermissionScope } from "@/features/access/domain/capabilities";
import { isDefaultBranchPush } from "@/features/repos/domain/discovery";
import type { RepoRef } from "@/features/repos/domain/git-provider";

const text = z.string().min(1);
const repository = z.object({ name: text, owner: z.object({ login: text }) });
const person = z.object({ login: text });

const Member = z.object({ repository, member: person });
const Membership = z.object({ member: person });
const WithRepository = z.object({ repository });
const OrganizationMember = z.object({ membership: z.object({ user: person }) });

const EVERYTHING: PermissionScope = {};
const toRepo = (r: z.infer<typeof repository>) => ({ owner: r.owner.login, name: r.name });

/** Events that carry no change to who can see what are ignored; the rest invalidate the narrowest scope they name. */
export const HANDLED_EVENTS = ["member", "membership", "team", "organization", "repository", "installation", "installation_repositories"] as const;

export const isHandledEvent = (event: string) => (HANDLED_EVENTS as readonly string[]).includes(event);

const action = (payload: unknown) => (typeof payload === "object" && payload !== null ? Reflect.get(payload, "action") : undefined);

/**
 * The cache entries a signed delivery makes stale. When the payload does not have the shape we rely on, we cannot say
 * what changed, so everything is invalidated: a wrong guess must never leave a revoked permission cached.
 */
export function invalidationScopes(event: string, payload: unknown): PermissionScope[] {
  switch (event) {
    case "member": {
      const found = Member.safeParse(payload);
      return [found.success ? { repo: toRepo(found.data.repository), username: found.data.member.login } : EVERYTHING];
    }
    case "membership": {
      const found = Membership.safeParse(payload);
      return [found.success ? { username: found.data.member.login } : EVERYTHING];
    }
    case "organization": {
      const found = OrganizationMember.safeParse(payload);
      const aboutOneMember = /^member_/.test(String(action(payload)));
      return [found.success && aboutOneMember ? { username: found.data.membership.user.login } : EVERYTHING];
    }
    case "team": // added_to_repository, removed_from_repository: the repository whose access changed
    case "repository": {
      const found = WithRepository.safeParse(payload);
      // A rename or a transfer also stales the old name, which the payload only gives in `changes`.
      const moved = action(payload) === "renamed" || action(payload) === "transferred";
      return [found.success && !moved ? { repo: toRepo(found.data.repository) } : EVERYTHING];
    }
    default:
      return [EVERYTHING];
  }
}

/** `push` is not about access: it tells discovery that a config file may have changed. */
export const PUSH_EVENT = "push";

/** Events after which the set of repositories the App can see may have changed: discovery looks at all of them again. */
export const REPOSITORY_SET_EVENTS = ["installation", "installation_repositories", "repository"] as const;

const Push = z.object({ ref: z.string(), repository: z.object({ name: text, owner: z.object({ login: text }), default_branch: text }) });

/** The repository of a push to its default branch; `null` for any other push or a payload of another shape. */
export function defaultBranchPush(payload: unknown): RepoRef | null {
  const found = Push.safeParse(payload);
  return found.success && isDefaultBranchPush(found.data.ref, found.data.repository.default_branch) ? toRepo(found.data.repository) : null;
}
