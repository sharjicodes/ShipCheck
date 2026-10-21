import type axe from "axe-core";

export function normalizeAxeResults(results: axe.AxeResults, pageTitle: string, httpStatus: number) {
  const findings = results.violations.slice(0, 200).map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? null,
    description: violation.description,
    help: violation.help,
    helpUrl: violation.helpUrl,
    nodes: violation.nodes.length,
    tags: violation.tags,
    examples: violation.nodes.slice(0, 3).map((node) => {
      const selector = node.target.join(", ");
      const snippet = node.html.slice(0, 240);
      return `Selector: ${selector}\nElement: ${snippet}\nIssue: ${node.failureSummary ?? "See rule guidance."}`;
    })
  }));

  return {
    findings,
    summary: {
      violations: results.violations.length,
      passes: results.passes.length,
      incomplete: results.incomplete.length,
      inapplicable: results.inapplicable.length,
      affectedNodes: results.violations.reduce((total, item) => total + item.nodes.length, 0),
      pageTitle,
      httpStatus
    }
  };
}

export function publicScanFailure(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("timeout")) return "The website took too long to respond. Try again later.";
  if (message.includes("redirected to a different host")) return "The website redirected to another host, which is not allowed.";
  if (message.includes("http")) return "The website returned an unsuccessful response. Check that it is publicly reachable.";
  return "The scan could not complete. Check that the public website is reachable and try again.";
}
