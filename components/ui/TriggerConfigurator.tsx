"use client";

import { useState } from "react";
import { Play, MousePointer2, Plus, Trash2, ArrowDown, ArrowUp, Edit2, Check, X, Gift } from "lucide-react";
import ScreencapModal from "./ScreencapModal";

export interface ActionConfig {
  type: "click" | "keyevent" | "swipe" | "text";
  x: number | null;
  y: number | null;
  keycode: string | null;
  swipe: { startX: number; startY: number; endX: number; endY: number; duration: number } | null;
  inputParams: string | null;
  delayAfter?: number; // Delay in milliseconds after this action
}

export interface RewardConfig {
  actions?: ActionConfig[];
  
  // Legacy support for older single-action configs
  type?: "click" | "keyevent" | "swipe" | "text";
  x?: number | null;
  y?: number | null;
  keycode?: string | null;
  swipe?: { startX: number; startY: number; endX: number; endY: number; duration: number } | null;
  inputParams?: string | null;
}

interface TriggerConfiguratorProps {
  giftName: string;
  config: RewardConfig;
  onChange: (newConfig: RewardConfig) => void;
  onRemove: () => void;
  onRename?: (oldName: string, newName: string) => void;
  availableSuggestions?: string[];
  testEndpoint?: string;
  testPayloadExtras?: any;
}

const defaultAction: ActionConfig = {
    type: "click", x: 500, y: 500, keycode: null, swipe: null, inputParams: null, delayAfter: 500
};

