/**
 * sdk-worker — METHOD 5: the Agent SDK worker.
 *
 * Same lifecycle as the headless loop (workers/lib/lifecycle.sh via
 * lifecycle-cli.sh — ONE implementation, no drift), different execution
 * engine: the Claude Agent SDK as a library. What the library buys over
 * `claude -p` (and why this is the long-term worker):
 *   - the hard path denylist enforced as a PreToolUse HOOK — code, not
 *     prompt text (defence-in-depth ON TOP of the prompt denylist, which
 *     stays);
 *   - explicit allowed-tools policy;
 *   - heartbeats while the agent streams;
 *   - graceful SIGTERM cancellation via AbortController.
 *
 * Runs inside the session-6 sandbox (Node is already in the image). Same env
 * contract as the loop (env.example) — SOURCE, REPO, POLL_SECONDS, limits.
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, rmSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const sh = promisify(execFile);
const LIB = resolve(new URL("../..", import.meta.url).pathname, "lib/lifecycle-cli.sh");
const WORKDIR = process.env.WORKDIR ?? "/workspace/run";
const POLL_MS = Number(process.env.POLL_SECONDS ?? 300) * 1000;
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_SECONDS ?? 120) * 1000;
const MAX_TURNS = Number(process.env.MAX_TURNS ?? 150);

/** The hard path denylist — the same list the engine prompts carry, here as
 * CODE. Checked against every file-touching tool call and every Bash
 * command's tokens. Deny = the tool call never executes. */
const DENYLIST: RegExp[] = [
  /(^|\/)\.github\//, /(^|\/)tool\//, /\.gradle(\.kts)?$/, /(^|\/)gradle\//,
  /gradle-wrapper\./, /\.keystore$/, /\.jks$/, /key\.properties$/, /(^|\/)\.env[^/]*$/,
];
const denied = (p: string) => DENYLIST.some((rx) => rx.test(p));

async function lifecycle(cmd: string, args: string[] = [], env = {}) {
  const { stdout } = await sh("bash", [LIB, cmd, ...args], {
    env: { ...process.env, ...env, WORKDIR },
  });
  return stdout.trim() ? JSON.parse(stdout.trim().split("\n").pop()!) : {};
}

/** Exit code 2 from the lifecycle CLI = POLICY STOP (method rejected). It must
 * kill the process, not bubble into main's catch-and-retry — a misconfigured
 * executor has to be loud, and a retry storm is the opposite of loud. */
