import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
const extension = target === "windows-x64" ? ".exe" : ".dmg";
const files = fs.readdirSync("dist").filter(name => name.endsWith(extension)).sort();
if (files.length !== 1) throw new Error(`Expected one ${extension} installer for ${target}; found ${files.length}`);
const lines = files.map(name => `${createHash("sha256").update(fs.readFileSync(path.join("dist", name))).digest("hex")}  ${name}`);
fs.writeFileSync(path.join("dist", `SHA256SUMS-${target}.txt`), `${lines.join("\n")}\n`);
