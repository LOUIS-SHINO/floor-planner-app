import { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Text, Group, Line } from 'react-konva';
import { Move, SquareSquare, Ruler, Trash2, Edit2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Custom Image Hook
function useImage(url: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'Anonymous';
    img.src = url;
    img.onload = () => setImage(img);
  }, [url]);
  return image;
}

// Types
type Mode = 'pan' | 'draw' | 'measure';
type Floor = '3F' | '4F' | '5F';
interface Zone {
  id: string;
  floor: Floor;
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  color?: string;
}

const CYBER_COLORS = [
  "#00E5FF", // Cyan
  "#9D4EDD", // Purple
  "#FF003C", // Cyber Red
  "#39FF14", // Neon Green
  "#FCEE09", // Cyber Yellow
  "#FF7B00", // Neon Orange
  "#00FFA3", // Mint
];

const getNextColor = (currentZones: Zone[]) => {
  const colorCounts = new Map<string, number>();
  CYBER_COLORS.forEach(c => colorCounts.set(c, 0));
  currentZones.forEach(z => {
    if (z.color && colorCounts.has(z.color)) {
      colorCounts.set(z.color, colorCounts.get(z.color)! + 1);
    }
  });
  let minCount = Infinity;
  let chosenColor = CYBER_COLORS[0];
  for (const [color, count] of colorCounts.entries()) {
    if (count < minCount) {
      minCount = count;
      chosenColor = color;
    }
  }
  return chosenColor;
};

