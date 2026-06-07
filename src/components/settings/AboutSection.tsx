import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import packageJson from "../../../package.json";

const GITHUB_URL = "https://github.com/codeErrorSleep/dbpaw";
const APP_VERSION = packageJson.version;

export function AboutSection() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium flex items-center gap-2">
        <Info className="w-5 h-5" /> {t("settings.about.title")}
      </h3>
      <div className="bg-muted/50 rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-medium">DbPaw</span>
          <span className="text-sm text-muted-foreground">v{APP_VERSION}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("settings.about.description")}
        </p>
        <div className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1 text-xs text-muted-foreground pt-1">
          <span className="font-medium text-foreground/90">
            {t("settings.about.github")}
          </span>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="truncate underline-offset-4 hover:underline"
          >
            {GITHUB_URL}
          </a>
          <span className="font-medium text-foreground/90">
            {t("settings.about.license")}
          </span>
          <span>Apache-2.0</span>
          <span className="font-medium text-foreground/90">
            {t("settings.about.platforms")}
          </span>
          <span>macOS / Windows / Linux</span>
        </div>
      </div>
    </div>
  );
}
