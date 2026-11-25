import { useTranslations } from "next-intl";
import { ThemeChoice } from "@/components/theme-choice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AppearanceView() {
  const t = useTranslations("Settings");
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("themeTitle")}</h2>
        </CardTitle>
        <CardDescription>{t("themeBody")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ThemeChoice />
      </CardContent>
    </Card>
  );
}