export default function TriggerConfigurator({ 
  giftName, 
  config, 
  onChange, 
  onRemove, 
  onRename, 
  availableSuggestions = [],
  testEndpoint = "/api/gift-event",
  testPayloadExtras = {}
}: TriggerConfiguratorProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [targetField, setTargetField] = useState<{index: number, type: "click" | "swipeStart" | "swipeEnd"}>({index: 0, type: "click"});
  
  // Renaming state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(giftName);

  // Migrate legacy single action to array format for UI rendering
  const actions: ActionConfig[] = config.actions || (config.type ? [{
      type: config.type,
      x: config.x ?? null,
      y: config.y ?? null,
      keycode: config.keycode ?? null,
      swipe: config.swipe ?? null,
      inputParams: config.inputParams ?? null,
      delayAfter: 500
  }] : [defaultAction]);

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch(testEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actions: actions, // Send current UI actions
          giftName,
          nickname: "Tester",
          username: "tester",
          ...testPayloadExtras
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Testing failed");
      }
    } catch (err: any) {
      alert("Test failed: " + err.message);
    } finally {
      setTesting(false);
    }
  };

  const handleCoordinateSelect = (x: number, y: number) => {
    const newActions = [...actions];
    const { index, type } = targetField;
    const action = newActions[index];

    if (type === "click") {
      newActions[index] = { ...action, x, y };
    } else if (type === "swipeStart") {
      newActions[index] = {
        ...action,
        swipe: { ...(action.swipe || { endX: 0, endY: 0, duration: 500 }), startX: x, startY: y },
      };
    } else if (type === "swipeEnd") {
      newActions[index] = {
        ...action,
        swipe: { ...(action.swipe || { startX: 0, startY: 0, duration: 500 }), endX: x, endY: y },
      };
    }
    
    onChange({ actions: newActions });
  };

  const updateAction = (index: number, newAction: ActionConfig) => {
      const newActions = [...actions];
      newActions[index] = newAction;
      onChange({ actions: newActions });
  };

  const addAction = () => {
      onChange({ actions: [...actions, {...defaultAction}] });
  };

  const removeAction = (index: number) => {
      const newActions = actions.filter((_, i) => i !== index);
      onChange({ actions: newActions });
  };

  const moveAction = (index: number, direction: -1 | 1) => {
      if (index + direction < 0 || index + direction >= actions.length) return;
      const newActions = [...actions];
      const temp = newActions[index];
      newActions[index] = newActions[index + direction];
      newActions[index + direction] = temp;
      onChange({ actions: newActions });
  };

  const handleRenameSubmit = () => {
    if (editedName.trim() && editedName !== giftName && onRename) {
      onRename(giftName, editedName.trim());
    }
    setIsEditingName(false);
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm mb-4">
      <div className="flex justify-between items-start border-b border-neutral-800 pb-4 mb-4">
        <div className="flex-1 mr-4">
          {isEditingName ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input 
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="bg-neutral-950 border border-emerald-500/50 rounded-lg px-3 py-1.5 text-sm text-white outline-none w-full max-w-[200px]"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameSubmit();
                    if (e.key === 'Escape') { setIsEditingName(false); setEditedName(giftName); }
                  }}
                />
                <button onClick={handleRenameSubmit} className="p-1.5 bg-emerald-500 text-black rounded-lg hover:bg-emerald-400 transition">
                  <Check size={14} />
                </button>
                <button onClick={() => { setIsEditingName(false); setEditedName(giftName); }} className="p-1.5 bg-neutral-800 text-neutral-400 rounded-lg hover:bg-neutral-700 transition">
                  <X size={14} />
                </button>
              </div>
              
              {availableSuggestions.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Saran Hadiah Terbaru:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {availableSuggestions.map(s => (
                      <button 
                        key={s}
                        onClick={() => setEditedName(s)}
                        className="px-2 py-0.5 bg-neutral-850 hover:bg-neutral-800 border border-neutral-700 rounded text-[10px] text-neutral-300 transition"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h3 className="text-lg font-bold text-emerald-400 capitalize">{giftName}</h3>
              <button 
                onClick={() => { setIsEditingName(true); setEditedName(giftName); }}
                className="p-1 text-neutral-600 hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition"
                title="Edit Name"
              >
                <Edit2 size={12} />
              </button>
            </div>
          )}
          <p className="text-xs text-neutral-400 mt-1">Configure ADB Actions sequence</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-3 py-1.5 rounded-lg text-sm transition"
          >
            <Play size={14} className={testing ? "animate-pulse text-emerald-400" : "text-emerald-500"} /> 
            {testing ? "Testing..." : "Test"}
          </button>
          <button 
            onClick={onRemove}
            className="text-red-400 hover:text-red-300 text-sm px-3 py-1.5 rounded-lg border border-red-900/30 hover:bg-red-400/10 transition"
          >
            Delete Trigger
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {actions.map((action, index) => (
            <div key={index} className="bg-neutral-950 border border-neutral-800/80 p-4 rounded-xl relative">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500/20 rounded-l-xl"></div>
                <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider">Action #{index + 1}</span>
                    <div className="flex gap-1">
                        <button onClick={() => moveAction(index, -1)} disabled={index === 0} className="p-1 text-neutral-500 hover:text-white disabled:opacity-30"><ArrowUp size={14}/></button>
                        <button onClick={() => moveAction(index, 1)} disabled={index === actions.length - 1} className="p-1 text-neutral-500 hover:text-white disabled:opacity-30"><ArrowDown size={14}/></button>
                        <button onClick={() => removeAction(index)} className="p-1 text-red-500/80 hover:text-red-400 ml-2"><Trash2 size={14} /></button>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                        <label className="block text-xs font-semibold text-neutral-400 mb-2 uppercase tracking-wide">Action Type</label>
                        <select 
                            value={action.type}
                            onChange={(e) => updateAction(index, { ...action, type: e.target.value as any })}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-sm text-neutral-200 focus:outline-none focus:border-emerald-500/50"
                        >
                            <option value="click">Tap (Click)</option>
                            <option value="swipe">Swipe</option>
                            <option value="keyevent">Hardware Key (Keyevent)</option>
                            <option value="text">Type Text</option>
                        </select>
                        </div>
                        
                        <div>
                        <label className="block text-xs font-semibold text-neutral-400 mb-2 uppercase tracking-wide">Delay After (ms)</label>
                        <input 
                            type="number" 
                            value={action.delayAfter ?? 500} 
                            onChange={(e) => updateAction(index, { ...action, delayAfter: Number(e.target.value) })}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-sm focus:border-emerald-500/50 outline-none" 
                        />
                        </div>
                    </div>

                    {action.type === "click" && (
                    <div className="grid grid-cols-2 gap-3 pb-2 relative bg-neutral-900/50 p-3 rounded-lg border border-neutral-800/50">
                        <div>
                        <label className="block text-xs font-medium text-neutral-400 mb-1">X Coordinate</label>
                        <input 
                            type="number" 
                            value={action.x || ""} 
                            onChange={(e) => updateAction(index, { ...action, x: Number(e.target.value) })}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-sm focus:border-emerald-500/50 outline-none" 
                        />
                        </div>
                        <div>
                        <label className="block text-xs font-medium text-neutral-400 mb-1">Y Coordinate</label>
                        <input 
                            type="number" 
                            value={action.y || ""} 
                            onChange={(e) => updateAction(index, { ...action, y: Number(e.target.value) })}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-sm focus:border-emerald-500/50 outline-none" 
                        />
                        </div>
                        <button 
                        onClick={() => { setTargetField({index, type: "click"}); setModalOpen(true); }}
                        className="absolute -bottom-4 right-2 text-xs flex items-center gap-1 bg-black/50 px-2 py-1 rounded text-emerald-400 hover:text-emerald-300 border border-emerald-900/30"
                        >
                        <MousePointer2 size={12} /> Pick from Screen
                        </button>
                    </div>
                    )}

                    {action.type === "swipe" && (
                    <div className="space-y-4 pb-4">
                        <div className="grid grid-cols-2 gap-3 relative bg-neutral-900/50 p-3 rounded-lg border border-neutral-800/50">
                        <div>
                            <label className="block text-xs font-medium text-neutral-400 mb-1">Start X</label>
                            <input 
                            type="number" value={action.swipe?.startX || ""} 
                            onChange={(e) => updateAction(index, { ...action, swipe: { ...action.swipe as any, startX: Number(e.target.value) } })}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-sm outline-none" 
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-neutral-400 mb-1">Start Y</label>
                            <input 
                            type="number" value={action.swipe?.startY || ""} 
                            onChange={(e) => updateAction(index, { ...action, swipe: { ...action.swipe as any, startY: Number(e.target.value) } })}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-sm outline-none" 
                            />
                        </div>
                        <button 
                            onClick={() => { setTargetField({index, type: "swipeStart"}); setModalOpen(true); }}
                            className="absolute -bottom-3 right-2 text-xs flex items-center gap-1 bg-black/50 px-2 py-1 rounded text-emerald-400 border border-emerald-900/30"
                        >
                            <MousePointer2 size={12} /> Pick Start
                        </button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 relative bg-neutral-900/50 p-3 rounded-lg border border-neutral-800/50 mt-2">
                        <div>
                            <label className="block text-xs font-medium text-neutral-400 mb-1">End X</label>
                            <input 
                            type="number" value={action.swipe?.endX || ""} 
                            onChange={(e) => updateAction(index, { ...action, swipe: { ...action.swipe as any, endX: Number(e.target.value) } })}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-sm outline-none" 
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-neutral-400 mb-1">End Y</label>
                            <input 
                            type="number" value={action.swipe?.endY || ""} 
                            onChange={(e) => updateAction(index, { ...action, swipe: { ...action.swipe as any, endY: Number(e.target.value) } })}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-sm outline-none" 
                            />
                        </div>
                        <button 
                            onClick={() => { setTargetField({index, type: "swipeEnd"}); setModalOpen(true); }}
                            className="absolute -bottom-3 right-2 text-xs flex items-center gap-1 bg-black/50 px-2 py-1 rounded text-emerald-400 border border-emerald-900/30"
                        >
                            <MousePointer2 size={12} /> Pick End
                        </button>
                        </div>
                    </div>
                    )}

                    {action.type === "keyevent" && (
                    <div className="bg-neutral-900/50 p-3 rounded-lg border border-neutral-800/50">
                        <label className="block text-xs font-medium text-neutral-400 mb-1">Keycode (e.g., KEYCODE_HOME)</label>
                        <input 
                        type="text" 
                        value={action.keycode || ""} 
                        onChange={(e) => updateAction(index, { ...action, keycode: e.target.value })}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-sm focus:border-emerald-500/50 outline-none" 
                        placeholder="KEYCODE_HOME, 3, 4, 82..."
                        />
                    </div>
                    )}

                    {action.type === "text" && (
                    <div className="bg-neutral-900/50 p-3 rounded-lg border border-neutral-800/50">
                        <label className="block text-xs font-medium text-neutral-400 mb-1">Text String</label>
                        <input 
                        type="text" 
                        value={action.inputParams || ""} 
                        onChange={(e) => updateAction(index, { ...action, inputParams: e.target.value })}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-sm focus:border-emerald-500/50 outline-none" 
                        placeholder="Text to type..."
                        />
                    </div>
                    )}
                </div>
            </div>
        ))}

        <button 
            onClick={addAction}
            className="w-full py-3 border border-dashed border-emerald-900/50 rounded-xl text-emerald-500 font-semibold text-sm hover:bg-emerald-900/10 hover:border-emerald-500/50 transition flex items-center justify-center gap-2"
        >
            <Plus size={16} /> Add Another Action
        </button>

      </div>

      <ScreencapModal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        onSelectCoordinate={handleCoordinateSelect} 
      />
    </div>
  );
}
