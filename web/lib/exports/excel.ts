/**
 * Excel export workbooks for Q&A + autonomous test results.
 */
import ExcelJS from "exceljs";

import type { AutonomousTestResult, QATestResults } from "../types";

export async function generateQAExcel(results: QATestResults): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Octonomy AI Testing";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { header: "Field", key: "field", width: 30 },
    { header: "Value", key: "value", width: 40 },
  ];
  summary.addRows([
    { field: "Generated", value: new Date().toISOString() },
    { field: "Model", value: results.model },
    { field: "Total", value: results.total },
    { field: "Passed", value: results.satisfactory },
    { field: "Failed", value: results.failed ?? results.total - results.satisfactory },
    {
      field: "Pass Rate",
      value: results.total > 0 ? `${Math.round((results.satisfactory / results.total) * 100)}%` : "n/a",
    },
  ]);
  if (results.threshold !== undefined) {
    summary.addRow({ field: "Pass Threshold", value: `≥${Math.round(results.threshold * 100)}%` });
  }
  if (results.infrastructure_errors !== undefined) {
    summary.addRow({ field: "Widget Errors", value: results.infrastructure_errors });
  }
  if (results.latency) {
    summary.addRows([
      { field: "Widget Response (median)", value: `${(results.latency.median_ms / 1000).toFixed(1)}s` },
      { field: "Widget Response (p95)", value: `${(results.latency.p95_ms / 1000).toFixed(1)}s` },
    ]);
  }
  summary.getRow(1).font = { bold: true };

  const detail = workbook.addWorksheet("Results");
  // Build dynamic columns for any metrics present in the run.
  const baseCols: ExcelJS.TableColumnProperties[] = [
    { name: "#", filterButton: false },
    { name: "Pass" },
    { name: "Status" },
    { name: "Score" },
    { name: "Response (s)" },
    { name: "Question" },
    { name: "Expected" },
    { name: "Actual" },
    { name: "Evaluation" },
    { name: "Reasoning" },
    { name: "ConversationId" },
  ];
  const metricKeys = new Set<string>();
  for (const r of results.results ?? []) {
    if (r.metrics) for (const k of Object.keys(r.metrics)) metricKeys.add(k);
  }
  const metricCols = [...metricKeys].sort().map<ExcelJS.TableColumnProperties>((k) => ({ name: k }));
  const allCols = [...baseCols, ...metricCols];
  detail.columns = allCols.map((c) => ({ header: c.name, width: 20 }));

  for (const r of results.results ?? []) {
    const infra = r.status === "widget_error" || r.status === "no_response";
    const baseRow: (string | number | null)[] = [
      (r.index ?? 0) + 1,
      r.is_satisfactory ? "PASS" : infra ? "ERROR" : "FAIL",
      r.status ?? "answered",
      typeof r.overall_score === "number" ? Math.round(r.overall_score * 100) : null,
      typeof r.response_time_ms === "number" ? Number((r.response_time_ms / 1000).toFixed(1)) : null,
      r.question ?? "",
      r.expected_answer ?? "",
      r.actual_response ?? "",
      r.evaluation ?? "",
      r.reasoning ?? "",
      r.conversation_id ?? "",
    ];
    const metricValues = [...metricKeys].sort().map((k) => {
      const v = r.metrics?.[k as keyof typeof r.metrics];
      return typeof v === "number" ? Math.round(v * 100) : null;
    });
    detail.addRow([...baseRow, ...metricValues]);
  }
  detail.getRow(1).font = { bold: true };
  detail.views = [{ state: "frozen", ySplit: 1 }];

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}

export async function generateAutonomousExcel(result: AutonomousTestResult): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Octonomy AI Testing";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { header: "Field", key: "field", width: 30 },
    { header: "Value", key: "value", width: 60 },
  ];
  summary.addRows([
    { field: "Status", value: result.status },
    { field: "Total Turns", value: result.totalTurns },
    { field: "Duration (s)", value: Math.round(result.duration) },
    { field: "Conversation ID", value: result.conversationId ?? "" },
    { field: "Testing Prompt", value: result.testingPrompt },
  ]);
  if (result.overallEvaluation) {
    const o = result.overallEvaluation;
    summary.addRows([
      { field: "Average Score", value: `${Math.round(o.averageScore * 100)}%` },
      { field: "Satisfactory Turns", value: `${o.satisfactoryTurns} / ${o.totalEvaluatedTurns}` },
    ]);
    for (const [k, v] of Object.entries(o.metricsAverages ?? {})) {
      if (typeof v === "number") summary.addRow({ field: `avg ${k}`, value: Math.round(v * 100) });
    }
  }
  summary.getRow(1).font = { bold: true };

  const transcript = workbook.addWorksheet("Transcript");
  transcript.columns = [
    { header: "Turn", width: 6 },
    { header: "Role", width: 12 },
    { header: "Content", width: 80 },
    { header: "Evaluation", width: 14 },
  ];
  for (const msg of result.conversation ?? []) {
    transcript.addRow([
      msg.turnNumber,
      msg.role,
      msg.content,
      msg.evaluation
        ? `${Math.round(msg.evaluation.overall_score * 100)}% ${msg.evaluation.is_satisfactory ? "PASS" : "FAIL"}`
        : "",
    ]);
  }
  transcript.getRow(1).font = { bold: true };
  transcript.views = [{ state: "frozen", ySplit: 1 }];

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}
