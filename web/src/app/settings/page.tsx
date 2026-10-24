import { listSettings } from "@/lib/db";
import SettingsForm from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await listSettings();
  return (
    <div className="panel">
      <h1>Calculation settings</h1>
      <p className="muted">
        These values drive every material formula. Defaults are common industry values and should be replaced with
        Titan Roofing&apos;s own numbers. Changing a setting does not change past calculations: each calculation stores
        the settings it used.
      </p>
      <SettingsForm settings={settings} />
    </div>
  );
}
