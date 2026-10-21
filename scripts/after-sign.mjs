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

  // An unsigned Electron binary only carries a linker signature. macOS then
  // reports the downloaded bundle as damaged because its resources are not
  // sealed. This local signature seals the complete bundle. Its designated
  // requirement deliberately stays at the stable bundle identifier rather than
  // the ad-hoc code hash. macOS records Screen Recording consent against that
  // requirement; a cdhash would make every rebuilt AllyX look like a new app
  // and force customers to grant the same permission again after each update.
  // This is deliberately enabled only for the unsigned testing channel;
  // Developer ID releases use electron-builder's normal signing and
  // notarization flow.
  // First re-seal every nested Electron component. Electron's embedded
  // frameworks carry their own signatures, so signing only the outer app
  // leaves its resource seal referring to stale nested signatures.
  execFileSync("/usr/bin/codesign", [
    "--force",
    "--deep",
    "--sign",
    "-",
    appPath,
  ], { stdio: "inherit" });

  // Then write the stable requirement on the outer application. `--deep`
  // intentionally does not appear here: it would overwrite each nested
  // signature after the outer resource seal has been created.
  execFileSync("/usr/bin/codesign", [
    "--force",
    "--sign",
    "-",
    "--requirements",
    '=designated => identifier "com.allyx.ai"',
    appPath,
  ], { stdio: "inherit" });
}
