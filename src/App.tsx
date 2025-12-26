import React, { useEffect, useMemo, useRef, useState } from "react";
import { Trash2, Plus, ClipboardPaste, Clock, Sun, Moon, Wand2 } from "lucide-react";
import SunCalc from "suncalc";
import { motion } from "framer-motion";

/**
 * ATC Tablet Timeline App (Vite/React) — self-contained UI (no shadcn imports)
 * - Enter only ARR/DEP and local times
 * - Generates IFR blocks with buffers + VFR windows
 * - Daylight window: auto sunrise/sunset for Bucharest (Europe/Bucharest) or manual override
 */

// ------------------------
// Minimal UI components
// ------------------------
function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-2xl border bg-background shadow-sm ${className}`}>{children}</div>;
<div className="bg-red-500 text-white p-4 rounded-xl">TAILWIND TEST</div>
}
function CardHeader({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`p-4 pb-2 ${className}`}>{children}</div>;
}
function CardTitle({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`font-semibold ${className}`}>{children}</div>;
}
function CardContent({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`p-4 pt-0 ${className}`}>{children}</div>;
}

function Button({
  children,
  onClick,
  className = "",
  variant = "primary",
  size = "md",
  type = "button",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "md" | "icon";
  type?: "button" | "submit";
  title?: string;
}) {
  const base =
    "inline-flex items-center justify-center rounded-xl text-sm font-medium transition border select-none";
  const sizes = size === "icon" ? "h-9 w-9" : "h-9 px-3";
  const v =
    variant === "primary"
      ? "bg-black text-white border-black hover:opacity-90"
      : variant === "secondary"
      ? "bg-muted text-foreground border-muted hover:bg-muted/70"
      : variant === "outline"
      ? "bg-transparent text-foreground border-border hover:bg-muted/40"
      : "bg-transparent text-foreground border-transparent hover:bg-muted/40";
  return (
    <button type={type} onClick={onClick} className={`${base} ${sizes} ${v} ${className}`} title={title}>
      {children}
    </button>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  const { className = "", ...rest } = props;
  return (
    <input
      {...rest}
      className={`h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-black/20 ${className}`}
    />
  );
}

function Label({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`text-sm font-medium ${className}`}>{children}</div>;
}

function Switch({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onCheckedChange(!checked)}
      className={`h-6 w-11 rounded-full border transition relative ${
        checked ? "bg-black border-black" : "bg-muted border-border"
      }`}
      aria-checked={checked}
      role="switch"
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${checked ? "left-5" : "left-0.5"}`}
      />
    </button>
  );
}

function Separator({ className = "" }: { className?: string }) {
  return <div className={`h-px w-full bg-border ${className}`} />;
}

// ------------------------
// Helpers
// ------------------------
function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function parseHHMM(str: unknown): number | null {
  // Android tablets often show a numeric keyboard without ':'
  // Accept: HH:MM, HH.MM, HH MM, or HHMM (e.g., 0735)
  if (str == null) return null;
  const s = String(str).trim();
  if (!s) return null;

  // HH:MM / HH.MM / HH MM
  const m1 = s.match(/^([01]?\d|2[0-3])[:.\s]([0-5]\d)$/);
  if (m1) return Number(m1[1]) * 60 + Number(m1[2]);

  // HHMM (4 digits)
  const m2 = s.match(/^([01]\d|2[0-3])([0-5]\d)$/);
  if (m2) return Number(m2[1]) * 60 + Number(m2[2]);

  return null;
}

function normalizeTimeInput(raw: unknown) {
  const s = String(raw ?? "").trim();
  // Auto-format for Android: 0735 -> 07:35
  if (/^\d{4}$/.test(s)) return `${s.slice(0, 2)}:${s.slice(2)}`;
  return s;
}

