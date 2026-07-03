# Build Log — worked exemplars & annotated patterns

## Canonical full-length exemplar (study this first)

**Read the full piece — `references/exemplars/air-quality-monitor.mdx`** ("Building a $70
Open-Source Air-Quality Monitor You Can Actually Trust", ~7,500 words). This is the
**gold standard** for the format: a complete, fact-checked build log you should read in
full and emulate. The annotated snippet-patterns below (Exemplars A–D) remain useful for
individual moves; this file is the whole shape done right.

What makes it exemplary — the moves to copy:

1. **Three REAL integration bugs are the spine** (symptom → cause → fix): sensor
   self-heating dragging RH low, an unchecked CRC yielding impossible CO₂, and a UART
   frame-parser phase-lock that silently froze the node. The "what went wrong" section
   isn't an afterthought — it's where the piece earns trust.
2. **16 knowledge-carrying islands, ~1 per ~400 words** — roughly 2× the density floor.
   Every heavy island (DataTable BOM, RunnableCode, Diagram, Chart, CompareSlider, Model3D)
   **LEADS** its section; the prose interprets the one decisive number rather than restating
   the component.
3. **Every spec is traced to a datasheet.** ~30 grounding Annotations put a datasheet
   section number behind nearly every pin, hex command, and coefficient — dense grounding
   that never reads like a citation dump.
4. **The RunnableCode actually executed.** All three JS snippets (PMS 32-byte frame
   checksum → PM2.5=12, Sensirion CRC-8 → 0x92, EPA correction → 19.3) were run in Node and
   produce the exact values the prose claims. Byte offsets stay internally consistent across
   CodeWalkthrough, RunnableCode, and the C loop.
5. **A thesis stated in numbers, then made arithmetic.** Opens on a concrete lie ("a raw
   reading climbs on a humid morning"), frames it in a StatBand, and closes the loop with
   code that literally computes 40 µg/m³ → ~20 µg/m³. One argument, executed end to end.
6. **Calibration treated as the real engineering, with honest scope.** Names the
   two-directional error, charts it, gives a co-location Checklist — and *bounds* the
   correction's validity ("trust it in the range you co-located; flag it, don't fabricate
   it, in dust"). Honest scope is a craft move.

**How to use it:** read it in full during the **Internalize** phase to calibrate the bar —
before you draft. Do **not** copy its topic; match its rigor, density, prose, and grounding.

---

## Exemplar A — parts-first, exact and cited

> Here's everything you need. Order it all before you start — half of this ships
> slowly.
>
> <DataTable client:load caption="Parts & tools"
>   columns={[
>     { key: "part", label: "Part", type: "string" },
>     { key: "qty", label: "Qty", type: "number", align: "right" },
>     { key: "source", label: "Source", type: "string" },
>     { key: "cost", label: "Cost ($)", type: "number", align: "right" }
>   ]}
>   rows={[
>     { part: "Raspberry Pi 5 (8GB)", qty: 1, source: "official reseller", cost: 80 },
>     { part: "Pimoroni NVMe Base", qty: 1, source: "pimoroni.com", cost: 18 },
>     { part: "1TB M.2 2280 NVMe SSD", qty: 1, source: "vendor", cost: 65 }
>   ]} />

**Why it works:** exact part names with specs (8GB, M.2 2280), a quantity, where to
get it, and a price — the reader can order the whole BOM before reading on. The
"ships slowly" aside is the kind of practical honesty makers read build logs for.
Each part's source would be cited from the brief.

## Exemplar B — a numbered step: action → result → exact command

> ### 3. Flash and boot from the SSD
> Write the OS image to the NVMe drive, then set the Pi to boot from it. After
> rebooting you should see the SSD as the root device.
>
> ```bash
> sudo rpi-imager --cli raspios.img /dev/nvme0n1
> sudo raspi-config nonint do_boot_order B2   # NVMe/USB before SD
> sudo reboot
> ```
>
> Verify with `lsblk` — the root `/` should now be on `nvme0n1p2`, not `mmcblk0`.

**Why it works:** one completable action, the expected result stated, the *exact*
commands in a fenced block (not "configure the boot order"), and a concrete
verification (`lsblk`, the specific device name). The reader can copy, run, and check.

## Exemplar C — the failure section (the most-read part)

> ### What went wrong
> The first boot hung at `Waiting for root device /dev/nvme0n1p2`. The drive was
> fine — the problem was that the bootloader firmware predated NVMe boot support.
> The fix was to update the EEPROM before touching the SSD at all:
>
> ```bash
> sudo rpi-eeprom-update -a
> sudo reboot
> ```
>
> The official boot order
> <Annotation client:load term="B2 = NVMe/USB first" note="raspi-config boot-order code B2 prioritizes NVMe/USB over the SD card — per the Raspberry Pi bootloader docs." />
> only takes effect once the firmware supports it. Update the EEPROM first; it cost
> me an evening.

**Why it works:** the *real* error string (`Waiting for root device…`), the actual
cause (stale bootloader firmware), the exact fix command, and the cited reason —
plus the honest "it cost me an evening". That candor is what makes a build log
trustworthy and reproducible.

## Exemplar D — a knowledge-carrying component leads, prose interprets

> <Figure client:visible
>   src="/reads/pi-nvme/populated-base.jpg"
>   alt="Pimoroni NVMe Base seated on the Pi 5's PCIe FPC connector, M.2 SSD screwed down"
>   caption="The NVMe Base populated: the FPC ribbon folds under the board, so it seats before the standoffs go in — not after."
>   credit="build ledger"
>   sourceUrl="https://ledger.khazana.dev/pi-nvme/populated-base" />
>
> Seat the ribbon *first*. The standoffs look like the natural anchor, but once they're
> torqued down the FPC connector is buried and you'll pull the whole base to reach it —
> ask me how I know. With the ribbon home, the standoffs are the last quarter-turn.

**Why it works:** the `<Figure>` LEADS — the reader sees the exact geometry (ribbon under
the board, standoff order) before a word of prose. The photo carries the knowledge the
prose would otherwise burn 200+ words describing ("the connector is on the underside,
folded, and the standoffs sit at the four corners such that…"); the prose then only
*interprets* — the assembly-order gotcha — instead of restating what the image already
shows. Caption + credit + `sourceUrl` point to the committed ledger asset, so the visual
is grounded like any other claim. A build log is VISUAL; show the hardware.

## Anti-patterns to avoid
- **Vague parts.** "A Raspberry Pi and an SSD." Give exact models and a BOM table.
- **Wall-of-commands minimalism.** Reaching the 20–25 min floor with a parts table, code
  blocks, and prose but no `<Figure>`s, `<Diagram>`, or `<Checklist>`. A build log with no
  build photos or wiring diagram is under-built and harder to reproduce.
- **Paraphrased commands.** "Set the boot order." Show the exact command.
- **Hiding the failures.** The dead ends are the value — include them with real
  errors and fixes.
- **Shell in `<RunnableCode>`.** It runs JS only; put shell/YAML/C in fenced blocks.
- **Invented part numbers or errors.** Cut anything you can't source.
