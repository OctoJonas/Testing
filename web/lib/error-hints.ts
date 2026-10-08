/**
 * Map common error strings to actionable hints rendered next to the error
 * banner. Lives in lib/ so multiple tabs share the same heuristics.
 */

export function deriveHint(error: string): string | undefined {
  const lower = error.toLowerCase();

  if (
    lower.includes("isprivate") ||
    lower.includes("private") ||
    lower.includes("sso") ||
    lower.includes("oauth") ||
    lower.includes("cognito")
  ) {
    return (
      "Open the agent in the Octonomy platform → Agent settings → toggle Public on. " +
      "The SDK can only consume widgets that aren't gated behind SSO."
    );
  }
  if (lower.includes("base64") || lower.includes("placeholder")) {
    return (
      "Copy the exact Widget ID from your Octonomy embed snippet (a base64 string ending " +
      "with `=` padding) into the Widget ID field in Settings."
    );
  }
  if (lower.includes("not configured")) {
    return "Open the Settings tab → create a real config → return here and pick it from the dropdown.";
  }
  if (lower.includes("origin") || lower.includes("referer")) {
    return (
      "The Origin and Referer must match a domain whitelisted in your widget's Embed Script " +
      "settings on the Octonomy platform. Referer must end with a trailing slash."
    );
  }
  if (lower.includes("nonce")) {
    return (
      "The conversation create call didn't return an x-nonce header. The widget may need to " +
      "be reconfigured on the platform side, or its base URL may be wrong."
    );
  }
  if (lower.includes("timeout") || lower.includes("connect failed")) {
    return (
      "The WebSocket connection to Octonomy failed. Check that the Base URL is reachable and " +
      "that the agent is online; retry in a moment."
    );
  }
  return undefined;
}
