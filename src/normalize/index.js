const THINK_TAG_PATTERN = /<think\b[^>]*>[\s\S]*?<\/think>/gi;

export function stripReasoningTags(text) {
  if (typeof text !== "string") {
    return "";
  }

  return text
    .replace(THINK_TAG_PATTERN, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeProviderText(text) {
  return stripReasoningTags(text);
}