export default function App() {
  const [floor, setFloor] = useState<Floor>('4F');
  const [mode, setMode] = useState<Mode>('pan');
  const [zones, setZones] = useState<Zone[]>([]);
  const [newZone, setNewZone] = useState<Partial<Zone> | null>(null);
  const [pixelsPerMeter, setPixelsPerMeter] = useState<number>(113.4); // Automatically calculated A3 at 1:100 scale (1m = 1cm on paper = 113.4px)
  
  // Measure state
  const [measureLine, setMeasureLine] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);
  const [measureStep, setMeasureStep] = useState<0 | 1>(0);

  useEffect(() => {
    setMeasureStep(0);
  }, [mode]);

  // Stage state
  const [stageScale, setStageScale] = useState(0.25);
  const [stagePos, setStagePos] = useState({ x: 50, y: 50 });
  
  // Hover & Edit state
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  
  const stageRef = useRef<any>(null);

  // Load bg image
  const bgImg = useImage(`/${floor}_HighRes.png`);

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.05;
    const stage = e.target.getStage();
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    setStageScale(newScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  const getRelativePointerPosition = (node: any) => {
    const transform = node.getAbsoluteTransform().copy();
    transform.invert();
    const pos = node.getStage().getPointerPosition();
    return transform.point(pos);
  };

  const handleMouseDown = (e: any) => {
    if (mode === 'pan') return;
    const stage = e.target.getStage();
    const pos = getRelativePointerPosition(stage);
    
    if (mode === 'draw') {
      setNewZone({
        id: Date.now().toString(),
        floor,
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        name: `新區塊 ${zones.length + 1}`,
        color: getNextColor(zones.filter(z => z.floor === floor))
      });
    } else if (mode === 'measure') {
      setMeasureStep(1);
      setMeasureLine({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
    }
  };

  const handleMouseMove = (e: any) => {
    if (mode === 'pan') return;
    const stage = e.target.getStage();
    const pos = getRelativePointerPosition(stage);

    if (mode === 'draw' && newZone) {
      setNewZone({
        ...newZone,
        width: pos.x - (newZone.x || 0),
        height: pos.y - (newZone.y || 0),
      });
    } else if (mode === 'measure' && measureStep === 1 && measureLine) {
      setMeasureLine({ ...measureLine, x2: pos.x, y2: pos.y });
    }
  };

  const handleMouseUp = () => {
    if (mode === 'draw' && newZone) {
      if (Math.abs(newZone.width || 0) > 10 && Math.abs(newZone.height || 0) > 10) {
        // Normalize rect (width/height > 0)
        let finalX = newZone.x!;
        let finalY = newZone.y!;
        let finalW = newZone.width!;
        let finalH = newZone.height!;
        if (finalW < 0) { finalX += finalW; finalW = Math.abs(finalW); }
        if (finalH < 0) { finalY += finalH; finalH = Math.abs(finalH); }
        
        setZones([...zones, { ...newZone, x: finalX, y: finalY, width: finalW, height: finalH } as Zone]);
      }
      setNewZone(null);
    } else if (mode === 'measure' && measureStep === 1 && measureLine) {
      setMeasureStep(0);
      const dist = Math.sqrt(Math.pow(measureLine.x2 - measureLine.x1, 2) + Math.pow(measureLine.y2 - measureLine.y1, 2));
      if (dist < 10) {
        setMeasureLine(null); // Clear line if it was just a click
      }
    }
  };

  const activeZones = (z: Zone) => z.floor === floor;

  return (
    <div className="flex h-screen w-screen bg-[#111] overflow-hidden text-white font-sans">
      
      {/* Side Panel */}
      <div className="w-80 h-full bg-[#1A1F2E] border-r border-[#00E5FF]/20 flex flex-col z-10 shadow-[4px_0_24px_rgba(0,0,0,0.5)]">
        <div className="p-6 border-b border-[#00E5FF]/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37]/10 blur-[50px] pointer-events-none rounded-full" />
          <h1 className="text-3xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#D4AF37] to-[#FFFBEB] uppercase mb-2 drop-shadow-[0_2px_10px_rgba(212,175,55,0.4)]">
            SHINO MASTER PLAN
          </h1>
          <p className="text-sm text-gray-400 tracking-wider">南女校平面空間規劃介面</p>
        </div>

        {/* Tools Panel */}
        <div className="p-6 flex flex-col gap-4 border-b border-[#00E5FF]/20">
          <div className="flex bg-[#2B3142] rounded-lg p-1">
            <button
              onClick={() => setFloor('3F')}
              className={cn("flex-1 py-1.5 text-sm font-bold rounded-md transition-all tracking-widest", floor === '3F' ? "bg-[#00E5FF]/20 text-[#00E5FF] shadow-[0_0_10px_rgba(0,229,255,0.2)]" : "text-gray-400 hover:text-white")}
            >
              3F 視圖
            </button>
            <button
              onClick={() => setFloor('4F')}
              className={cn("flex-1 py-1.5 text-sm font-bold rounded-md transition-all tracking-widest", floor === '4F' ? "bg-[#00E5FF]/20 text-[#00E5FF] shadow-[0_0_10px_rgba(0,229,255,0.2)]" : "text-gray-400 hover:text-white")}
            >
              4F 視圖
            </button>
            <button
              onClick={() => setFloor('5F')}
              className={cn("flex-1 py-1.5 text-sm font-bold rounded-md transition-all tracking-widest", floor === '5F' ? "bg-[#00E5FF]/20 text-[#00E5FF] shadow-[0_0_10px_rgba(0,229,255,0.2)]" : "text-gray-400 hover:text-white")}
            >
              5F 視圖
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => setMode('pan')} className={cn("flex flex-col items-center gap-2 p-3 rounded-xl border transition-all", mode === 'pan' ? "border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]" : "border-transparent bg-[#2B3142] text-gray-400 hover:bg-[#2B3142]/80")}>
              <Move size={20} /> <span className="text-[10px] tracking-widest">拖曳</span>
            </button>
            <button onClick={() => setMode('draw')} className={cn("flex flex-col items-center gap-2 p-3 rounded-xl border transition-all", mode === 'draw' ? "border-[#00E5FF] bg-[#00E5FF]/10 text-[#00E5FF]" : "border-transparent bg-[#2B3142] text-gray-400 hover:bg-[#2B3142]/80")}>
              <SquareSquare size={20} /> <span className="text-[10px] tracking-widest">空間圈劃</span>
            </button>
            <button onClick={() => setMode('measure')} className={cn("flex flex-col items-center gap-2 p-3 rounded-xl border transition-all", mode === 'measure' ? "border-[#9D4EDD] bg-[#9D4EDD]/10 text-[#E0AAFF]" : "border-transparent bg-[#2B3142] text-gray-400 hover:bg-[#2B3142]/80")}>
              <Ruler size={20} /> <span className="text-[10px] tracking-widest">長度預估</span>
            </button>
          </div>
        </div>

        {/* Zones List */}
        <div className="flex-1 overflow-y-auto p-4 custom-scroll">
          <h2 className="text-xs text-gray-500 font-bold mb-4 tracking-widest">空間陣列 [{floor}]</h2>
          <div className="flex flex-col gap-3">
            {zones.filter(activeZones).map(z => (
              <div key={z.id} className="bg-[#2B3142]/60 rounded-lg p-3 border border-white/5 hover:border-[#00E5FF]/30 transition-all flex flex-col group" style={{ borderColor: z.color ? z.color + '40' : undefined }}>
                <div className="flex justify-between items-center mb-2">
                  <input 
                    type="color" 
                    value={z.color || "#00E5FF"}
                    onChange={(e) => {
                      const newColor = e.target.value;
                      setZones(zones.map(x => x.id === z.id ? { ...x, color: newColor } : x));
                    }}
                    className="w-4 h-4 rounded cursor-pointer border-0 p-0 bg-transparent shrink-0 mr-2"
                  />
                  {editingZoneId === z.id ? (
                    <input 
                      autoFocus
                      className="bg-black/50 text-[#D4AF37] border border-[#D4AF37]/50 rounded px-2 py-1 text-sm outline-none w-32"
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onBlur={() => {
                        setZones(zones.map(x => x.id === z.id ? { ...x, name: editingName } : x));
                        setEditingZoneId(null);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          setZones(zones.map(x => x.id === z.id ? { ...x, name: editingName } : x));
                          setEditingZoneId(null);
                        }
                      }}
                    />
                  ) : (
                    <span 
                      className="font-bold text-[#D4AF37] tracking-wider cursor-pointer"
                      onClick={() => { setEditingName(z.name); setEditingZoneId(z.id); }}
                    >
                      {z.name} <Edit2 size={12} className="inline opacity-0 group-hover:opacity-100 mb-1"/>
                    </span>
                  )}
                  <button onClick={() => setZones(zones.filter(x => x.id !== z.id))} className="text-gray-500 hover:text-[#FF5252]">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>W: {(z.width / pixelsPerMeter).toFixed(1)}m</span>
                  <span>L: {(z.height / pixelsPerMeter).toFixed(1)}m</span>
                  <span className="text-[#00E5FF] font-bold">{( (z.width / pixelsPerMeter) * (z.height / pixelsPerMeter) ).toFixed(2)} m²</span>
                </div>
              </div>
            ))}
            {zones.filter(activeZones).length === 0 && (
              <div className="text-center text-gray-600 text-sm py-8">無空間數據</div>
            )}
          </div>
        </div>
        
        {/* Status bar */}
        <div className="p-4 bg-black/40 text-[10px] text-gray-500 flex justify-between border-t border-white/5">
          <div className="flex items-center gap-2">
            <span>現行比例: 1m = </span>
            <input 
              type="number" 
              className="w-12 bg-transparent text-[#00E5FF] border-b border-[#00E5FF]/50 outline-none text-center" 
              value={pixelsPerMeter} 
              onChange={e => setPixelsPerMeter(Number(e.target.value) || 50)} 
            />
            <span>px</span>
          </div>
          <span>區域總計: {zones.filter(activeZones).length}</span>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative cursor-crosshair">
        <Stage
          ref={stageRef}
          width={window.innerWidth - 320}
          height={window.innerHeight}
          onWheel={handleWheel}
          draggable={mode === 'pan'}
          scaleX={stageScale}
          scaleY={stageScale}
          x={stagePos.x}
          y={stagePos.y}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <Layer>
            {bgImg && <KonvaImage image={bgImg} />}

            {/* Render Saved Zones */}
            {zones.filter(activeZones).map(z => {
              const widthM = (z.width / pixelsPerMeter).toFixed(1);
              const heightM = (z.height / pixelsPerMeter).toFixed(1);
              return (
                <Group key={z.id} x={z.x} y={z.y}>
                  <Rect
                    width={z.width}
                    height={z.height}
                    fill={(z.color || "#00E5FF") + "26"} // roughly 0.15 opacity in hex
                    stroke={z.color || "#00E5FF"}
                    strokeWidth={2 / stageScale}
                    shadowColor={z.color || "#00E5FF"}
                    shadowBlur={10 / stageScale}
                  />
                  {/* Name Label */}
                  <Rect 
                    x={0} y={-24 / stageScale}
                    width={z.width} height={24 / stageScale}
                    fill="rgba(0,0,0,0.6)"
                  />
                  <Text
                    x={4 / stageScale} y={-18 / stageScale}
                    text={`${z.name} (${widthM}m x ${heightM}m)`}
                    fill={z.color || "#D4AF37"}
                    fontSize={14 / stageScale}
                    fontFamily="sans-serif"
                    fontStyle="bold"
                  />
                </Group>
              );
            })}

            {/* Render Rect in Progress */}
            {newZone && (() => {
              let nx = newZone.x!;
              let ny = newZone.y!;
              let nw = newZone.width || 0;
              let nh = newZone.height || 0;
              if (nw < 0) { nx += nw; nw = Math.abs(nw); }
              if (nh < 0) { ny += nh; nh = Math.abs(nh); }
              const widthM = (nw / pixelsPerMeter).toFixed(1);
              const heightM = (nh / pixelsPerMeter).toFixed(1);

              return (
                <Group x={nx} y={ny}>
                  <Rect
                    width={nw}
                    height={nh}
                    stroke={newZone.color || "#00E5FF"}
                    strokeWidth={2 / stageScale}
                    dash={[5 / stageScale, 5 / stageScale]}
                    fill={(newZone.color || "#00E5FF") + "1A"} // roughly 0.1 opacity
                  />
                  {nw > 20 && nh > 20 && (
                    <>
                      <Rect 
                        x={0} y={-24 / stageScale}
                        width={nw} height={24 / stageScale}
                        fill="rgba(0,0,0,0.6)"
                      />
                      <Text
                        x={4 / stageScale} y={-18 / stageScale}
                        text={`圈劃中... (${widthM}m x ${heightM}m)`}
                        fill={newZone.color || "#00E5FF"}
                        fontSize={14 / stageScale}
                        fontFamily="sans-serif"
                        fontStyle="bold"
                      />
                    </>
                  )}
                </Group>
              );
            })()}

            {/* Render Measure Line */}
            {measureLine && (
              <Group>
                <Line
                  points={[measureLine.x1, measureLine.y1, measureLine.x2, measureLine.y2]}
                  stroke="#9D4EDD"
                  strokeWidth={2 / stageScale}
                  dash={[5 / stageScale, 5 / stageScale]}
                />
                <Text
                  x={(measureLine.x1 + measureLine.x2) / 2}
                  y={(measureLine.y1 + measureLine.y2) / 2 - 24 / stageScale}
                  text={`${(Math.sqrt(Math.pow(measureLine.x2 - measureLine.x1, 2) + Math.pow(measureLine.y2 - measureLine.y1, 2)) / pixelsPerMeter).toFixed(2)} m`}
                  fill="#FFFBEB"
                  fontSize={20 / stageScale}
                  fontFamily="sans-serif"
                  fontStyle="bold"
                  align="center"
                  shadowColor="#9D4EDD"
                  shadowBlur={10 / stageScale}
                />
              </Group>
            )}
          </Layer>
        </Stage>
      </div>

    </div>
  );
}