function fmtHHMM(mins: number) {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function minutesBetween(a: number, b: number) {
  return b - a;
}

function isToday(dateStr: string) {
  const d = new Date();
  const t = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return dateStr === t;
}

function defaultTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function nowMinutesLocal() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

function minutesInTZ(date: Date, timeZone: string) {
  // Convert a Date to minutes-from-midnight in a target IANA timezone (e.g., Europe/Bucharest)
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hh * 60 + mm;
}

function sunTimesBucharest(dateStr: string) {
  // Bucharest city coords (approx). Replace with airport coords if desired.
  const lat = 44.4268;
  const lon = 26.1025;

  // Use midday UTC to avoid local date boundary issues.
  const d = new Date(`${dateStr}T12:00:00Z`);
  const times = SunCalc.getTimes(d, lat, lon);

  return {
    sunrise: minutesInTZ(times.sunrise, "Europe/Bucharest"),
    sunset: minutesInTZ(times.sunset, "Europe/Bucharest"),
  };
}

type Flight = {
  id: string;
  type: "ARR" | "DEP";
  time: string;
  timeMin: number | null;
};

type Buffers = {
  arrBefore: number;
  arrAfter: number;
  depBefore: number;
  depAfter: number;
};

type IFRBlock = {
  id: string;
  type: "ARR" | "DEP";
  t: number;
  start: number;
  end: number;
  startClamped: number;
  endClamped: number;
};

function buildIFRBlocks(flights: Flight[], buffers: Buffers): IFRBlock[] {
  const blocks: Omit<IFRBlock, "startClamped" | "endClamped">[] = [];
  for (const f of flights) {
    if (f.timeMin == null) continue;
    const isArr = f.type === "ARR";
    const start = f.timeMin - (isArr ? buffers.arrBefore : buffers.depBefore);
    const end = f.timeMin + (isArr ? buffers.arrAfter : buffers.depAfter);
    blocks.push({ id: f.id, type: f.type, t: f.timeMin, start, end });
  }

  return blocks
    .map((b) => ({
      ...b,
      startClamped: clamp(b.start, 0, 1440),
      endClamped: clamp(b.end, 0, 1440),
    }))
    .filter((b) => b.endClamped > b.startClamped)
    .sort((a, b) => a.startClamped - b.startClamped);
}

function mergeBlocks(blocks: IFRBlock[]) {
  if (!blocks.length) return [] as { start: number; end: number }[];
  const out: { start: number; end: number }[] = [];
  let cur = { start: blocks[0].startClamped, end: blocks[0].endClamped };
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.startClamped <= cur.end) {
      cur.end = Math.max(cur.end, b.endClamped);
    } else {
      out.push(cur);
      cur = { start: b.startClamped, end: b.endClamped };
    }
  }
  out.push(cur);
  return out;
}

function computeFreeWindows(
  mergedIFR: { start: number; end: number }[],
  daylight: { enabled: boolean; sunrise: number; sunset: number }
) {
  const dayStart = daylight?.enabled ? daylight.sunrise : 0;
  const dayEnd = daylight?.enabled ? daylight.sunset : 1440;
  const windows: { start: number; end: number }[] = [];

  let cursor = dayStart;
  for (const b of mergedIFR) {
    const s = clamp(b.start, dayStart, dayEnd);
    const e = clamp(b.end, dayStart, dayEnd);
    if (e <= dayStart || s >= dayEnd) continue;
    if (s > cursor) windows.push({ start: cursor, end: s });
    cursor = Math.max(cursor, e);
  }
  if (cursor < dayEnd) windows.push({ start: cursor, end: dayEnd });
  return windows.filter((w) => w.end > w.start);
}

function classifyVFR(windows: { start: number; end: number }[], recMin = 30, possMin = 20) {
  return windows.map((w) => {
    const len = minutesBetween(w.start, w.end);
    if (len >= recMin) return { ...w, vfr: "REC" as const, len };
    if (len >= possMin) return { ...w, vfr: "POSS" as const, len };
    return { ...w, vfr: "NONE" as const, len };
  });
}

function useInterval(callback: () => void, delay: number | null) {
  useEffect(() => {
    if (delay == null) return;
    const id = setInterval(callback, delay);
    return () => clearInterval(id);
  }, [callback, delay]);
}

const SLOT = 5; // minutes per slot

