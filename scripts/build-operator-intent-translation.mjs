#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildOperatorIntentTranslation } from "../src/index.js";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const args = parseArgs(process.argv.slice(2));
const translation = buildOperatorIntentTranslation({
  operatorText: args.operatorText ?? "accept this lifted file's source continuity into my local layer",
  targetLayerRef: args.targetLayerRef ?? "layer:operator-local",
  targetContextRef: args.targetContextRef ?? "context:file-resource-lift:operator-local",
  sourceResourceRefs: splitRefs(args.sourceResourceRefs ?? "studio-file-resource-lift-source-candidate:studio-local-presentation-surface-example"),
  sourceEvidenceRefs: splitRefs(args.sourceEvidenceRefs ?? [
    "bytes-studio-file-resource-lift-visibility-evidence:85f6ba4ebc8f9de6",
    "edge-file-resource-source-continuity-acceptance-remaining-blockers-visibility:56f2f0daff0f84c5"
  ].join(",")),
  translatedAt: args.translatedAt ?? new Date().toISOString()
});
const output = resolve(
  repoRoot,
  args.output ??
    "proof-artifacts/operator-intent-translation-file-resource-source-continuity-acceptance-20260610T080000Z/translation.json"
);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(translation, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({
  commandStatus: "operator_intent_translation_emitted",
  output,
  translationRef: translation.translationRef,
  translationHash: translation.translationHash,
  requestedVerb: translation.candidate.requestedVerb,
  clarificationNeeded: translation.candidate.clarificationNeeded,
  nonClaims: translation.nonClaims
}, null, 2)}\n`);

function splitRefs(value) {
  return String(value).split(",").map((entry) => entry.trim()).filter(Boolean);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--operator-text") {
      parsed.operatorText = next;
      index += 1;
    } else if (arg === "--target-layer-ref") {
      parsed.targetLayerRef = next;
      index += 1;
    } else if (arg === "--target-context-ref") {
      parsed.targetContextRef = next;
      index += 1;
    } else if (arg === "--source-resource-refs") {
      parsed.sourceResourceRefs = next;
      index += 1;
    } else if (arg === "--source-evidence-refs") {
      parsed.sourceEvidenceRefs = next;
      index += 1;
    } else if (arg === "--translated-at") {
      parsed.translatedAt = next;
      index += 1;
    } else if (arg === "--output") {
      parsed.output = next;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}