async function runOneTask(): Promise<boolean> {
  const claim = await lifecycle("claim").catch((e: any) => {
    if (e?.code === 2) {
      console.error("[worker] POLICY STOP — this runtime is not an allowed execution method for this app. Not retrying.");
      process.exit(2);
    }
    throw e;
  });
  if (!claim.claimed) return false;
  const taskEnv = {
    TASK_REF: claim.task_ref, RUN_ID: claim.run_id ?? "", STORY_KEY: claim.story_key ?? "",
  };

  let outcome = "failed";
  let detail = "terminated before outcome";
  let sawSuccess = false;
  // MEASURED cost, from the SDK's own result message. Stays undefined when the
  // SDK didn't report one — never report a value you cannot back (session 12).
  let costUsd: number | undefined;
  const abort = new AbortController();
  const onTerm = () => {
    // Release FIRST, fire-and-forget: the SDK's abort can take longer than a
    // stop grace period to unwind (observed live: SIGKILL beat the finally
    // and the claim stuck). A duplicate finish later is harmless — REST
    // label-DELETE 404s, sakal report_run rejects a second outcome.
    void lifecycle("finish", ["failed", "SIGTERM fast-release", costUsd !== undefined ? String(costUsd) : ""], taskEnv).catch(() => {});
    abort.abort(new Error("SIGTERM"));
  };
  process.once("SIGTERM", onTerm);
  process.once("SIGINT", onTerm);

  const hb = setInterval(() => lifecycle("heartbeat", [], taskEnv).catch(() => {}), HEARTBEAT_MS);
  try {
    rmSync(WORKDIR, { recursive: true, force: true });
    mkdirSync(WORKDIR, { recursive: true });
    const repoDir = join(WORKDIR, "repo");
    await sh("gh", ["repo", "clone", process.env.REPO!, repoDir, "--", "--depth", "50", "-q"]);
    const { brief_file } = await lifecycle("brief", [], taskEnv);
    const brief = readFileSync(brief_file, "utf8");

    for await (const message of query({
      prompt: brief,
      options: {
        cwd: repoDir,
        maxTurns: MAX_TURNS,
        abortController: abort,
        allowedTools: ["Read", "Glob", "Grep", "Edit", "MultiEdit", "Write", "Bash"],
        permissionMode: "bypassPermissions", // the sandbox + hook are the real walls
        hooks: {
          PreToolUse: [{
            hooks: [async (input: any) => {
              const t = input.tool_name as string;
              const ti = (input.tool_input ?? {}) as Record<string, unknown>;
              // The denylist forbids CREATE/MODIFY/DELETE — never reading or
              // executing (the gate itself lives in tool/**). First live probe
              // run blocked `./tool/setup.sh` execution and Reads: false
              // positives that broke the executor. Enforce write tools only;
              // for Bash, require a write-shaped verb near the denied path
              // (heuristic defence-in-depth — the prompt rule stays primary).
              const paths: string[] = [];
              if (["Edit", "MultiEdit", "Write", "NotebookEdit"].includes(t) && typeof ti.file_path === "string")
                paths.push(ti.file_path);
              if (t === "Bash" && typeof ti.command === "string") {
                // Check ONLY write-verb arguments and redirect TARGETS —
                // checking every token flagged `./tool/setup.sh > /tmp/log`
                // because of the harmless redirect (live false positive #2).
                for (const seg of (ti.command as string).split(/[;&|]+/)) {
                  const s = seg.trim();
                  const m = s.match(/^(?:sudo\s+)?(rm|mv|cp|tee|truncate|chmod|ln|install)\b(.*)$/);
                  if (m) paths.push(...(m[2].match(/[\w./~-]+/g) ?? []));
                  if (/^sed\b/.test(s) && /\s-i\b/.test(s)) paths.push(...(s.match(/[\w./~-]+/g) ?? []));
                  for (const r of s.matchAll(/>{1,2}\s*([\w./~-]+)/g)) paths.push(r[1]);
                }
              }
              const hit = paths.find((p) => denied(p.replace(repoDir + "/", "")));
              if (hit) {
                // the proof line the methods log wants: the denylist firing as CODE
                console.log(`[hook] BLOCKED ${t} -> ${hit} (denylist, contract invariant 7)`);
                return {
                  decision: "block" as const,
                  stopReason: `denylist: ${hit} is untouchable (contract invariant 7)`,
                };
              }
              return {};
            }],
          }],
        },
      },
    })) {
      if (message.type === "result") {
        // the SDK's terminal message; the gate below decides, not the agent
        const sub = "subtype" in message ? (message as any).subtype : "done";
        const c = (message as any).total_cost_usd;
        if (typeof c === "number") { costUsd = (costUsd ?? 0) + c; console.log(`[agent] cost: $${c}`); }
        console.log(`[agent] result: ${sub}`);
        if (sub === "success") sawSuccess = true;
      }
    }

    // GATE — in the worker's environment, never taken from the agent's claims.
    await sh("bash", ["-c", "./tool/setup.sh >/dev/null 2>&1 && ./tool/verify.sh"], { cwd: repoDir });
    const { stdout: branch } = await sh("git", ["branch", "--show-current"], { cwd: repoDir });
    const { stdout: pr } = await sh("gh", [
      "pr", "list", "-R", process.env.REPO!, "--head", branch.trim(), "--json", "number", "-q", ".[0].number",
    ]);
    if (pr.trim()) { outcome = "succeeded"; detail = `${process.env.REPO}#${pr.trim()}`; }
    else { outcome = "failed"; detail = "gate green but no PR was opened"; }
  } catch (err: any) {
    if (abort.signal.aborted) { outcome = "failed"; detail = "cancelled (SIGTERM)"; }
    else if (sawSuccess) {
      // A late stream error after a successful result must not override
      // reality (observed live: agent succeeded, PR open, then the CLI
      // exited 1 → the wrapper mislabelled the task blocked). Verify like
      // the normal path: gate + PR presence decide.
      try {
        const repoDir = join(WORKDIR, "repo");
        await sh("bash", ["-c", "./tool/setup.sh >/dev/null 2>&1 && ./tool/verify.sh"], { cwd: repoDir });
        const { stdout: branch } = await sh("git", ["branch", "--show-current"], { cwd: repoDir });
        const { stdout: pr } = await sh("gh", [
          "pr", "list", "-R", process.env.REPO!, "--head", branch.trim(), "--json", "number", "-q", ".[0].number",
        ]);
        if (pr.trim()) { outcome = "succeeded"; detail = `${process.env.REPO}#${pr.trim()} (late stream error ignored: ${err?.message ?? err})`; }
        else { outcome = "failed"; detail = `success result but no PR; late stream error: ${err?.message ?? err}`; }
      } catch { outcome = "blocked"; detail = `gate failed after success result; stream error: ${err?.message ?? err}`; }
    }
    else { outcome = "blocked"; detail = `needs a human look: ${err?.message ?? err}`; }
  } finally {
    clearInterval(hb);
    process.removeListener("SIGTERM", onTerm);
    process.removeListener("SIGINT", onTerm);
    await lifecycle("finish", [outcome, detail, costUsd !== undefined ? String(costUsd) : ""], taskEnv).catch(() => {});
    rmSync(WORKDIR, { recursive: true, force: true });
  }
  console.log(`[worker] task ${claim.task_ref}: ${outcome} (${detail})`);
  return true;
}

async function main() {
  for (const v of ["SOURCE", "REPO"]) {
    if (!process.env[v]) { console.error(`missing env ${v}`); process.exit(2); }
  }
  console.log(`[worker] sdk-worker up — source=${process.env.SOURCE} repo=${process.env.REPO}`);
  let stopping = false;
  process.on("SIGTERM", () => { stopping = true; });
  while (!stopping) {
    const worked = await runOneTask().catch((e) => { console.error("[worker]", e); return false; });
    if (!worked && !stopping) await new Promise((r) => setTimeout(r, POLL_MS));
  }
  console.log("[worker] stopped gracefully");
}

main();
