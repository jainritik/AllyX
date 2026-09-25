import fs from "node:fs";

const target = process.argv[2];
const tag = process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : "";
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

if (!tag || !tag.startsWith("desktop-v")) process.exit(0);
if (tag !== `desktop-v${pkg.version}`) throw new Error(`Tag ${tag} must match package version desktop-v${pkg.version}`);

const required = target.startsWith("macos-")
    ? ["CSC_LINK", "CSC_KEY_PASSWORD", "APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"]
    : ["WIN_CSC_LINK", "WIN_CSC_KEY_PASSWORD"];
const missing = required.filter(name => !process.env[name]);
if (missing.length) throw new Error(`Signed release blocked. Missing CI secrets: ${missing.join(", ")}`);
