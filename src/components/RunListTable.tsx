"use client";

import type { RunListOutput } from "@/lib/claude";

interface Props {
  data: RunListOutput;
}

const CLEAN_COLORS = {
  NO_CLEAN: "text-green-600",
  WATER_RINSE: "text-blue-700",
  RINSE: "text-amber-600",
  TAKE_APART: "text-red-600",
};

const CLEAN_BG = {
  NO_CLEAN: "bg-green-50",
  WATER_RINSE: "bg-blue-50",
  RINSE: "bg-amber-50",
  TAKE_APART: "bg-red-50",
};

const MACHINE_COLORS: Record<string, string> = {
  "Batch A": "bg-indigo-600",
  "Batch B": "bg-emerald-600",
  "44 QT": "bg-amber-600",
};

export default function RunListTable({ data }: Props) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 print:grid-cols-3">
        {data.machines.map((machine) => (
          <div key={machine.name} className="bg-white rounded-lg shadow overflow-hidden border">
            <div className={`${MACHINE_COLORS[machine.name] || "bg-gray-600"} px-4 py-2.5`}>
              <div className="flex items-center justify-between">
                <h3 className="text-white font-bold text-xs uppercase tracking-wide">
                  {machine.name}
                </h3>
                <span className="text-white/80 text-xs">
                  {machine.summary.total_runs} runs / {machine.summary.total_tubs} tubs
                </span>
              </div>
            </div>

            <div className="divide-y divide-gray-100">
              {machine.runs.map((run) => (
                <div key={run.order} className={`px-3 py-1.5 ${CLEAN_BG[run.clean_after]}`}>
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] text-gray-400 w-4 text-right mt-0.5 shrink-0">
                      {run.order}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-medium text-gray-900 truncate">
                          {run.flavor}
                        </span>
                        {run.chain_badge && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                            {run.chain_label || "chain"}
                          </span>
                        )}
                        {run.flags.map((flag) => (
                          <span
                            key={flag}
                            className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                              flag === "nut" || flag === "peanut"
                                ? "bg-red-100 text-red-700"
                                : flag === "moved" || flag === "fix"
                                ? "bg-pink-100 text-red-600"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {flag}
                          </span>
                        ))}
                      </div>
                      {run.mix_ins && (
                        <p className="text-[9px] text-gray-500 italic truncate">{run.mix_ins}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-gray-500">{run.tubs}t</span>
                      <p className={`text-[9px] font-semibold ${CLEAN_COLORS[run.clean_after]}`}>
                        {run.clean_after.replace("_", " ")}
                      </p>
                    </div>
                  </div>
                  {run.reason && (
                    <p className="text-[8px] text-gray-400 italic ml-6 mt-0.5">{run.reason}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="px-3 py-2 bg-gray-50 border-t text-[10px] text-gray-600 space-y-0.5">
              <div className="flex justify-between">
                <span>TAs: <strong className="text-red-600">{machine.summary.take_aparts}</strong></span>
                <span>Rinses: <strong className="text-amber-600">{machine.summary.rinses}</strong></span>
                <span>Water: <strong className="text-blue-600">{machine.summary.water_rinses}</strong></span>
                <span>No-clean: <strong className="text-green-600">{machine.summary.no_cleans}</strong></span>
              </div>
              {machine.footer_note && (
                <p className="text-gray-500 italic">{machine.footer_note}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow px-6 py-3 border">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-gray-800">Totals</span>
          <div className="flex gap-6 text-xs text-gray-600">
            <span>{data.totals.runs} runs</span>
            <span>{data.totals.tubs} tubs</span>
            <span className="text-red-600 font-medium">{data.totals.take_aparts} TAs</span>
            <span className="text-amber-600">{data.totals.rinses} rinses</span>
            <span className="text-blue-600">{data.totals.water_rinses} water</span>
            <span className="text-green-600">{data.totals.no_cleans} no-clean</span>
          </div>
        </div>
      </div>
    </div>
  );
}
