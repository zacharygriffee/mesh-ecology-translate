import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ProviderAdapter, buildPrompt } from "./base.js";
import { validateTranslationRequest } from "../contracts/index.js";
import {
  createProviderInvalidResponseError,
  createProviderUnavailableError,
  isProviderError
} from "../errors/index.js";
import { executeWithRequestControl } from "./runtime.js";
import {
  DEFAULT_STRUCTURED_GRAMMAR_PROFILE,
  STRUCTURED_GRAMMAR_PROFILES,
  buildStructuredProviderPrompt,
  parseStructuredProviderOutput
} from "./structured.js";

export const DEFAULT_CODEX_CLI_COMMAND = "codex";
export const DEFAULT_CODEX_CLI_MODEL = "codex-cli";

const CODEX_CLI_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["grammarCandidate", "confidence", "needsClarification", "ambiguities", "notes"],
  properties: {
    grammarCandidate: {
      type: "object",
      additionalProperties: false,
      required: [
        "intentClass",
        "target",
        "scope",
        "action",
        "consequenceClass",
        "execution",
        "responsiveness",
        "success",
        "idempotency",
        "provenance",
        "audience",
        "authorityHint",
        "capabilityHints",
        "ambiguity",
        "parameters",
        "rawInterpretation"
      ],
      properties: {
        intentClass: { type: "string" },
        target: {
          type: "object",
          additionalProperties: false,
          required: ["actorGroup", "selectedActorIds", "desiredState"],
          properties: {
            actorGroup: { type: ["string", "null"] },
            selectedActorIds: {
              type: "array",
              items: { type: "string" }
            },
            desiredState: { type: ["string", "null"] }
          }
        },
        scope: {
          type: "object",
          additionalProperties: false,
          required: ["area"],
          properties: {
            area: { type: ["string", "null"] }
          }
        },
        action: { type: "string" },
        consequenceClass: { type: "string" },
        execution: {
          type: "object",
          additionalProperties: false,
          required: ["mode"],
          properties: {
            mode: { type: "string" }
          }
        },
        responsiveness: { type: "string" },
        success: {
          type: "object",
          additionalProperties: false,
          required: ["evidenceType", "criteria"],
          properties: {
            evidenceType: { type: "string" },
            criteria: { type: "string" }
          }
        },
        idempotency: { type: "string" },
        provenance: {
          type: "object",
          additionalProperties: false,
          required: ["source", "ingressType"],
          properties: {
            source: { type: "string" },
            ingressType: { type: "string" }
          }
        },
        audience: { type: "string" },
        authorityHint: { type: "string" },
        capabilityHints: {
          type: "array",
          items: { type: "string" }
        },
        ambiguity: {
          type: "object",
          additionalProperties: false,
          required: ["unresolvedFields"],
          properties: {
            unresolvedFields: {
              type: "array",
              items: { type: "string" }
            }
          }
        },
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {}
        },
        rawInterpretation: { type: "string" }
      }
    },
    confidence: { type: "number" },
    needsClarification: { type: "boolean" },
    ambiguities: {
      type: "array",
      items: { type: "string" }
    },
    notes: {
      type: "array",
      items: { type: "string" }
    }
  }
});

function readStructuredGrammarProfile(options) {
  const configured =
    options.structuredGrammarProfile ??
    process.env.CODEX_CLI_STRUCTURED_GRAMMAR_PROFILE ??
    DEFAULT_STRUCTURED_GRAMMAR_PROFILE;

  return STRUCTURED_GRAMMAR_PROFILES.includes(configured)
    ? configured
    : DEFAULT_STRUCTURED_GRAMMAR_PROFILE;
}

function createDiagnosticPrefix(value) {
  return String(value ?? "")
    .slice(0, 500)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/VENICE_[A-Z0-9_]+_[A-Za-z0-9._~+/=-]+/g, "[REDACTED]")
    .replace(/sk-[A-Za-z0-9._~+/=-]+/g, "sk-[REDACTED]");
}

