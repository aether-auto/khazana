# Build Log — craft rubric (deep)

Models: Adafruit's learn guides (parts-first, exact, beginner-safe), Hackaday
project logs (honest about dead ends), Bunnie Huang (deep, specific, hardware-real),
Jeff Geerling (reproducible, benchmarked). The shared move: write so a stranger can
build exactly what you built, including surviving the parts where it didn't work the
first time.

## The governing test: can a stranger reproduce this?
Every decision in a build log serves reproducibility. If a reader can't order the
parts, run the commands, and hit the failures you hit (with your fixes ready), the
log failed. That test resolves most style questions: be specific, be exact, be
honest about what broke.

## The five imperatives, expanded

### 1. Parts list first
Open the build proper with a `<DataTable>`: component name, quantity, a source URL,
and an approximate cost. The reader should be able to order everything before
reading another word. Every part links to where you actually got it (cited). Exact
part numbers — "Raspberry Pi 5 (8GB)", not "a Raspberry Pi" — because the reader is
spending money on your word.

### 2. Numbered steps
Each step is a single completable action with a checkable result. Combine steps that
must happen atomically; separate ones the reader can verify independently. Number
them so the reader can say "I'm stuck on step 4" — and so the reproduce-this
checklist can reference them.

### 3. Exact commands, not paraphrases
"Run `sudo apt install -y mosquitto mosquitto-clients`", never "install the MQTT
broker". The exact command, in a fenced code block, copy-pasteable. Same for config:
show the actual file contents, the actual pin numbers, the actual flags. Paraphrase
is where reproduction breaks.

### 4. Name the failures
The "it didn't work at first because…" section is the most-read, most-valuable part
of any build log — it's why makers read build logs instead of official docs. Give
the *real* error message, the condition that caused it, and the *real* fix. "The
broker refused connections until I realized `bind_address` defaulted to localhost;
adding `listener 1883 0.0.0.0` fixed it." Honesty here is the format's signature.

### 5. "Reproduce this" checklist at the end
Close with a numbered checklist of every file, command, and config change in order —
the diff from zero. The reader uses it to verify they did everything and to diff
against when something misbehaves. It's the build log's executable summary.

## Grounding technique specific to a build
- Part numbers, prices, and source links are facts a reader will spend money on —
  cite each to where you sourced it; never invent a part number or price.
- Datasheet values (a pin function, a voltage, a default) are cited to the datasheet.
- Commands and config come from the project's real docs/source — cite them; don't
  guess a flag.
- Error messages and fixes are reported as they actually occurred — a fabricated
  error sends readers down a wrong path. If you can't source a specific, cut it.

## Code: JS vs everything else
- `<RunnableCode>` runs **JavaScript only** (a worker). Use it for runnable logic the
  reader can try in the browser (a checksum, a parser, a small algorithm).
- Shell, YAML, C, Python, Dockerfiles, config files → plain fenced code blocks (they
  are not runnable in the worker and must not be put in `<RunnableCode>`).

## Sentence-craft (founder voice)
- First person is natural — you built this. Concrete and specific throughout.
- Short, action-oriented sentences for steps; a longer one for context, then back.
- No hedging. No "The"-starting consecutive sentences.
- Candor about failures, stated plainly. End on the reproduce-this checklist.

## Component choreography
- `<DataTable>` for the parts list (and any results/measurements table); use its `total`
  footer for the BOM cost.
- `<RunnableCode>` only for runnable JS; fenced blocks for everything else.
- `<Annotation>` / `<Sidenote>` to cite part sources, datasheet values, and key commands
  inline (these are marginalia — they don't count toward density).
- **Density doctrine.** At least one knowledge-carrying island per ~800–1000 words; a
  6,000-word build-log carries **~6–8 substantive islands**. Reach depth through MORE
  knowledge-carrying components — `Figure`, a wiring `Diagram`, a `Stepper`, a `Checklist`,
  a `GanttStrip`, `CompareSlider` — each earned, **never padding**. The **component LEADS
  and prose wraps around it** to interpret, not restate.
- **`<Figure>` to SHOW the hardware** at each stage (bare board, populated board, the
  wiring, the working rig); local committed asset, caption + credit + `sourceUrl`.
- **`<Diagram>` for the wiring/pinout** — the pin mapping or system block diagram the prose
  would otherwise spend paragraphs describing.
- **`<Checklist>` for the reproduce-this list** — imperative 5 is now realized by the
  interactive `<Checklist>` the reader ticks off, not a static bullet list.
- **`<GanttStrip>` for build-phase durations**; **`<CompareSlider>` for before/after a
  fix** (misrouted vs corrected wiring, dark vs lit rig).
