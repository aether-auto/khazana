// apps/site/src/components/mdx/RunnableCode.tsx
import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import {
  makeRunRequest,
  parseWorkerMessage,
  type WorkerResponse,
} from "./lib/runner-protocol.js";
import "./mdx.css";
import "./RunnableCode.css";

export interface RunnableCodeProps {
  /** Initial source. */
  code: string;
  /** Max run time before the worker is killed (ms). Default 2000. */
  timeoutMs?: number;
  caption?: string;
}

const TERMINATE_MSG = "⏱ terminated (timeout — possible infinite loop)";

export default function RunnableCode({ code, timeoutMs = 2000, caption }: RunnableCodeProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const [output, setOutput] = useState<WorkerResponse | null>(null);
  const [running, setRunning] = useState(false);

  // Mount CodeMirror.
  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: code,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          history(),
          javascript(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.theme({}, { dark: true }),
        ],
      }),
    });
    viewRef.current = view;
    return () => view.destroy();
  }, [code]);

  // Worker lifecycle (lazy spawn helper).
  const spawnWorker = (): Worker => {
    const w = new Worker(new URL("./runner.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    return w;
  };
  useEffect(() => () => workerRef.current?.terminate(), []);

  const run = () => {
    const source = viewRef.current?.state.doc.toString() ?? code;
    setRunning(true);
    setOutput(null);
    workerRef.current?.terminate();
    const w = spawnWorker();
    const id = Math.random().toString(36).slice(2);

    const timer = window.setTimeout(() => {
      w.terminate();
      workerRef.current = null;
      setRunning(false);
      setOutput({ kind: "result", id, logs: [], value: null, error: TERMINATE_MSG, ms: timeoutMs });
    }, timeoutMs);

    w.onmessage = (e: MessageEvent) => {
      window.clearTimeout(timer);
      setRunning(false);
      try {
        setOutput(parseWorkerMessage(e.data));
      } catch {
        setOutput({ kind: "result", id, logs: [], value: null, error: "malformed worker message", ms: 0 });
      }
      w.terminate();
      workerRef.current = null;
    };
    w.postMessage(makeRunRequest(source, id));
  };

  return (
    <figure className="mdx-figure mdx-figure--wide rc">
      <div className="mdx-panel rc-panel">
        <div className="rc-bar">
          <span className="mdx-label">runnable · js</span>
          <button type="button" className="rc-run" onClick={run} disabled={running}>
            {running ? "running…" : "▸ run"}
          </button>
        </div>
        {/* CodeMirror mounts here; SSR shows the source as a <pre> fallback */}
        <div ref={hostRef} className="rc-editor" />
        <noscript>
          <pre className="rc-fallback">{code}</pre>
        </noscript>
        <div className="rc-output">
          <div className="rc-output-bar">
            <span className="mdx-label">output</span>
            {output !== null ? <span className="rc-meta">{output.ms} ms</span> : null}
          </div>
          <div className="rc-output-body" aria-live="polite">
            {output === null ? (
              <span className="rc-hint">Run the code to see its output here.</span>
            ) : (
              <>
                {output.logs.map((l, i) => (
                  <div className="rc-line" key={i}>{l}</div>
                ))}
                {output.value !== null ? <div className="rc-line rc-value">⮑ {output.value}</div> : null}
                {output.error !== null ? <div className="rc-line rc-error">{output.error}</div> : null}
                {output.logs.length === 0 && output.value === null && output.error === null ? (
                  <span className="rc-hint">No output.</span>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
