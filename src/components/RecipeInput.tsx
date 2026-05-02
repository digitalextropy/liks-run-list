"use client";

interface Props {
  index: number;
  name: string;
  tubs: number;
  onNameChange: (value: string) => void;
  onTubsChange: (value: number) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export default function RecipeInput({ index, name, tubs, onNameChange, onTubsChange, onRemove, canRemove }: Props) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-400 w-6 text-right">{index + 1}.</span>
      <input
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="Recipe name (e.g., Moose Tracks)"
        className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <input
        type="number"
        value={tubs}
        onChange={(e) => onTubsChange(parseInt(e.target.value) || 0)}
        min={1}
        max={99}
        className="w-16 px-2 py-2 border border-gray-300 rounded-md text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <span className="text-xs text-gray-400">tubs</span>
      {canRemove && (
        <button
          onClick={onRemove}
          className="text-gray-400 hover:text-red-500 transition-colors text-lg leading-none"
        >
          &times;
        </button>
      )}
    </div>
  );
}
