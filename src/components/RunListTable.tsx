"use client";

import type { RunListOutput } from "@/lib/claude";

interface Props {
  data: RunListOutput;
  pdfVerified?: Set<string>;
  onPrint?: () => void;
  onCopy?: () => void;
  onPdf?: () => void;
}

const CLEAN_STYLE = {
  NO_CLEAN: "text-green-600",
  WATER_RINSE: "text-blue-700",
  RINSE: "text-amber-600",
  TAKE_APART: "text-red-600",
};

const CLEAN_LABEL = {
  NO_CLEAN: "—",
  WATER_RINSE: "WR",
  RINSE: "Rinse",
  TAKE_APART: "TA",
};

const MACHINE_HEADER: Record<string, string> = {
  "Batch A": "bg-blue-100 text-blue-900",
  "Batch B": "bg-purple-100 text-purple-900",
  "44 QT": "bg-green-100 text-green-900",
};

function gallonsForTubs(tubs: number): number {
  return tubs * 3;
}

export default function RunListTable({ data, pdfVerified, onPrint, onCopy }: Props) {
  const dateStr = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const flavorCount = new Set(
    data.machines.flatMap((m) => m.runs.map((r) => r.flavor))
  ).size;
  const totalGallons = gallonsForTubs(data.totals.tubs);
  const machineLabel =
    data.machines.length === 3
      ? "All 3 machines"
      : data.machines.map((m) => m.name).join(" + ");

  return (
    <div className="text-[#1a1a1a]">
      {/* HEADER */}
      <div className="flex justify-between items-start mb-1.5">
        <div>
          <div className="text-[17px] font-semibold">Run List — {dateStr}</div>
        </div>
        <div className="flex gap-2 print:hidden">
          <button
            onClick={onPrint || (() => window.print())}
            className="text-[11px] px-3 py-1 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-100"
          >
            Print
          </button>
          {onCopy && (
            <button
              onClick={onCopy}
              className="text-[11px] px-3 py-1 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-100"
            >
              Copy
            </button>
          )}
        </div>
      </div>
      <div className="text-xs text-gray-500 mb-3">
        {flavorCount} flavors · {data.totals.tubs} tubs · {totalGallons} gallons · {machineLabel}
      </div>

      {/* LEGEND */}
      <div className="flex gap-3.5 flex-wrap mb-3.5 text-[11px] py-1.5 px-2.5 bg-gray-50 rounded-lg border border-gray-100 text-gray-600 print:hidden">
        <LegendDot color="#16a34a" label="No clean" />
        <LegendDot color="#1d4ed8" label="Water rinse" />
        <LegendDot color="#d97706" label="Rinse" />
        <LegendDot color="#dc2626" label="Take apart" />
        <LegendBadge className="bg-green-100 text-green-800" label="chain" suffix="TA saved" />
        <LegendBadge className="bg-red-100 text-red-800" label="nut" suffix="Allergen" />
        <LegendBadge className="bg-yellow-100 text-yellow-800" label="PDF" suffix="Recipe verified" />
      </div>

      {/* MACHINE COLUMNS */}
      <div className="flex gap-3.5 items-start print:gap-2">
        {data.machines.map((machine) => (
          <MachineColumn key={machine.name} machine={machine} pdfVerified={pdfVerified} />
        ))}
      </div>

      {/* TOTALS BAR */}
      <div className="mt-3.5 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[11px] text-gray-500 leading-7">
        <div>
          <strong className="text-gray-700">Totals:</strong> {data.totals.runs} runs · {data.totals.tubs} tubs · {totalGallons} gallons
        </div>
        {data.machines.map((m) => (
          <div key={m.name}>
            <strong className="text-gray-700">{m.name}:</strong>{" "}
            {m.summary.total_runs} runs ({m.summary.total_tubs} tubs) — {m.summary.take_aparts} TAs, {m.summary.rinses} Rinses, {m.summary.water_rinses} WRs, {m.summary.no_cleans} no-cleans
          </div>
        ))}
        <div>
          <strong className="text-gray-700">Combined:</strong>{" "}
          {data.totals.take_aparts} TAs, {data.totals.rinses} Rinses, {data.totals.water_rinses} WR, {data.totals.no_cleans} no-cleans
        </div>
      </div>
    </div>
  );
}

