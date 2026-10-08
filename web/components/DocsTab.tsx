export default function DocsTab() {
  return (
    <div className="bg-white rounded-b-lg shadow-sm p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Documentation</h2>

      <section className="mb-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <span className="bg-blue-100 text-blue-700 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold">
            1
          </span>
          Getting Started
        </h3>
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <p className="text-gray-700">
            This testing suite lets you exercise Octonomy chat widgets via three flows: manual
            chat, Q&amp;A regression testing with evaluation metrics, and autonomous AI-driven
            multi-turn testing.
          </p>
          <p className="text-gray-700">
            Before you begin, you need a real widget configured on the Octonomy platform. The
            sections below walk through the platform setup and how to wire it into this app.
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <span className="bg-blue-100 text-blue-700 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold">
            2
          </span>
          Configure Your Agent on the Octonomy Platform
        </h3>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <p className="text-amber-800 font-medium">
            Important: your agent must be Public. Private (OAuth-gated) widgets redirect to a
            login page and the embed handshake fails — you&apos;ll see &quot;OAuth-protected
            widget detected&quot; in the connection error banner.
          </p>
        </div>

        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-800 mb-2">Step 1: Enable public access</h4>
            <ol className="list-decimal list-inside space-y-2 text-gray-700">
              <li>Open your Octonomy platform dashboard</li>
              <li>
                Navigate to <strong>Agents</strong> and select your agent
              </li>
              <li>Open the agent settings</li>
              <li>
                Toggle <strong>Public</strong> on
              </li>
              <li>Save</li>
            </ol>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-800 mb-2">Step 2: Whitelist a domain</h4>
            <ol className="list-decimal list-inside space-y-2 text-gray-700">
              <li>
                Go to <strong>Agents</strong> &rarr; <strong>Embed Script</strong>
              </li>
              <li>
                Click <strong>Add Domain</strong>
              </li>
              <li>
                Enter the domain that will host the widget (e.g.{" "}
                <code className="bg-gray-200 px-1.5 py-0.5 rounded text-sm">
                  https://your-domain.com
                </code>
                )
              </li>
              <li>Save</li>
            </ol>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-800 mb-2">Step 3: Read the values off the embed snippet</h4>
            <p className="text-gray-700 mb-3">
              On <strong>Agents</strong> &rarr; <strong>Embed Script</strong> the platform shows a
              copy-pasteable snippet that looks like this. You don&apos;t paste the snippet
              anywhere here — you just lift two values out of it and combine them with the domain
              you whitelisted in Step 2.
            </p>

            <pre className="bg-white rounded p-3 text-xs overflow-x-auto border border-gray-200 mb-3 leading-relaxed">
{`<div id="octonomy-widget"></div>
<script>
  window.widgetEmbedConfig = {
    widgetId: "`}<span className="text-blue-600 font-semibold">YWJjZGVmMTItMzQ1Ni03ODkw...</span>{`",
    baseUri:  "`}<span className="text-blue-600 font-semibold">https://your-platform.octonomy.ai</span>{`",
    context:  {}
  };
</script>
<script defer type="module" src="https://your-platform.octonomy.ai/widget/...js"></script>`}
            </pre>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Field in this app</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Where to find it</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Example</th>
                  </tr>
                </thead>
                <tbody className="text-gray-600">
                  <tr className="border-b border-gray-100 align-top">
                    <td className="py-2 px-3 font-mono text-blue-600">widgetId</td>
                    <td className="py-2 px-3">
                      <code className="bg-gray-200 px-1 rounded text-xs">widgetEmbedConfig.widgetId</code>{" "}
                      from the snippet
                    </td>
                    <td className="py-2 px-3 font-mono text-xs">YWJjZGVmMTItMzQ1Ni03ODkw...</td>
                  </tr>
                  <tr className="border-b border-gray-100 align-top">
                    <td className="py-2 px-3 font-mono text-blue-600">baseUrl</td>
                    <td className="py-2 px-3">
                      <code className="bg-gray-200 px-1 rounded text-xs">widgetEmbedConfig.baseUri</code>{" "}
                      from the snippet
                    </td>
                    <td className="py-2 px-3 font-mono text-xs">https://your-platform.octonomy.ai</td>
                  </tr>
                  <tr className="border-b border-gray-100 align-top">
                    <td className="py-2 px-3 font-mono text-blue-600">origin</td>
                    <td className="py-2 px-3">
                      <em>Not in the snippet</em>. It&apos;s the domain you whitelisted in Step 2
                      (the same string you typed into <strong>Add Domain</strong>).
                    </td>
                    <td className="py-2 px-3 font-mono text-xs">https://your-domain.com</td>
                  </tr>
                  <tr className="align-top">
                    <td className="py-2 px-3 font-mono text-blue-600">referer</td>
                    <td className="py-2 px-3">
                      <em>Not in the snippet</em>. Take{" "}
                      <code className="bg-gray-200 px-1 rounded text-xs">origin</code> and add a
                      trailing slash.
                    </td>
                    <td className="py-2 px-3 font-mono text-xs">https://your-domain.com/</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded p-3 mt-3 text-sm text-blue-900">
              <strong>Heads up:</strong> the widget will only authenticate from one of the
              whitelisted domains. The <code className="bg-blue-100 px-1 rounded">origin</code> /{" "}
              <code className="bg-blue-100 px-1 rounded">referer</code> you put here have to match
              one of the entries you saved in <strong>Add Domain</strong> — otherwise the platform
              rejects the handshake with a CORS error.
            </div>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <span className="bg-blue-100 text-blue-700 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold">
            3
          </span>
          Add the Configuration to this App
        </h3>
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>
              Open the <strong>Settings</strong> tab
            </li>
            <li>
              Click <strong>Add New Configuration</strong>
            </li>
            <li>
              Fill in the fields with the values you copied from the Octonomy platform:
              <ul className="list-disc list-inside ml-4 mt-2 space-y-1 text-gray-600">
                <li>
                  <strong>Name</strong> — a friendly label for this configuration
                </li>
                <li>
                  <strong>Widget ID</strong> — from the embed script
                </li>
                <li>
                  <strong>Base URL</strong> — platform URL
                </li>
                <li>
                  <strong>Origin</strong> — the domain you whitelisted
                </li>
                <li>
                  <strong>Referer</strong> — same as origin with trailing slash
                </li>
              </ul>
            </li>
            <li>Save. The new config becomes selectable in every tab.</li>
          </ol>
          <p className="text-gray-600 text-sm">
            Configs are stored on the server (same persistent database as test suites) and shared
            by everyone using this deployment — save one here and a teammate sees it immediately.
            Configs saved in this browser before server storage existed are migrated up
            automatically on the next load. Nothing is preselected: a connection to a widget is
            only established when you actively pick a config in a tab.
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <span className="bg-blue-100 text-blue-700 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold">
            4
          </span>
          Testing Modes
        </h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-800 mb-2 flex items-center gap-2">
              <span className="text-blue-500">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </span>
              Chat
            </h4>
            <p className="text-sm text-gray-600">
              Manual back-and-forth with the widget. Streams Claude responses live and lets you
              cancel in-flight messages.
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-800 mb-2 flex items-center gap-2">
              <span className="text-green-500">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  />
                </svg>
              </span>
              Testpilot (Q&amp;A)
            </h4>
            <p className="text-sm text-gray-600">
              Upload an Excel of question / expected-answer pairs — or load a saved{" "}
              <strong>test suite</strong>. A preflight canary verifies the widget answers before
              the run starts; each reply is then scored by Claude. Results are filterable
              (click the stat cards), searchable, and show per-question response times.
              Widget/backend failures are flagged as <strong>ERROR</strong> (not FAIL) and can be
              re-run with one click via <strong>Retry errored</strong>.
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-800 mb-2 flex items-center gap-2">
              <span className="text-purple-500">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </span>
              Autonomous
            </h4>
            <p className="text-sm text-gray-600">
              Claude drives a multi-turn conversation against the widget given your testing prompt
              and goal. Optional per-turn evaluation grades the widget&apos;s answers as the
              conversation unfolds.
            </p>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <span className="bg-blue-100 text-blue-700 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold">
            5
          </span>
          Test Suites &amp; Run History
        </h3>
        <div className="bg-gray-50 rounded-lg p-4 space-y-3 text-gray-700">
          <p>
            A <strong>test suite</strong> is a named set of Q&amp;A pairs stored on the server
            (SQLite on a persistent volume) — unlike configs, suites are shared by everyone using
            this deployment and survive deploys and browser changes.
          </p>
          <ol className="list-decimal list-inside space-y-2">
            <li>
              Upload your Excel once in <strong>Testpilot</strong>, then click{" "}
              <strong>Save as suite</strong>.
            </li>
            <li>
              Next time (any browser, any teammate), pick it from the <strong>Test Suite</strong>{" "}
              dropdown — no file needed.
            </li>
            <li>
              <strong>Edit pairs</strong> lets you fix expected answers or add/remove questions
              in place, without round-tripping through Excel.
            </li>
            <li>
              While a suite is selected, every completed run is saved to its{" "}
              <strong>Run History</strong> automatically, tagged with the widget config it ran
              against.
            </li>
          </ol>
          <p className="text-sm text-gray-600">
            The Run History panel shows each run&apos;s pass rate, widget-error count, and median
            response time, plus a pass-rate <strong>trend line</strong> (amber dots mark runs with
            widget errors). <strong>View</strong> reopens any stored run; history keeps the most
            recent 200 runs per suite. Selecting &quot;— none (ad-hoc upload) —&quot; disables
            history entirely.
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <span className="bg-blue-100 text-blue-700 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold">
            6
          </span>
          Evaluator
        </h3>
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <p className="text-gray-700">
            All evaluations run on <strong>Claude Sonnet 4.5</strong> via the server&apos;s{" "}
            <code className="bg-gray-200 px-1.5 py-0.5 rounded text-sm">ANTHROPIC_API_KEY</code>{" "}
            environment variable. The model can be overridden with{" "}
            <code className="bg-gray-200 px-1.5 py-0.5 rounded text-sm">EVALUATOR_MODEL</code>.
          </p>
          <p className="text-gray-700">
            <strong>No API keys are entered in the UI</strong> — they live only on the server.
            That&apos;s a deliberate change from earlier versions of this tool.
          </p>
          <p className="text-gray-600 text-sm">
            Each evaluation produces five sub-scores (relevance, accuracy, completeness,
            helpfulness, coherence) plus an overall <code>0–100</code> score and a
            satisfactory/unsatisfactory verdict against a configurable threshold (default{" "}
            <code>0.7</code>). The results header always states which model and threshold
            produced a report.
          </p>
          <p className="text-gray-600 text-sm">
            <strong>Widget/backend failures are never evaluated.</strong> If the widget relays an
            upstream error (e.g. its agent points at a nonexistent LLM model) or times out, the
            row is classified as an infrastructure error — amber <strong>ERROR</strong>, counted
            separately from red <strong>FAIL</strong> — so broken plumbing doesn&apos;t drag down
            the answer-quality score.
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <span className="bg-blue-100 text-blue-700 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold">
            7
          </span>
          Connections, Reconnects &amp; Diagnostics
        </h3>
        <div className="bg-gray-50 rounded-lg p-4 space-y-3 text-gray-700">
          <p>
            Each tab shows a coloured dot reflecting its widget handshake — grey (idle), amber
            (configuring/connecting), green (ready), red (error). A handshake stuck longer than
            30 seconds flips to error automatically. The error banner includes a hint when the
            failure mode is recognised (CORS, OAuth-protected widget, invalid credentials,
            network).
          </p>
          <p>
            <strong>Network blips are survivable:</strong> if the connection to this server
            drops, an amber &quot;Reconnecting…&quot; banner appears and your session — widget
            config, chat, and any running test — is kept alive on the server for a grace period
            (90s) and resumes automatically when the socket returns. Only a prolonged outage
            ends the session.
          </p>
          <p className="text-sm text-gray-600">
            The <strong>Widget WebSocket events</strong> panel (🧰 button, bottom-left) records
            the last 200 widget-protocol events — configure, authenticate, messages, test
            updates — with transport noise filtered out. Attach its contents when reporting a
            stuck connection.
          </p>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Quick Reference</h3>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-800 mb-2">Example configuration</h4>
          <pre className="bg-white rounded p-3 text-sm overflow-x-auto border border-blue-100">
            {`{
  "name": "Production Widget",
  "widgetId": "YWJjZGVmMTItMzQ1Ni03ODkwLWJmNDEtMTRkZDYzYTY5NGE0",
  "baseUrl": "https://your-platform.octonomy.ai",
  "origin": "https://your-domain.com",
  "referer": "https://your-domain.com/"
}`}
          </pre>
        </div>
      </section>
    </div>
  );
}
