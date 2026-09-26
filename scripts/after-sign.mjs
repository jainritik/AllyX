import { execFileSync } from "node:child_process";
import path from "node:path";

export default async function afterSign(context) {
  if (process.env.ALLYX_ADHOC_SIGN !== "true" || context.electronPlatformName !== "darwin") {
    return;
  }

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );

  execFileSync("/usr/bin/codesign", [
    "--force",
    "--deep",
    "--sign",
    "-",
    appPath,
  ], { stdio: "inherit" });
}