function MachineColumn({
  machine,
  pdfVerified,
}: {
  machine: RunListOutput["machines"][number];
  pdfVerified?: Set<string>;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div
        className={`px-2.5 py-2 rounded-t-lg font-semibold text-xs flex items-center gap-1.5 ${
          MACHINE_HEADER[machine.name] || "bg-gray-100 text-gray-900"
        }`}
      >
        <span>{machine.name}</span>
        <span className="text-[9px] font-normal ml-auto opacity-85">
          {machine.summary.total_runs} runs · {machine.summary.total_tubs} tubs · {machine.summary.take_aparts} TAs
        </span>
      </div>
      <table className="w-full border-collapse text-[11px] border border-t-0 border-gray-200 table-fixed">
        <colgroup>
          <col style={{ width: "20px" }} />
          <col />
          <col style={{ width: "22px" }} />
          <col style={{ width: "44px" }} />
          <col style={{ width: "38%" }} />
        </colgroup>
        <thead>
          <tr>
            <Th>#</Th>
            <Th>Flavor</Th>
            <Th>T</Th>
            <Th>After</Th>
            <Th>Why</Th>
          </tr>
        </thead>
        <tbody>
          {machine.runs.map((run) => (
            <RunRowGroup key={run.order} run={run} pdfVerified={pdfVerified} />
          ))}
        </tbody>
      </table>
      {machine.footer_note && (
        <div className="text-[10px] text-gray-500 px-2.5 py-2 border border-t-0 border-gray-200 rounded-b-lg bg-gray-50 leading-relaxed">
          {machine.footer_note}
        </div>
      )}
    </div>
  );
}

function RunRowGroup({
  run,
  pdfVerified,
}: {
  run: RunListOutput["machines"][number]["runs"][number];
  pdfVerified?: Set<string>;
}) {
  const isPdf = pdfVerified?.has(run.flavor.toLowerCase());
  return (
    <>
      {run.section_label && (
        <tr>
          <td
            colSpan={5}
            className="bg-gray-100 font-semibold text-[10px] text-gray-500 py-0.5 px-1.5 border-b border-gray-300"
          >
            {run.section_label}
          </td>
        </tr>
      )}
      <tr>
        <Td className="text-gray-500">{run.order}</Td>
        <Td>
          <div className="leading-snug">
            <span>{run.flavor}</span>
            {run.chain_badge && (
              <Badge className="bg-green-100 text-green-800">
                {run.chain_label || "chain"}
              </Badge>
            )}
            {run.flags.includes("nut") || run.flags.includes("peanut") ? (
              <Badge className="bg-red-100 text-red-800">nut</Badge>
            ) : null}
            {(run.flags.includes("moved") || run.flags.includes("fix")) && (
              <Badge className="bg-pink-100 text-pink-800">
                {run.flags.includes("fix") ? "fix" : "moved"}
              </Badge>
            )}
            {isPdf && <Badge className="bg-yellow-100 text-yellow-800">PDF</Badge>}
          </div>
          {run.mix_ins && (
            <div className="text-[9px] text-gray-400 leading-snug mt-0.5">{run.mix_ins}</div>
          )}
        </Td>
        <Td>{run.tubs}</Td>
        <Td>
          <span className={`font-semibold text-[10px] ${CLEAN_STYLE[run.clean_after]}`}>
            {CLEAN_LABEL[run.clean_after]}
          </span>
        </Td>
        <Td>
          <span className="text-gray-500 text-[10px] italic leading-snug">
            {run.reason}
          </span>
        </Td>
      </tr>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-1.5 py-1 font-semibold text-[9px] text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-300">
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`px-1.5 py-1 border-b border-gray-100 align-top ${className}`}>
      {children}
    </td>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span
      className={`text-[8px] font-semibold px-1 rounded-[3px] ml-1 inline-block align-middle ${className}`}
    >
      {children}
    </span>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span
        className="w-2 h-2 rounded-full inline-block"
        style={{ background: color }}
      />
      <span>{label}</span>
    </div>
  );
}

function LegendBadge({
  className,
  label,
  suffix,
}: {
  className: string;
  label: string;
  suffix: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className={`text-[8px] font-semibold px-1 rounded-[3px] ${className}`}>
        {label}
      </span>
      <span>{suffix}</span>
    </div>
  );
}