function Timeline({
  dateStr,
  blocks,
  vfr,
  daylight,
  showNow,
}: {
  dateStr: string;
  blocks: IFRBlock[];
  vfr: { start: number; end: number; vfr: "REC" | "POSS" | "NONE"; len: number }[];
  daylight: { enabled: boolean; sunrise: number; sunset: number };
  showNow: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  let dayStart = daylight.enabled ? daylight.sunrise : 0;
  let dayEnd = daylight.enabled ? daylight.sunset : 1440;
  if (!Number.isFinite(dayStart) || !Number.isFinite(dayEnd) || dayEnd <= dayStart) {
    dayStart = 0;
    dayEnd = 1440;
  }

  const slots = useMemo(() => {
    const start = Math.floor(dayStart / SLOT) * SLOT;
    const end = Math.ceil(dayEnd / SLOT) * SLOT;
    const arr: number[] = [];
    for (let t = start; t <= end; t += SLOT) arr.push(t);
    return { start, end, arr };
  }, [dayStart, dayEnd]);

  const [nowM, setNowM] = useState(nowMinutesLocal());
  useInterval(() => setNowM(nowMinutesLocal()), showNow && isToday(dateStr) ? 1000 : null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!(showNow && isToday(dateStr))) return;
    const el = containerRef.current;
    const denom = slots.end - slots.start || 1;
    const pct = clamp((nowM - slots.start) / denom, 0, 1);
    el.scrollLeft = pct * (el.scrollWidth - el.clientWidth) - el.clientWidth * 0.3;
  }, [dateStr, showNow, nowM, slots.start, slots.end]);

  const pxPerMin = 2.2;
  const widthPx = (slots.end - slots.start) * pxPerMin;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" /> Timeline (5-min)
          <span className="ml-auto text-xs text-muted-foreground">{daylight.enabled ? "Daylight" : "24h"}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-xl border" ref={containerRef}>
          <div className="relative" style={{ width: widthPx }}>
            {slots.arr.map((t) =>
              t % 60 === 0 ? (
                <div
                  key={t}
                  className="absolute top-0 bottom-0 border-l"
                  style={{ left: (t - slots.start) * pxPerMin }}
                >
                  <div className="sticky left-0 -translate-x-1/2 text-[10px] text-muted-foreground mt-1 bg-background/70 px-1 rounded">
                    {fmtHHMM(t)}
                  </div>
                </div>
              ) : null
            )}

            {daylight.enabled ? (
              <>
                <div
                  className="absolute top-0 bottom-0 bg-muted/20"
                  style={{ left: 0, width: (daylight.sunrise - slots.start) * pxPerMin }}
                />
                <div
                  className="absolute top-0 bottom-0 bg-muted/20"
                  style={{
                    left: (daylight.sunset - slots.start) * pxPerMin,
                    width: (slots.end - daylight.sunset) * pxPerMin,
                  }}
                />
              </>
            ) : null}

            <div className="relative h-10 mt-6">
              <div className="absolute left-0 right-0 top-0 h-10 rounded-lg bg-muted/10" />
              {blocks.map((b) => (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute top-1 h-8 rounded-lg bg-red-500/70"
                  style={{
                    left: (b.startClamped - slots.start) * pxPerMin,
                    width: (b.endClamped - b.startClamped) * pxPerMin,
                  }}
                  title={`${b.type} ${fmtHHMM(b.t)} | IFR ${fmtHHMM(b.start)}–${fmtHHMM(b.end)}`}
                />
              ))}
              <div className="absolute left-2 top-1 text-[11px] text-muted-foreground">IFR block</div>
            </div>

            <div className="relative h-10 mt-3 mb-5">
              <div className="absolute left-0 right-0 top-0 h-10 rounded-lg bg-muted/10" />
              {vfr
                .filter((w) => w.vfr !== "NONE")
                .map((w, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`absolute top-1 h-8 rounded-lg ${
                      w.vfr === "REC" ? "bg-green-500/70" : "bg-green-300/80"
                    }`}
                    style={{
                      left: (w.start - slots.start) * pxPerMin,
                      width: (w.end - w.start) * pxPerMin,
                    }}
                    title={`VFR ${w.vfr === "REC" ? "recommended" : "possible"}: ${fmtHHMM(w.start)}–${fmtHHMM(
                      w.end
                    )} (${Math.round(w.len)} min)`}
                  />
                ))}
              <div className="absolute left-2 top-1 text-[11px] text-muted-foreground">VFR windows</div>
            </div>

            {showNow && isToday(dateStr) ? (
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-yellow-500"
                style={{ left: (nowM - slots.start) * pxPerMin }}
                title={`NOW ${fmtHHMM(Math.floor(nowM))}`}
              />
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded bg-red-500/70" /> IFR block
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded bg-green-500/70" /> VFR ≥30
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded bg-green-300/80" /> VFR 20–29
          </div>
          {daylight.enabled ? (
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded bg-muted/30" /> Night masked
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function parsePaste(text: string) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: { type: "ARR" | "DEP"; time: string }[] = [];
  for (const l of lines) {
    const cleaned = l.replace(/\t/g, ",");
    const parts = cleaned.split(/[,; ]+/).filter(Boolean);
    if (parts.length < 2) continue;
    const type = parts[0].toUpperCase();
    const time = parts[1];
    if (!(type === "ARR" || type === "DEP")) continue;
    const m = parseHHMM(time);
    if (m == null) continue;
    out.push({ type: type as "ARR" | "DEP", time });
  }
  return out;
}

function makeId() {
  // Avoid crypto.randomUUID issues on some Android WebViews / older browsers
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function App() {
  const isBriefing = new URLSearchParams(window.location.search).get("briefing") === "1";

  const [dateStr, setDateStr] = useState(defaultTodayStr());

const [nowM, setNowM] = useState(nowMinutesLocal());
useInterval(() => setNowM(nowMinutesLocal()), isToday(dateStr) ? 1000 : null);

  const [flights, setFlights] = useState<{ id: string; type: "ARR" | "DEP"; time: string }[]>(() => [
    { id: makeId(), type: "ARR", time: "10:00" },
    { id: makeId(), type: "DEP", time: "10:40" },
  ]);
const STORAGE_PREFIX = "atc_timeline_v1";

function storageKey(dateStr: string) {
  return `${STORAGE_PREFIX}:${dateStr}`;
}

type SavedDay = {
  dateStr: string;
  flights: { id: string; type: "ARR" | "DEP"; time: string }[];
  buffers: Buffers;
  daylight: { enabled: boolean; sunrise: number; sunset: number };
  autoSun: boolean;
  showNow: boolean;
  savedAt: number; // epoch ms
};
  const [buffers, setBuffers] = useState<Buffers>({
    arrBefore: 15,
    arrAfter: 5,
    depBefore: 10,
    depAfter: 5,
  });

  const [daylight, setDaylight] = useState({
    enabled: true,
    sunrise: 8 * 60,
    sunset: 16 * 60 + 30,
  });

  const [autoSun, setAutoSun] = useState(true);
  const [showNow, setShowNow] = useState(true);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
useEffect(() => {
  try {
    const raw = localStorage.getItem(storageKey(dateStr));
    if (!raw) return;

    const parsed = JSON.parse(raw) as SavedDay;
    if (!parsed || parsed.dateStr !== dateStr) return;

    // rehydrate
    setFlights(parsed.flights?.length ? parsed.flights : []);
    setBuffers(parsed.buffers ?? { arrBefore: 15, arrAfter: 5, depBefore: 10, depAfter: 5 });
    setDaylight(parsed.daylight ?? { enabled: true, sunrise: 8 * 60, sunset: 16 * 60 + 30 });
    setAutoSun(parsed.autoSun ?? true);
    setShowNow(parsed.showNow ?? true);
  } catch {
    // ignore corrupt storage
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [dateStr]);
useEffect(() => {
  const payload: SavedDay = {
    dateStr,
    flights,
    buffers,
    daylight,
    autoSun,
    showNow,
    savedAt: Date.now(),
  };

  // Debounce 300ms ca să nu scrie în storage la fiecare tastă
  const id = window.setTimeout(() => {
    try {
      localStorage.setItem(storageKey(dateStr), JSON.stringify(payload));
    } catch {
      // storage full / blocked — ignore
    }
  }, 300);

  return () => window.clearTimeout(id);
}, [dateStr, flights, buffers, daylight, autoSun, showNow]);
  useEffect(() => {
    if (!autoSun) return;
    try {
      const { sunrise, sunset } = sunTimesBucharest(dateStr);
      if (Number.isFinite(sunrise) && Number.isFinite(sunset) && sunset > sunrise) {
        setDaylight((d) => ({
          ...d,
          sunrise: clamp(sunrise, 0, 1439),
          sunset: clamp(sunset, 0, 1440),
        }));
      } else {
        setDaylight((d) => ({ ...d, enabled: false }));
      }
    } catch {
      // keep current values
    }
  }, [dateStr, autoSun]);

  const flightsParsed: Flight[] = useMemo(() => {
    return flights.map((f) => ({
      ...f,
      time: normalizeTimeInput(f.time),
      timeMin: parseHHMM(f.time),
    }));
  }, [flights]);

  const ifrBlocks = useMemo(() => buildIFRBlocks(flightsParsed, buffers), [flightsParsed, buffers]);
  const mergedIFR = useMemo(() => mergeBlocks(ifrBlocks), [ifrBlocks]);
const ifrWarning = useMemo(() => {
  if (!isToday(dateStr)) return null;

  // Caută următoarea fereastră IFR care începe după "acum"
  for (const b of mergedIFR) {
    const minsToStart = b.start - nowM;

    // Afișăm doar în ultimele 10 minute înainte de IFR
    if (minsToStart > 0 && minsToStart <= 10) {
      return { minsLeft: Math.ceil(minsToStart) };
    }
  }
  return null;
}, [dateStr, mergedIFR, nowM]);
  const freeWindows = useMemo(() => computeFreeWindows(mergedIFR, daylight), [mergedIFR, daylight]);
  const vfrWindows = useMemo(() => classifyVFR(freeWindows, 30, 20), [freeWindows]);

  const totalIFR = useMemo(() => mergedIFR.reduce((s, b) => s + (b.end - b.start), 0), [mergedIFR]);
  const totalVFRrec = useMemo(
    () => vfrWindows.filter((w) => w.vfr === "REC").reduce((s, w) => s + w.len, 0),
    [vfrWindows]
  );
  const totalVFRposs = useMemo(
    () => vfrWindows.filter((w) => w.vfr === "POSS").reduce((s, w) => s + w.len, 0),
    [vfrWindows]
  );

  function addRow() {
    setFlights((p) => [...p, { id: makeId(), type: "ARR", time: "" }]);
  }

  function removeRow(id: string) {
    setFlights((p) => p.filter((x) => x.id !== id));
  }
function clearToday() {
  if (!window.confirm("Ștergi planul pentru ziua curentă?")) return;

  setFlights([]);
  // opțional: resetezi și buffer-ele la default
  setBuffers({
    arrBefore: 15,
    arrAfter: 5,
    depBefore: 10,
    depAfter: 5,
  });

  try {
    localStorage.removeItem(storageKey(dateStr));
  } catch {}
}
  function applyPaste() {
    const parsed = parsePaste(pasteText);
    if (!parsed.length) {
      setPasteOpen(false);
      return;
    }
    setFlights((p) => [...p, ...parsed.map((x) => ({ id: makeId(), type: x.type, time: x.time }))]);
    setPasteText("");
    setPasteOpen(false);
  }

  // Inline sanity tests (dev-only)
  useEffect(() => {
    const cases: Array<[string, number | null]> = [
      ["07:35", 7 * 60 + 35],
      ["7:05", 7 * 60 + 5],
      ["07.35", 7 * 60 + 35],
      ["0735", 7 * 60 + 35],
      ["23:59", 23 * 60 + 59],
      ["2400", null],
      ["ab", null],
    ];
    for (const [inp, exp] of cases) {
      const got = parseHHMM(inp);
      console.assert(got === exp, `parseHHMM failed for '${inp}': got ${got}, expected ${exp}`);
    }
    console.assert(normalizeTimeInput("0735") === "07:35", "normalizeTimeInput(0735) should become 07:35");
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xl font-semibold">ATC Day Timeline (Tablet)</div>
{ifrWarning ? (
  <div className="rounded-xl border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm">
    <div className="font-semibold">⚠️ IFR în {ifrWarning.minsLeft} minute</div>
  </div>
) : null}
          <div className="text-sm text-muted-foreground">
            Introduce doar ore ARR/DEP pentru ziua în curs. Obții timeline + ferestre VFR.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Zi</Label>
          <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} className="w-[160px]" />
          <div className="flex items-center gap-2 ml-2">
            <Switch checked={showNow} onCheckedChange={setShowNow} />
            <span className="text-xs text-muted-foreground">NOW</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Flight plan (Today)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <Label className="text-xs">ARR buffer</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <Input
  disabled={isBriefing}
  inputMode="numeric"
  value={buffers.arrBefore}
  onChange={(e) => {
    if (isBriefing) return;
    setBuffers((b) => ({ ...b, arrBefore: Number(e.target.value || 0) }));
  }}
/>
                  <Input
		    disabled={isBriefing}
                    inputMode="numeric"
                    value={buffers.arrAfter}
                    onChange={(e) => setBuffers((b) => ({ ...b, arrAfter: Number(e.target.value || 0) }))}
                    placeholder="min după"
                  />
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">ex: -15 / +5</div>
              </div>

              <div>
                <Label className="text-xs">DEP buffer</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <Input
		    disabled={isBriefing}
                    inputMode="numeric"
                    value={buffers.depBefore}
                    onChange={(e) => setBuffers((b) => ({ ...b, depBefore: Number(e.target.value || 0) }))}
                    placeholder="min înainte"
                  />
                  <Input
		    disabled={isBriefing}
                    inputMode="numeric"
                    value={buffers.depAfter}
                    onChange={(e) => setBuffers((b) => ({ ...b, depAfter: Number(e.target.value || 0) }))}
                    placeholder="min după"
                  />
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">ex: -10 / +5</div>
              </div>

             {!isBriefing && (
  <div className="flex items-center justify-between gap-2">
    <Button variant="secondary" onClick={() => setPasteOpen((v) => !v)}>
      <ClipboardPaste className="h-4 w-4 mr-2" /> Paste
    </Button>
    <Button onClick={addRow}>
      <Plus className="h-4 w-4 mr-2" /> Add
    </Button>
  </div>
)}
{!isBriefing && (
  <Button
    variant="outline"
    onClick={clearToday}
    className="text-red-600 border-red-300 hover:bg-red-50"
  >
    Clear today
  </Button>
)}
            </div>

            {pasteOpen ? (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3">
                <Card className="border-dashed">
                  <CardContent className="pt-4">
                    <div className="text-xs text-muted-foreground mb-2">
                      Exemple: <span className="font-mono">ARR 10:15</span> /{" "}
                      <span className="font-mono">DEP,11:05</span> (câte una pe linie)
                    </div>
                    <textarea
                      className="w-full min-h-[90px] rounded-xl border border-border bg-background p-3 text-sm"
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder="ARR 10:15\nDEP 11:05\n..."
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <Button variant="outline" onClick={() => setPasteOpen(false)}>
                        Close
                      </Button>
                      <Button onClick={applyPaste}>Apply</Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : null}

            <Separator className="my-4" />

            <div className="space-y-2">
              <div className="mb-2 text-xs text-muted-foreground px-2">
                Android: dacă nu ai tasta ":", poți scrie ora ca <span className="font-mono">0735</span> sau{" "}
                <span className="font-mono">07.35</span>. (Se auto-convertește 0735 → 07:35)
              </div>

              <div className="grid grid-cols-12 text-xs text-muted-foreground px-2">
                <div className="col-span-4">Type</div>
                <div className="col-span-6">Local time</div>
                <div className="col-span-2 text-right">Remove</div>
              </div>

              {flights.map((f) => (
                <div key={f.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4">
                   <select
  disabled={isBriefing}
  className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm"
  value={f.type}
  onChange={(e) => {
    if (isBriefing) return;
    const v = e.target.value as "ARR" | "DEP";
    setFlights((p) => p.map((x) => (x.id === f.id ? { ...x, type: v } : x)));
  }}
>
  <option value="ARR">ARR</option>
  <option value="DEP">DEP</option>
</select>
                  </div>

                  <div className="col-span-6">
                   <Input
  disabled={isBriefing}
  value={f.time}
  onChange={(e) => {
    if (isBriefing) return;
    const v = normalizeTimeInput(e.target.value);
    setFlights((p) => p.map((x) => (x.id === f.id ? { ...x, time: v } : x)));
  }}
  placeholder="HH:MM / HH.MM / HHMM"
  className="font-mono"
  inputMode="text"
  autoCapitalize="off"
  autoCorrect="off"
/>
                    {parseHHMM(f.time) == null && f.time ? (
                      <div className="text-[11px] text-red-500 mt-1">
                        Format invalid. Folosește HH:MM / HH.MM / HHMM (ex: 07:05, 07.05, 0705)
                      </div>
                    ) : null}
                  </div>

                  <div className="col-span-2 flex justify-end">
  {!isBriefing && (
    <Button variant="ghost" size="icon" onClick={() => removeRow(f.id)} title="Remove">
      <Trash2 className="h-4 w-4" />
    </Button>
  )}
</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daylight (Bucharest) & Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                {daylight.enabled ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                <span>Limit to daylight</span>
              </div>
              <Switch checked={daylight.enabled} onCheckedChange={(v) => setDaylight((d) => ({ ...d, enabled: v }))} />
            </div>

            <div className={`space-y-2 ${daylight.enabled ? "" : "opacity-50 pointer-events-none"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Wand2 className="h-4 w-4" />
                  <span>Auto sunrise/sunset (Europe/Bucharest)</span>
                </div>
                <Switch checked={autoSun} onCheckedChange={setAutoSun} />
              </div>

              <div className={`grid grid-cols-2 gap-2 ${autoSun ? "opacity-70" : ""}`}>
                <div>
                  <Label className="text-xs">Sunrise</Label>
                  <Input
                    className="font-mono"
                    value={fmtHHMM(daylight.sunrise)}
                    disabled={autoSun}
                    placeholder={autoSun ? "auto" : "HH:MM"}
                  />
                </div>
                <div>
                  <Label className="text-xs">Sunset</Label>
                  <Input
                    className="font-mono"
                    value={fmtHHMM(daylight.sunset)}
                    disabled={autoSun}
                    placeholder={autoSun ? "auto" : "HH:MM"}
                  />
                </div>
              </div>

              {!autoSun ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Set manual sunrise</Label>
                    <Input
                      className="font-mono"
                      defaultValue={fmtHHMM(daylight.sunrise)}
                      onBlur={(e) => {
                        const m = parseHHMM(e.target.value);
                        if (m != null) setDaylight((d) => ({ ...d, sunrise: m }));
                      }}
                      placeholder="HH:MM"
                      inputMode="text"
                      autoCapitalize="off"
                      autoCorrect="off"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Set manual sunset</Label>
                    <Input
                      className="font-mono"
                      defaultValue={fmtHHMM(daylight.sunset)}
                      onBlur={(e) => {
                        const m = parseHHMM(e.target.value);
                        if (m != null) setDaylight((d) => ({ ...d, sunset: m }));
                      }}
                      placeholder="HH:MM"
                      inputMode="text"
                      autoCapitalize="off"
                      autoCorrect="off"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <Separator />

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">IFR blocked</span>
                <span className="font-mono">{Math.round(totalIFR)} min</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">VFR ≥30</span>
                <span className="font-mono">{Math.round(totalVFRrec)} min</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">VFR 20–29</span>
                <span className="font-mono">{Math.round(totalVFRposs)} min</span>
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground">
              Auto calculează răsărit/apus pentru București (fus Europe/Bucharest) pe baza zilei selectate. NOW marker apare doar pentru ziua curentă.
            </div>
          </CardContent>
        </Card>
      </div>

      <Timeline dateStr={dateStr} blocks={ifrBlocks} vfr={vfrWindows} daylight={daylight} showNow={showNow} />
    </div>
  );
}

export default App;