export function runCodexCliCommand({ command, args, input = "", signal }) {
  return new Promise((resolve, reject) => {
    let child;
    let settled = false;
    const stdout = [];
    const stderr = [];

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
    };

    const finish = (error, result) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();

      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    };

    const onAbort = () => {
      if (child && child.exitCode === null) {
        child.kill("SIGTERM");
      }

      const error = new Error("Codex CLI process aborted.");
      error.name = "AbortError";
      finish(error);
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }

    try {
      child = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      });
    } catch (error) {
      finish(error);
      return;
    }

    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (chunk) => {
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr.push(chunk);
    });
    child.on("error", (error) => {
      finish(error);
    });
    child.on("close", (status) => {
      finish(null, {
        status: status ?? 0,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      });
    });

    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

export class CodexCliProvider extends ProviderAdapter {
  constructor(options = {}) {
    const configuredModel = options.model ?? process.env.CODEX_CLI_MODEL;

    super({
      name: "codex-cli",
      model: configuredModel ?? DEFAULT_CODEX_CLI_MODEL,
      kind: options.kind ?? "external"
    });

    this.command = options.command ?? process.env.CODEX_CLI_COMMAND ?? DEFAULT_CODEX_CLI_COMMAND;
    this.cwd = options.cwd ?? process.cwd();
    this.runner = options.runner ?? runCodexCliCommand;
    this.cliModel = configuredModel ?? null;
    this.structuredGrammarProfile = readStructuredGrammarProfile(options);
    this.approvalPolicy = options.approvalPolicy ?? "never";
    this.supportsStructuredOutput = true;
  }

  async isAvailable() {
    try {
      const result = await this.runner({
        command: this.command,
        args: ["--version"],
        input: ""
      });

      return result.status === 0;
    } catch {
      return false;
    }
  }

  buildExecArgs({ outputLastMessagePath, outputSchemaPath }) {
    return [
      "exec",
      ...(this.approvalPolicy ? ["-c", `approval_policy="${this.approvalPolicy}"`] : []),
      "--sandbox",
      "read-only",
      "--json",
      "--color",
      "never",
      "--ephemeral",
      ...(this.cliModel ? ["--model", this.cliModel] : []),
      "--output-last-message",
      outputLastMessagePath,
      "--output-schema",
      outputSchemaPath,
      "--cd",
      this.cwd,
      "-"
    ];
  }

  async translate(request) {
    validateTranslationRequest(request);

    if (!(await this.isAvailable())) {
      throw createProviderUnavailableError(
        this.name,
        "Codex CLI provider requires a configured codex executable."
      );
    }

    return executeWithRequestControl({
      provider: this.name,
      request,
      operation: async ({ signal }) => {
        const prompt = buildPrompt(request);
        const startedAt = performance.now();
        const tempDir = await mkdtemp(join(tmpdir(), "mesh-ecology-translate-codex-"));
        const outputLastMessagePath = join(tempDir, "final-message.json");
        const outputSchemaPath = join(tempDir, "output-schema.json");

        try {
          const structuredPrompt = buildStructuredProviderPrompt(request, {
            structuredGrammarProfile: this.structuredGrammarProfile
          });
          await writeFile(outputSchemaPath, JSON.stringify(CODEX_CLI_OUTPUT_SCHEMA), "utf8");

          const result = await this.runner({
            command: this.command,
            args: this.buildExecArgs({ outputLastMessagePath, outputSchemaPath }),
            input: structuredPrompt,
            signal
          });

          if (result.status !== 0) {
            throw createProviderUnavailableError(
              this.name,
              `Codex CLI request failed with status ${result.status}: ${createDiagnosticPrefix(
                result.stderr || result.stdout
              )}`
            );
          }

          let content;

          try {
            content = await readFile(outputLastMessagePath, "utf8");
          } catch (error) {
            throw createProviderInvalidResponseError(
              this.name,
              "Codex CLI did not write a final assistant message.",
              { cause: error }
            );
          }

          return parseStructuredProviderOutput({
            content,
            request,
            provider: this.name,
            model: this.model,
            latency: Math.round(performance.now() - startedAt),
            templateId: prompt.templateId,
            structuredGrammarProfile: this.structuredGrammarProfile,
            contentPath: "codex final message"
          });
        } catch (error) {
          if (isProviderError(error)) {
            throw error;
          }

          throw createProviderUnavailableError(
            this.name,
            `Codex CLI request failed before a structured response was received: ${error.message}`,
            { cause: error }
          );
        } finally {
          await rm(tempDir, { recursive: true, force: true });
        }
      }
    });
  }
}
