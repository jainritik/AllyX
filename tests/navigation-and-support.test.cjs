const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

function sourceFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        // Normalize Windows separators so route discovery uses the same URL
        // shape on every CI runner.
        const relative = path.relative(root, path.join(directory, entry.name)).split(path.sep).join("/");
        if (entry.isDirectory()) return sourceFiles(path.join(directory, entry.name));
        return /\.(ts|tsx)$/.test(entry.name) ? [relative] : [];
    });
}

function knownPageRoutes() {
    return sourceFiles(path.join(root, "src", "app"))
        .filter(file => /\/page\.tsx$/.test(file))
        .map(file => {
            const segments = path.dirname(file).split(path.sep).slice(2)
                .filter(segment => !segment.startsWith("["));
            return `/${segments.join("/")}`.replace(/\/$/, "") || "/";
        });
}

test("public navigation targets existing pages and homepage sections", () => {
    const routes = new Set(knownPageRoutes());
    const home = read("src/app/page.tsx");
    const sections = new Set([...home.matchAll(/<section id="([^"]+)"/g)].map(match => match[1]));
    const hrefs = sourceFiles(path.join(root, "src"))
        .flatMap(file => [...read(file).matchAll(/href=["'](\/[^"']*)["']/g)].map(match => ({ file, href: match[1] })));

    for (const { file, href } of hrefs) {
        const [pathname, hash] = href.split("#");
        assert.ok(routes.has(pathname || "/"), `${file} links to missing page ${pathname || "/"}`);
        if (hash) assert.ok(sections.has(hash), `${file} links to missing homepage section #${hash}`);
    }
});

test("support links open a browser email draft and preserve a generic fallback", () => {
    const contact = read("src/lib/support-contact.ts");
    const footer = read("src/components/footer.tsx");
    const userFacingSource = ["src/app", "src/components"].flatMap(directory => sourceFiles(path.join(root, directory)).map(read)).join("\n");

    assert.match(contact, /https:\/\/mail\.google\.com\/mail\/\?view=cm&fs=1&to=/);
    assert.match(contact, /emailFallbackUrl: `mailto:/);
    assert.match(footer, /href=\{supportContact\.emailUrl\} target="_blank"/);
    assert.doesNotMatch(userFacingSource, /href=\{`mailto:/);
});

test("navigation never nests a button inside a link", () => {
    const userFacingSource = ["src/app", "src/components"]
        .flatMap(directory => sourceFiles(path.join(root, directory)).map(read))
        .join("\n");

    assert.doesNotMatch(userFacingSource, /<Link[^>]*>\s*<Button/);
    assert.doesNotMatch(userFacingSource, /<a[^>]*>\s*<Button/);
});

test("client error reports use the current desktop release version", () => {
    const version = JSON.parse(read("package.json")).version;
    const clientMonitor = read("src/lib/client-error-monitor.ts");
    const serverMonitor = read("src/app/api/monitoring/client-error/route.ts");

    assert.match(clientMonitor, new RegExp(`const RELEASE = "${version}"`));
    assert.match(serverMonitor, new RegExp(`const RELEASE = "${version}"`));
});

test("signed-in mobile navigation includes account, billing, and support destinations", () => {
    const navbar = read("src/components/navbar.tsx");

    for (const destination of ["/dashboard", "/dashboard/new", "/dashboard/billing", "/support/report-bug"]) {
        assert.match(navbar, new RegExp(`href="${destination}"`));
    }
});

test("global styles prevent decorative page elements from creating horizontal scrolling", () => {
    const styles = read("src/app/globals.css");

    assert.match(styles, /html,\s*body\s*\{[\s\S]*overflow-x:\s*clip;/);
});

test("ordinary navigation avoids artificial route and anchor delays", () => {
    const template = read("src/app/template.tsx");
    const dashboardTransition = read("src/components/page-transition.tsx");
    const styles = read("src/app/globals.css");
    const navbar = read("src/components/navbar.tsx");
    const landingLink = read("src/components/landing-section-link.tsx");
    const rootLayout = read("src/app/layout.tsx");
    const desktopChrome = read("src/components/desktop-chrome.tsx");

    assert.doesNotMatch(template, /framer-motion|duration:/);
    assert.doesNotMatch(dashboardTransition, /framer-motion|duration:/);
    assert.doesNotMatch(styles, /scroll-behavior:\s*smooth/);
    assert.match(navbar, /scrollIntoView\(\{ behavior: "auto"/);
    assert.match(landingLink, /scrollIntoView\(\{ behavior: "auto"/);
    assert.doesNotMatch(rootLayout, /await headers\(\)/);
    assert.match(rootLayout, /<DesktopChrome \/>/);
    assert.match(desktopChrome, /dynamic\([\s\S]*ssr: false/);
});
