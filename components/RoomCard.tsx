import React, { useState, useEffect } from 'react';
import { Room, RoomType, Resident } from '../types';
import { ResidentItem } from './ResidentItem';

interface RoomCardProps {
  room: Room;
  buildingId: string;
  currentMonth: string;
  onMoveResident: (resident: Resident, roomId: string) => void;
  onAddResident: (roomId: string, name: string) => void;
  onRemoveResident: (roomId: string, residentId: string) => void;
  onUpdateBill: (roomId: string, type: 'water' | 'electricity', value: number) => void;
  onDeleteRoom: (roomId: string) => void;
  onUpdateRoom?: (roomId: string, newNumber: string, newType: RoomType) => void;
}

export const RoomCard: React.FC<RoomCardProps> = ({
  room,
  buildingId,
  currentMonth,
  onMoveResident,
  onAddResident,
  onRemoveResident,
  onUpdateBill,
  onDeleteRoom,
  onUpdateRoom
}) => {
  const [isAddingResident, setIsAddingResident] = useState(false);
  const [isEditingRoom, setIsEditingRoom] = useState(false);
  const [newResidentName, setNewResidentName] = useState('');

  // Editing Room State
  const [editRoomNumber, setEditRoomNumber] = useState(room.number);
  const [editRoomType, setEditRoomType] = useState(room.type);

  // Local state for bill inputs (Debouncing/OnBlur)
  const bills = room.bills[currentMonth] || { water: 0, electricity: 0, waterUnits: 0, electricityUnits: 0 };
  const [localWaterPrice, setLocalWaterPrice] = useState(bills.water?.toString() || '');
  const [localElecPrice, setLocalElecPrice] = useState(bills.electricity?.toString() || '');

  // Sync local state when props change (e.g. from DB fetch)
  useEffect(() => {
    setLocalWaterPrice(bills.water !== undefined ? bills.water.toString() : '');
    setLocalElecPrice(bills.electricity !== undefined ? bills.electricity.toString() : '');
  }, [bills.water, bills.electricity, currentMonth]);

  const capacity = room.type === RoomType.SINGLE ? 1 : 2;
  const isFull = room.residents.length >= capacity;

  const handleConfirmAdd = () => {
    if (newResidentName.trim()) {
      onAddResident(room.id, newResidentName.trim());
      setNewResidentName('');
      setIsAddingResident(false);
    } else {
        setIsAddingResident(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        handleConfirmAdd();
    } else if (e.key === 'Escape') {
        setIsAddingResident(false);
        setNewResidentName('');
    }
  };

  const handleSaveRoomDetails = (e: React.FormEvent) => {
      e.preventDefault();
      if (onUpdateRoom && editRoomNumber.trim()) {
          onUpdateRoom(room.id, editRoomNumber, editRoomType);
          setIsEditingRoom(false);
      }
  };

  const handleBillBlur = (type: 'water' | 'electricity', valueStr: string) => {
      const val = parseFloat(valueStr);
      const currentVal = type === 'water' ? bills.water : bills.electricity;
      
      // Only update if value is valid and changed
      if (!isNaN(val) && val !== currentVal) {
          onUpdateBill(room.id, type, val);
      } else if (valueStr === '' && currentVal !== 0) {
           // Allow clearing to 0
           onUpdateBill(room.id, type, 0);
      }
  };

  const handleBillKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, type: 'water' | 'electricity', valueStr: string) => {
      if (e.key === 'Enter') {
          e.currentTarget.blur(); // Trigger blur to save
      }
  };

  const updateBillAmount = (type: 'water' | 'electricity', amount: number) => {
      const currentVal = type === 'water' ? (parseFloat(localWaterPrice) || 0) : (parseFloat(localElecPrice) || 0);
      const newVal = Math.max(0, currentVal + amount);
      
      // Update local
      if (type === 'water') setLocalWaterPrice(newVal.toString());
      else setLocalElecPrice(newVal.toString());

      // Update parent immediately for buttons
      onUpdateBill(room.id, type, newVal);
  };

  const accentColor = room.type === RoomType.SINGLE ? 'border-t-orange-400' : 'border-t-purple-400';
  const typeLabel = room.type === RoomType.SINGLE ? 'Single' : 'Double';
  const typeBadgeClass = room.type === RoomType.SINGLE 
    ? 'text-orange-600 bg-orange-50' 
    : 'text-purple-600 bg-purple-50';

  const slotsUsedByResidents = room.residents.length;
  const slotsUsedByInput = isAddingResident ? 1 : 0;
  const emptySlotsCount = Math.max(0, capacity - slotsUsedByResidents - slotsUsedByInput);

  return (
    <div
      className={`
        group relative flex flex-col bg-white rounded-lg shadow-sm border transition-all duration-200
        border-slate-200 hover:border-slate-300 hover:shadow-md
        border-t-4 ${accentColor}
        ${room.type === RoomType.DOUBLE ? 'col-span-1 md:col-span-1 xl:col-span-1' : ''} 
      `}
    >
      {/* Action Buttons (visible on hover) - HIDDEN WHEN EDITING */}
      {!isEditingRoom && (
        <div className="absolute top-1 right-1 z-30 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
            {/* Edit Button */}
            <button
                onClick={(e) => {
                e.stopPropagation();
                setEditRoomNumber(room.number);
                setEditRoomType(room.type);
                setIsEditingRoom(true);
                }}
                className="p-1.5 rounded-full bg-white shadow-sm text-slate-400 hover:text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-200"
                title="แก้ไขห้องพัก"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                    <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                </svg>
            </button>
            {/* Delete Button */}
            <button
                onClick={(e) => {
                e.stopPropagation();
                onDeleteRoom(room.id);
                }}
                className="p-1.5 rounded-full bg-white shadow-sm text-slate-300 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200"
                title="ลบห้องพัก"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
      )}

      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex justify-between items-start">
        <div>
          <span className="block text-2xl font-bold text-slate-700 leading-none">{room.number}</span>
        </div>
        <div className="flex flex-col items-end gap-1">
           <span className={`text-xs uppercase font-bold px-2 py-0.5 rounded tracking-wide ${typeBadgeClass}`}>
            {typeLabel}
          </span>
          {isFull && <span className="text-[10px] bg-slate-800 text-white px-2 py-0.5 rounded font-medium">เต็ม</span>}
        </div>
      </div>

      {/* Residents Container */}
      <div className="flex-1 px-3 pb-2 space-y-2 min-h-[100px] flex flex-col justify-start">
        {room.residents.map((res) => (
          <ResidentItem
            key={res.id}
            resident={res}
            roomId={room.id}
            buildingId={buildingId}
            onMove={(r) => onMoveResident(r, room.id)}
            onRemove={(id) => onRemoveResident(room.id, id)}
          />
        ))}

        {/* Inline Add Input */}
        {isAddingResident && (
             <div className="flex items-center gap-2.5 bg-white border border-blue-400 shadow-sm rounded px-3 py-2 animate-fade-in ring-2 ring-blue-100">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-xs text-blue-600">
                    ✎
                </div>
                <input
                    autoFocus
                    type="text"
                    className="flex-1 bg-transparent border-none focus:ring-0 p-0 text-base font-medium text-black placeholder-slate-300 outline-none w-full"
                    placeholder="พิมพ์ชื่อ..."
                    value={newResidentName}
                    onChange={(e) => setNewResidentName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={() => {
                        setTimeout(() => handleConfirmAdd(), 100);
                    }}
                />
            </div>
        )}

        {/* Empty Slots */}
        {Array.from({ length: emptySlotsCount }).map((_, idx) => (
          <div 
            key={`empty-${idx}`} 
            onClick={() => !isFull && setIsAddingResident(true)}
            className="
              h-9 rounded border border-dashed border-slate-300 bg-slate-50/50
              flex items-center justify-center gap-1
              text-sm text-slate-400 font-medium cursor-pointer 
              hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors
            "
          >
            <span>+</span> <span>ว่าง</span>
          </div>
        ))}
      </div>

      {/* Billing Section (Footer) */}
      <div className="px-3 pb-3 pt-3 border-t border-slate-100 bg-slate-50/50 rounded-b-lg">
        <div className="flex items-center gap-3">
            <div className="flex-1 group/input relative">
                <div className="flex justify-between items-center mb-1">
                    <label className="block text-[10px] text-slate-500 font-medium">ค่าน้ำ (฿)</label>
                    {bills.waterUnits ? (
                        <span className="text-[10px] text-blue-500 font-medium">{bills.waterUnits} หน่วย</span>
                    ) : null}
                </div>
                <div className="relative">
                    <input 
                        type="number" 
                        min="0"
                        placeholder="0"
                        value={localWaterPrice}
                        onChange={(e) => setLocalWaterPrice(e.target.value)}
                        onBlur={(e) => handleBillBlur('water', e.target.value)}
                        onKeyDown={(e) => handleBillKeyDown(e, 'water', localWaterPrice)}
                        className="w-full text-right text-sm border border-slate-200 rounded px-2 py-1.5 pr-6 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono bg-white text-black"
                    />
                    <div className="absolute right-0 top-0 bottom-0 w-5 flex flex-col border-l border-transparent group-hover/input:border-slate-100">
                        <button onClick={() => updateBillAmount('water', 1)} className="flex-1 flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-slate-50 rounded-tr"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" /></svg></button>
                        <button onClick={() => updateBillAmount('water', -1)} className="flex-1 flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-slate-50 rounded-br"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg></button>
                    </div>
                </div>
            </div>
            <div className="flex-1 group/input relative">
                <div className="flex justify-between items-center mb-1">
                    <label className="block text-[10px] text-slate-500 font-medium">ค่าไฟ (฿)</label>
                    {bills.electricityUnits ? (
                        <span className="text-[10px] text-amber-500 font-medium">{bills.electricityUnits} หน่วย</span>
                    ) : null}
                </div>
                <div className="relative">
                    <input 
                        type="number" 
                        min="0"
                        placeholder="0"
                        value={localElecPrice}
                        onChange={(e) => setLocalElecPrice(e.target.value)}
                        onBlur={(e) => handleBillBlur('electricity', e.target.value)}
                        onKeyDown={(e) => handleBillKeyDown(e, 'electricity', localElecPrice)}
                        className="w-full text-right text-sm border border-slate-200 rounded px-2 py-1.5 pr-6 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono bg-white text-black"
                    />
                    <div className="absolute right-0 top-0 bottom-0 w-5 flex flex-col border-l border-transparent group-hover/input:border-slate-100">
                        <button onClick={() => updateBillAmount('electricity', 1)} className="flex-1 flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-slate-50 rounded-tr"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" /></svg></button>
                        <button onClick={() => updateBillAmount('electricity', -1)} className="flex-1 flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-slate-50 rounded-br"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg></button>
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* Edit Room Overlay */}
      {isEditingRoom && (
        <div className="absolute inset-0 z-40 bg-white border-2 border-blue-100 rounded-lg flex flex-col p-4 animate-fade-in shadow-lg">
          <form onSubmit={handleSaveRoomDetails} className="w-full h-full flex flex-col">
            <h4 className="text-sm font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">แก้ไขข้อมูลห้องพัก</h4>
            
            <div className="flex-1 space-y-3">
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">เลขห้อง</label>
                    <input
                        autoFocus
                        type="text"
                        className="w-full border border-slate-300 rounded px-3 py-2 text-base focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-black"
                        value={editRoomNumber}
                        onChange={(e) => setEditRoomNumber(e.target.value)}
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">ประเภทห้อง</label>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setEditRoomType(RoomType.SINGLE)}
                            className={`flex-1 py-2 text-xs border rounded ${editRoomType === RoomType.SINGLE ? 'bg-orange-50 border-orange-300 text-orange-700 font-bold' : 'bg-white border-slate-200 text-slate-500'}`}
                        >
                            Single (1)
                        </button>
                        <button
                            type="button"
                            onClick={() => setEditRoomType(RoomType.DOUBLE)}
                            className={`flex-1 py-2 text-xs border rounded ${editRoomType === RoomType.DOUBLE ? 'bg-purple-50 border-purple-300 text-purple-700 font-bold' : 'bg-white border-slate-200 text-slate-500'}`}
                        >
                            Double (2)
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex justify-end mt-2 gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setIsEditingRoom(false)} className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded">ยกเลิก</button>
                <button type="submit" className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 shadow-sm font-medium">บันทึก</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};