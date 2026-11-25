import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuditEntry } from "@/features/audit/domain/events";
import { ADMIN_ERRORS, type AdminErrorCode } from "../domain/admin";
import type { AdminSettings } from "../server/service";

type Overview = NonNullable<Awaited<ReturnType<AdminSettings["overview"]>>>;
type Props = { overview: Overview; audit: readonly AuditEntry[]; saved: boolean; error: AdminErrorCode | null };

const ACTION = "/admin/action";

/** One list entry with its remove button; `extra` carries the other fields a removal needs. */
function Entry({ action, value, label, extra = {} }: { action: string; value: string; label: string; extra?: Record<string, string> }) {
  const t = useTranslations("Admin");
  return (
    <li className="flex items-center justify-between gap-2 rounded border p-2">
      <code>{label}</code>
      <form method="post" action={ACTION}>
        <input type="hidden" name="action" value={action} />
        <input type="hidden" name="value" value={value} />
        {Object.entries(extra).map(([name, fieldValue]) => (
          <input key={name} type="hidden" name={name} value={fieldValue} />
        ))}
        <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("remove")}
        </button>
      </form>
    </li>
  );
}

/** A single-field add form. */
function AddForm({ action, id, label, placeholder }: { action: string; id: string; label: string; placeholder: string }) {
  const t = useTranslations("Admin");
  return (
    <form method="post" action={ACTION} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="action" value={action} />
      <div className="flex flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        <Input id={id} name="value" required maxLength={253} placeholder={placeholder} autoComplete="off" />
      </div>
      <button type="submit" className={buttonVariants()}>
        {t("add")}
      </button>
    </form>
  );
}

function Section({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{intro}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

/** What an instance admin may change. Every value on the page is rendered as text. */
export function AdminView({ overview, audit, saved, error }: Props) {
  const t = useTranslations("Admin");
  const empty = (text: string) => <p className="text-sm text-muted-foreground">{text}</p>;
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
      {saved ? (
        <Alert>
          <AlertTitle>{t("saved")}</AlertTitle>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{t("errorTitle")}</AlertTitle>
          <AlertDescription>
            <code>{error}</code>: {Reflect.get(ADMIN_ERRORS, error).fix}
          </AlertDescription>
        </Alert>
      ) : null}

      <Section title={t("signInTitle")} intro={t("signInIntro")}>
        {overview.allowlist.length === 0 ? empty(t("signInEmpty")) : null}
        <ul className="flex flex-col gap-2">
          {overview.allowlist.map((entry) => (
            <Entry key={`${entry.kind}:${entry.value}`} action="allow_remove" value={`${entry.kind}:${entry.value}`} label={`${entry.kind}:${entry.value}`} />
          ))}
        </ul>
        <AddForm action="allow_add" id="signin" label={t("signInLabel")} placeholder="org:acme" />
      </Section>

      <Section title={t("rulesTitle")} intro={t("rulesIntro")}>
        {overview.rules.length === 0 ? empty(t("rulesEmpty")) : null}
        <ul className="flex flex-col gap-2">
          {overview.rules.map(({ project, rule }) => {
            const subject = rule.effect === "restrict_to" ? `${rule.subject.kind}:${rule.subject.value}` : "";
            return <Entry key={`${project}:${rule.effect}:${subject}`} action="rule_remove" value={project} label={`${project} · ${rule.effect}${subject && ` · ${subject}`}`} extra={{ effect: rule.effect, subject }} />;
          })}
        </ul>
        <form method="post" action={ACTION} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="action" value="rule_add" />
          <div className="flex flex-col gap-1">
            <Label htmlFor="rule-project">{t("ruleProject")}</Label>
            <Input id="rule-project" name="value" required maxLength={201} placeholder="acme/web" autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="rule-effect">{t("ruleEffect")}</Label>
            <select id="rule-effect" name="effect" className="h-8 rounded-lg border bg-transparent px-2 text-sm">
              <option value="hide">{t("ruleHide")}</option>
              <option value="restrict_to">{t("ruleRestrict")}</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="rule-subject">{t("ruleSubject")}</Label>
            <Input id="rule-subject" name="subject" maxLength={140} placeholder="team:acme/devs" autoComplete="off" />
          </div>
          <button type="submit" className={buttonVariants()}>
            {t("add")}
          </button>
        </form>
      </Section>

      <Section title={t("hostsTitle")} intro={t("hostsIntro")}>
        {overview.hosts.length === 0 ? empty(t("hostsEmpty")) : null}
        <ul className="flex flex-col gap-2">
          {overview.hosts.map((host) => (
            <Entry key={host} action="host_remove" value={host} label={host} />
          ))}
        </ul>
        <AddForm action="host_add" id="host" label={t("hostLabel")} placeholder="10.0.0.0/8" />
      </Section>

      <Section title={t("adminsTitle")} intro={t("adminsIntro")}>
        <ul className="flex flex-col gap-2">
          {overview.admins.map((login) => (
            <Entry key={login} action="admin_remove" value={login} label={login} />
          ))}
        </ul>
        <AddForm action="admin_add" id="admin" label={t("adminLabel")} placeholder="octocat" />
      </Section>

      <Section title={t("keysTitle")} intro={t("keysIntro")}>
        {overview.key ? <p className="text-sm">{t("keysStatus", { active: overview.key.active, pending: overview.key.pending })}</p> : empty(t("keysUnavailable"))}
        <form method="post" action={ACTION}>
          <input type="hidden" name="action" value="rotate_keys" />
          <button type="submit" className={buttonVariants({ variant: "outline" })}>
            {t("rotate")}
          </button>
        </form>
      </Section>

      <Section title={t("auditTitle")} intro={t("auditIntro")}>
        {audit.length === 0 ? empty(t("auditEmpty")) : null}
        <ul className="flex flex-col gap-1 text-sm">
          {audit.map((entry) => (
            <li key={entry.id} className="flex flex-wrap gap-x-3">
              <time dateTime={entry.at.toISOString()}>{entry.at.toISOString().replace("T", " ").slice(0, 19)}</time>
              <code>{entry.event}</code>
              <span>{entry.actor ?? t("auditSystem")}</span>
              {entry.repository ? <span>{entry.repository}</span> : null}
              <span className="text-muted-foreground">{Object.entries(entry.detail).map(([key, value]) => `${key}=${value}`).join(" ")}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
