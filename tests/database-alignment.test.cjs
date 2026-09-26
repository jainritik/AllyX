const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

test("README lists every database script exactly once in deployment order", () => {
    const expected = [
        "supabase_schema.sql",
        "supabase_beta_migration.sql",
        "supabase_trial_migration.sql",
        "supabase_billing_migration.sql",
        "supabase_billing_account_migration.sql",
        "supabase_session_recovery_migration.sql",
        "supabase_credit_reservation_migration.sql",
        "supabase_interview_source_migration.sql",
        "supabase_payment_lifecycle_migration.sql",
        "supabase_purchaser_trial_policy_migration.sql",
        "supabase_payment_email_migration.sql",
        "supabase_billing_support_migration.sql",
        "supabase_bug_reports_migration.sql",
        "supabase_interview_setup_migration.sql",
        "supabase_error_monitoring_migration.sql",
    ];
    const actualFiles = fs.readdirSync(root).filter(name => /^supabase.*\.sql$/.test(name)).sort();
    assert.deepEqual([...expected].sort(), actualFiles);
    const databaseSection = read("README.md").split("## Database setup")[1].split("## Local development")[0];
    const documented = [...databaseSection.matchAll(/`(supabase[^`]+\.sql)`/g)].map(match => match[1]);
    assert.deepEqual(documented, expected);
});

test("every application RPC has a SQL function definition", () => {
    const files = [];
    const visit = directory => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const full = path.join(directory, entry.name);
            if (entry.isDirectory()) visit(full);
            else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
        }
    };
    visit(path.join(root, "src"));
    const code = files.map(file => fs.readFileSync(file, "utf8")).join("\n");
    const sql = fs.readdirSync(root).filter(name => /^supabase.*\.sql$/.test(name))
        .map(name => read(name)).join("\n");
    const called = new Set([...code.matchAll(/\.rpc\(\s*["']([^"']+)/g)].map(match => match[1]));
    const defined = new Set([...sql.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)/gi)].map(match => match[1]));
    assert.deepEqual([...called].filter(name => !defined.has(name)), []);
});

test("bug reports are account scoped and attachments remain private", () => {
    const sql = read("supabase_bug_reports_migration.sql");
    assert.match(sql, /'bug-report-attachments',\s*'bug-report-attachments',\s*false/);
    assert.match(sql, /storage\.foldername\(name\)\)\[1\].*auth\.uid\(\)::text/s);
    assert.match(sql, /where user_id = auth\.uid\(\)/);
    assert.match(sql, /revoke all on public\.bug_reports from anon, authenticated/);
    assert.match(sql, /grant execute on function public\.claim_bug_report_email\(uuid\) to service_role/);
    assert.doesNotMatch(sql, /grant execute on function public\.claim_bug_report_email\(uuid\) to authenticated/);
});

test("production error monitoring is aggregate-only and service-role protected", () => {
    const sql = read("supabase_error_monitoring_migration.sql");
    assert.match(sql, /revoke all on public\.client_error_events from anon, authenticated/);
    assert.match(sql, /grant execute on function public\.record_client_error\([^)]+\) to service_role/);
    assert.doesNotMatch(sql, /\n\s+(?:user_id|email|ip_address|transcript|resume|question|request_body|cookie)\s/i);
    const route = read("src/app/api/monitoring/client-error/route.ts");
    assert.match(route, /split\(\/\[\?\#\]\//);
    assert.doesNotMatch(route, /headers\(\).*user-agent|x-forwarded-for|request\.cookies/i);
});
