"use client";

import type { RunListOutput } from "@/lib/claude";

interface Props {
  data: RunListOutput;
}

const CLEAN_COLORS = {
  NO_CLEAN: "text-green-700 bg-green-50",
  WATER_RINSE: "text-blue-700 bg-blue-50",
  RINSE: "text-amber-700 bg-amber-50",
  TAKE_APART: "text-red-700 bg-red-50",
};

const CLEAN_LABELS = {
  NO_CLEAN: "No Clean",
  WATER_RINSE: "Water Rinse",
  RINSE: "Rinse",
  TAKE_APART: "Take Apart",
};

const MACHINE_COLORS: Record<string, string> = {
  "Batch A": "bg-indigo-700",
  "Batch B": "bg-emerald-700",
  "44 QT": "bg-amber-700",
};

export default function RunListTable({ data }: Props) {
  const machineCount = data.machines.length;
  const gridCols =
    machineCount === 1
      ? "grid-cols-1"
      : machineCount === 2
      ? "grid-cols-1 lg:grid-cols-2"
      : "grid-cols-1 lg:grid-cols-3";

  return (
    <div className="space-y-4 print:space-y-2">
      <div className={`grid ${gridCols} gap-4 print:gap-2`}>
        {data.machines.map((machine) => (
          <div
            key={machine.name}
            className="bg-white rounded-lg shadow-sm overflow-hidden border print:break-inside-avoid"
          >
            <div className={`${MACHINE_COLORS[machine.name] || "bg-gray-700"} px-4 py-3`}>
              <div className="flex items-baseline justify-between">
                <h3 className="text-white font-bold text-base uppercase tracking-wide">
                  {machine.name}
                </h3>
                <span className="text-white/90 text-xs font-medium">
                  {machine.summary.total_runs} runs · {machine.summary.total_tubs} tubs
                </span>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500 border-b">
                <tr>
                  <th className="px-2 py-1.5 text-right w-8">#</th>
                  <th className="px-2 py-1.5 text-left">Flavor</th>
                  <th className="px-2 py-1.5 text-right w-12">Tubs</th>
                  <th className="px-2 py-1.5 text-left w-32">After</th>
                </tr>
              </thead>
              <tbody>
                {machine.runs.map((run, i) => (
                  <tr
                    key={run.order}
                    className={`border-b border-gray-100 last:border-0 ${
                      i % 2 === 1 ? "bg-gray-50/40" : ""
                    }`}
                  >
                    <td className="px-2 py-2 text-right text-gray-400 text-xs align-top">
                      {run.order}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-gray-900 text-[13px]">
                          {run.flavor}
                        </span>
                        {run.chain_badge && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-semibold">
                            {run.chain_label || "chain"}
                          </span>
                        )}
                        {run.flags.map((flag) => (
                          <span
                            key={flag}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                              flag === "nut" || flag === "peanut"
                                ? "bg-red-100 text-red-700"
                                : flag === "moved" || flag === "fix"
                                ? "bg-pink-100 text-pink-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {flag}
                          </span>
                        ))}
                      </div>
                      {run.mix_ins && (
                        <p className="text-[10px] text-gray-500 italic mt-0.5">
                          {run.mix_ins}
                        </p>
                      )}
                      {run.reason && (
                        <p className="text-[10px] text-gray-400 mt-0.5">{run.reason}</p>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right text-gray-700 align-top tabular-nums">
                      {run.tubs}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${CLEAN_COLORS[run.clean_after]}`}
                      >
                        {CLEAN_LABELS[run.clean_after]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="px-3 py-2.5 bg-gray-50 border-t text-[11px] text-gray-700">
              <div className="grid grid-cols-4 gap-1 text-center">
                <Stat label="TAs" value={machine.summary.take_aparts} color="text-red-600" />
                <Stat
                  label="Rinses"
                  value={machine.summary.rinses}
                  color="text-amber-600"
                />
                <Stat
                  label="Water"
                  value={machine.summary.water_rinses}
                  color="text-blue-600"
                />
                <Stat
                  label="No-clean"
                  value={machine.summary.no_cleans}
                  color="text-green-600"
                />
              </div>
              {machine.footer_note && (
                <p className="text-gray-500 italic text-[10px] mt-2 text-center">
                  {machine.footer_note}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-sm border px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
            Day Total
          </h3>
          <div className="flex gap-6 text-sm tabular-nums">
            <Total label="Runs" value={data.totals.runs} />
            <Total label="Tubs" value={data.totals.tubs} />
            <Total label="TAs" value={data.totals.take_aparts} color="text-red-600" />
            <Total
              label="Rinses"
              value={data.totals.rinses}
              color="text-amber-600"
            />
            <Total
              label="Water"
              value={data.totals.water_rinses}
              color="text-blue-600"
            />
            <Total
              label="No-clean"
              value={data.totals.no_cleans}
              color="text-green-600"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div>
      <p className={`font-bold text-base ${color}`}>{value}</p>
      <p className="text-[9px] uppercase tracking-wider text-gray-500">{label}</p>
    </div>
  );
}

function Total({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className={`font-bold text-lg ${color || "text-gray-900"} tabular-nums`}
      >
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-gray-500">
        {label}
      </span>
    </div>
  );
}
