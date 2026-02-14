import React, { useState, useEffect, useMemo } from 'react';
import { Building, RoomType, Resident, Floor, BillData, User, UserRole } from './types';
import { RoomCard } from './components/RoomCard';
import { WaterMeterCard } from './components/WaterMeterCard';
import { ElectricityMeterCard } from './components/ElectricityMeterCard';
import { UserManagement } from './components/UserManagement';
import { ResidentManagement } from './components/ResidentManagement';
// Change Import from Google Sheets to Supabase
import { saveDataToSupabase, fetchDataFromSupabase } from './services/supabaseService';

// --- Constants ---
const WATER_UNIT_PRICE = 18; // Price per unit for water
const ELECTRICITY_UNIT_PRICE = 7; // Price per unit for electricity

const INITIAL_USERS: User[] = [
    { id: 'admin-popa', username: 'popa', password: 'popa', role: 'ADMIN', name: 'ผู้ดูแลระบบสูงสุด' }
];

// --- Helper for Date ---
const getCurrentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// --- Initial Helper (Fallback Mock) ---
const createInitialBuildings = (): Building[] => {
  // This is used ONLY if fetch fails completely (Network Error)
  const buildings: Building[] = [];
  for (let b = 1; b <= 2; b++) {
    const floors: Floor[] = [];
    for (let f = 4; f >= 1; f--) {
      const rooms: any[] = [];
      for (let r = 1; r <= 4; r++) {
        const roomSuffix = r.toString().padStart(2, '0');
        const roomNum = `${b}${f}${roomSuffix}`; 
        const type = r > 2 ? RoomType.DOUBLE : RoomType.SINGLE;
        rooms.push({
          id: `b${b}-f${f}-r${r}`,
          number: roomNum,
          type,
          residents: [],
          bills: {}
        });
      }
      floors.push({ id: `b${b}-f${f}`, number: f, rooms });
    }
    buildings.push({ id: `b${b}`, name: `อาคาร ${b}`, floors });
  }
  return buildings;
};

const App: React.FC = () => {
  // --- Auth State ---
  const [user, setUser] = useState<User | null>(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  
  // Store Users
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);

  // --- App State ---
  const [isLoading, setIsLoading] = useState(true); 
  const [isOfflineMode, setIsOfflineMode] = useState(false); // New state to track data source
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [activeBuildingId, setActiveBuildingId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'water-meter' | 'electricity-meter' | 'analytics' | 'users' | 'residents'>('dashboard');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Editing States
  const [editingBuildingId, setEditingBuildingId] = useState<string | null>(null);
  const [tempBuildingName, setTempBuildingName] = useState("");
  const [editingFloorId, setEditingFloorId] = useState<string | null>(null);
  const [tempFloorName, setTempFloorName] = useState("");

  // Move Resident Modal State
  const [moveModal, setMoveModal] = useState<{
      isOpen: boolean;
      residentId: string;
      residentName: string;
      sourceRoomId: string;
      sourceBuildingId: string;
  } | null>(null);

  const [targetBuildingId, setTargetBuildingId] = useState<string>('');
  const [targetFloorId, setTargetFloorId] = useState<string>('');
  const [targetRoomId, setTargetRoomId] = useState<string>('');

  // State for Billing
  const [currentMonth, setCurrentMonth] = useState<string>(getCurrentMonth());

  const activeBuilding = buildings.find(b => b.id === activeBuildingId);

  // --- Data Fetching Effect ---
  useEffect(() => {
    const initData = async () => {
        setIsLoading(true);
        try {
            // Change function call to Supabase
            const data = await fetchDataFromSupabase();
            
            if (data) {
                console.log("Successfully fetched data from Supabase");
                setIsOfflineMode(false); // Data from Cloud

                // 1. Users
                if (data.Users && data.Users.length > 0) {
                    setUsers(data.Users);
                }

                // 2. Buildings Structure
                const rawBuildings = data.Buildings || [];
                // If buildings array exists (even if empty), we rely on it.
                
                const rawFloors = data.Floors || [];
                const rawRooms = data.Rooms || [];
                const rawResidents = data.Residents || [];
                const rawBills = data.Bills || [];

                const newBuildings: Building[] = rawBuildings.map((b: any) => {
                    // Find floors for this building (Convert IDs to String to match safely)
                    const bFloors = rawFloors.filter((f: any) => String(f.buildingId) === String(b.id));
                    // Sort floors desc (usually) or by number
                    bFloors.sort((a: any, b: any) => b.number - a.number);

                    const floors: Floor[] = bFloors.map((f: any) => {
                        // Find rooms for this floor
                        const fRooms = rawRooms.filter((r: any) => String(r.floorId) === String(f.id));
                        // Sort rooms
                        fRooms.sort((a: any, b: any) => String(a.number).localeCompare(String(b.number)));

                        const rooms = fRooms.map((r: any) => {
                            // Find residents
                            const rResidents = rawResidents.filter((res: any) => String(res.roomId) === String(r.id));
                            
                            // Find bills and convert array to Record<string, BillData>
                            const rBillsArr = rawBills.filter((bill: any) => String(bill.roomId) === String(r.id));
                            const bills: Record<string, BillData> = {};
                            rBillsArr.forEach((bill: any) => {
                                if(bill.month) {
                                    bills[bill.month] = {
                                        water: Number(bill.waterPrice || 0),
                                        electricity: Number(bill.electricityPrice || 0),
                                        waterUnits: Number(bill.waterUnits || 0),
                                        electricityUnits: Number(bill.electricityUnits || 0)
                                    };
                                }
                            });

                            return {
                                id: String(r.id),
                                number: String(r.number),
                                type: r.type as RoomType,
                                residents: rResidents.map((res: any) => ({ id: String(res.id), name: res.name })),
                                bills: bills
                            };
                        });

                        return {
                            id: String(f.id),
                            number: Number(f.number),
                            name: f.name,
                            rooms: rooms
                        };
                    });

                    return {
                        id: String(b.id),
                        name: b.name,
                        floors: floors
                    };
                });

                setBuildings(newBuildings);
                if (newBuildings.length > 0) {
                    setActiveBuildingId(String(newBuildings[0].id));
                } else {
                    // If DB returns empty buildings list, we show empty state, NOT mock data.
                    setActiveBuildingId('');
                }

            } else {
                throw new Error("Fetch returned null");
            }
        } catch (err) {
            console.error("Critical Error fetching data, falling back to mock:", err);
            setIsOfflineMode(true); // Data from Mock/Fallback
            const initial = createInitialBuildings();
            setBuildings(initial);
            setActiveBuildingId(initial[0].id);
        } finally {
            setIsLoading(false);
        }
    };

    initData();
  }, []);

  // Ensure active building exists, otherwise fallback
  useEffect(() => {
    if (!activeBuilding && buildings.length > 0 && !isLoading) {
        setActiveBuildingId(buildings[0].id);
    }
  }, [activeBuilding, buildings, isLoading]);

  // Set default targets when modal opens
  useEffect(() => {
    if (moveModal?.isOpen) {
        setTargetBuildingId(moveModal.sourceBuildingId);
        // Default to same floor if possible
        const b = buildings.find(b => b.id === moveModal.sourceBuildingId);
        const f = b?.floors.find(f => f.rooms.some(r => r.id === moveModal.sourceRoomId));
        setTargetFloorId(f ? f.id : '');
        setTargetRoomId('');
    }
  }, [moveModal?.isOpen, moveModal, buildings]);

  // --- Seed Data Function ---
  const handleSeedDatabase = async () => {
    if (!window.confirm("⚠️ ยืนยันการสร้างข้อมูลเริ่มต้น?\n\nการกระทำนี้จะเพิ่ม อาคาร, ห้องพัก และผู้ใช้งานตัวอย่าง ลงในฐานข้อมูล Supabase ของคุณ")) return;
    
    setIsLoading(true);
    try {
        const initialBuildings = createInitialBuildings();

        // 1. Seed Users (Popa)
        for (const u of INITIAL_USERS) {
            await saveDataToSupabase('Users', 'ADD', u);
        }

        // 2. Seed Buildings Structure
        for (const b of initialBuildings) {
            await saveDataToSupabase('Buildings', 'ADD', { id: b.id, name: b.name });
            for (const f of b.floors) {
                await saveDataToSupabase('Floors', 'ADD', { id: f.id, number: f.number, buildingId: b.id, name: f.name });
                for (const r of f.rooms) {
                    await saveDataToSupabase('Rooms', 'ADD', { id: r.id, number: r.number, type: r.type, floorId: f.id });
                }
            }
        }
        
        alert("✅ สร้างข้อมูลเริ่มต้นเรียบร้อยแล้ว!\nระบบจะรีเฟรชหน้าจอเพื่อโหลดข้อมูลใหม่");
        window.location.reload();
    } catch (e) {
        console.error("Seeding Error:", e);
        alert("เกิดข้อผิดพลาดในการสร้างข้อมูล");
        setIsLoading(false);
    }
  };

  // --- Login Logic ---
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const foundUser = users.find(u => u.username === loginUsername && u.password === loginPassword);

    if (foundUser) {
        setUser(foundUser);
        // Redirect to appropriate tab based on role
        if (foundUser.role === 'WATER') setActiveTab('water-meter');
        else if (foundUser.role === 'ELECTRIC') setActiveTab('electricity-meter');
        else setActiveTab('dashboard');
    } else {
        setLoginError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setLoginUsername('');
    setLoginPassword('');
    setLoginError('');
  };

  // --- User Management Logic ---
  const handleAddUser = (newUser: Omit<User, 'id'>) => {
      const userWithId = { ...newUser, id: Date.now().toString() };
      setUsers(prev => [...prev, userWithId]);
      saveDataToSupabase('Users', 'ADD', userWithId);
  };

  const handleUpdateUser = (updatedUser: User) => {
      setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
      saveDataToSupabase('Users', 'ADD', updatedUser); // Using ADD as Upsert
  };

  const handleDeleteUser = (id: string) => {
      setUsers(prev => prev.filter(u => u.id !== id));
      saveDataToSupabase('Users', 'DELETE', { id });
  };

  // --- Global Resident Logic (for ResidentManagement) ---
  const handleGlobalAddResident = (roomId: string, name: string) => {
    setBuildings(prev => {
      const newBuildings = JSON.parse(JSON.stringify(prev));
      // Find the room anywhere in the buildings
      for (const b of newBuildings) {
        for (const f of b.floors) {
          const r = f.rooms.find((rm: any) => rm.id === roomId);
          if (r) {
             const capacity = r.type === RoomType.SINGLE ? 1 : 2;
             if (r.residents.length < capacity) {
               const newResident = { id: Date.now().toString() + Math.random(), name };
               r.residents.push(newResident);
               saveDataToSupabase('Residents', 'ADD', { ...newResident, roomId, roomNumber: r.number });
             }
             return newBuildings;
          }
        }
      }
      return newBuildings;
    });
  };

  const handleGlobalEditResident = (residentId: string, newName: string) => {
    setBuildings(prev => {
      const newBuildings = JSON.parse(JSON.stringify(prev));
      for (const b of newBuildings) {
        for (const f of b.floors) {
          for (const r of f.rooms) {
            const res = r.residents.find((res: any) => res.id === residentId);
            if (res) {
              res.name = newName;
              saveDataToSupabase('Residents', 'ADD', { id: residentId, name: newName, roomId: r.id, roomNumber: r.number });
              return newBuildings;
            }
          }
        }
      }
      return newBuildings;
    });
  };

  const handleGlobalDeleteResident = (residentId: string) => {
    setBuildings(prev => {
      const newBuildings = JSON.parse(JSON.stringify(prev));
      for (const b of newBuildings) {
        for (const f of b.floors) {
          for (const r of f.rooms) {
            const initialLen = r.residents.length;
            r.residents = r.residents.filter((res: any) => res.id !== residentId);
            if (r.residents.length < initialLen) {
                saveDataToSupabase('Residents', 'DELETE', { id: residentId });
                return newBuildings;
            }
          }
        }
      }
      return newBuildings;
    });
  };


  // --- Analytics Logic ---
  const analyticsData = useMemo(() => {
    if (!activeBuilding) return null;

    let totalWaterUnits = 0;
    let totalWaterCost = 0;
    let totalElecUnits = 0;
    let totalElecCost = 0;
    let occupiedRooms = 0;
    
    const floorStats: { id: string, name: string, water: number, elec: number }[] = [];
    const zeroUsageAlerts: { roomNumber: string, floorName: string, issue: string[] }[] = [];

    activeBuilding.floors.forEach(floor => {
        let fWater = 0;
        let fElec = 0;

        floor.rooms.forEach(room => {
            const bill = room.bills[currentMonth] || { water: 0, electricity: 0, waterUnits: 0, electricityUnits: 0 };
            const isOccupied = room.residents.length > 0;
            
            if (isOccupied) occupiedRooms++;

            totalWaterUnits += bill.waterUnits || 0;
            totalWaterCost += bill.water;
            totalElecUnits += bill.electricityUnits || 0;
            totalElecCost += bill.electricity;

            fWater += bill.waterUnits || 0;
            fElec += bill.electricityUnits || 0;

            // Zero Usage Detection Logic
            if (isOccupied) {
                const issues = [];
                if ((bill.waterUnits || 0) === 0) issues.push('น้ำประปา');
                if ((bill.electricityUnits || 0) === 0) issues.push('ไฟฟ้า');

                if (issues.length > 0) {
                    zeroUsageAlerts.push({
                        roomNumber: room.number,
                        floorName: floor.name || `ชั้นที่ ${floor.number}`,
                        issue: issues
                    });
                }
            }
        });

        floorStats.push({
            id: floor.id,
            name: floor.name || `ชั้นที่ ${floor.number}`,
            water: fWater,
            elec: fElec
        });
    });

    return {
        totalWaterUnits,
        totalWaterCost,
        totalElecUnits,
        totalElecCost,
        occupiedRooms,
        floorStats,
        zeroUsageAlerts
    };
  }, [activeBuilding, currentMonth]);


  // --- Actions ---
  
  const formatThaiDate = (dateStr: string) => {
    if(!dateStr) return "";
    const [year, month] = dateStr.split('-');
    const thaiYear = parseInt(year) + 543;
    const thaiMonthIndex = parseInt(month) - 1;
    const thaiMonths = [
        "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
        "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];
    return `${thaiMonths[thaiMonthIndex]} ${thaiYear}`;
  };

  const handleMoveResidentClick = (resident: Resident, roomId: string) => {
    // Determine which building this room belongs to
    let bId = activeBuildingId;
    for (const b of buildings) {
        for (const f of b.floors) {
            if (f.rooms.some(r => r.id === roomId)) {
                bId = b.id;
                break;
            }
        }
    }
    
    setMoveModal({
        isOpen: true,
        residentId: resident.id,
        residentName: resident.name,
        sourceRoomId: roomId,
        sourceBuildingId: bId
    });
  };

  const handleConfirmMove = () => {
    if (!moveModal || !targetRoomId) return;

    if (targetRoomId === moveModal.sourceRoomId) {
            setMoveModal(null);
            return;
    }

    setBuildings(prev => {
            const newBuildings = JSON.parse(JSON.stringify(prev));
            
            // Find source room
            let sourceRoom: any = null;
            for(const b of newBuildings) {
                if (b.id === moveModal.sourceBuildingId) {
                    for(const f of b.floors) {
                        const r = f.rooms.find((rm: any) => rm.id === moveModal.sourceRoomId);
                        if (r) { sourceRoom = r; break; }
                    }
                }
                if (sourceRoom) break;
            }

            // Find target room
            let targetRoom: any = null;
            for(const b of newBuildings) {
                if (b.id === targetBuildingId) {
                    for(const f of b.floors) {
                        const r = f.rooms.find((rm: any) => rm.id === targetRoomId);
                        if (r) { targetRoom = r; break; }
                    }
                }
                if(targetRoom) break;
            }

            if (sourceRoom && targetRoom) {
                const capacity = targetRoom.type === RoomType.SINGLE ? 1 : 2;
                if (targetRoom.residents.length >= capacity) {
                    alert(`ห้อง ${targetRoom.number} เต็มแล้ว`);
                    return prev;
                }

                const resIdx = sourceRoom.residents.findIndex((r: any) => r.id === moveModal.residentId);
                if (resIdx > -1) {
                    const [movedRes] = sourceRoom.residents.splice(resIdx, 1);
                    targetRoom.residents.push(movedRes);
                    // Update in Supabase (Update resident's roomId)
                    saveDataToSupabase('Residents', 'ADD', { 
                        id: movedRes.id, 
                        name: movedRes.name, 
                        roomId: targetRoom.id,
                        roomNumber: targetRoom.number
                    });
                }
            }

            return newBuildings;
    });

    setMoveModal(null);
  };

  const addResident = (roomId: string, name: string) => {
    setBuildings(prev => {
        const newBuildings = JSON.parse(JSON.stringify(prev));
        const building = newBuildings.find((b: Building) => b.id === activeBuildingId);
        if(!building) return prev;

        for(const floor of building.floors) {
            const room = floor.rooms.find((r: any) => r.id === roomId);
            if(room) {
                const capacity = room.type === RoomType.SINGLE ? 1 : 2;
                if (room.residents.length < capacity) {
                     const newResident = { id: Date.now().toString() + Math.random(), name };
                     room.residents.push(newResident);
                     saveDataToSupabase('Residents', 'ADD', { ...newResident, roomId, roomNumber: room.number });
                }
                break;
            }
        }
        return newBuildings;
    });
  };

  // --- Deletion Functions with Confirmation ---

  const removeResident = (roomId: string, residentId: string) => {
    if (!window.confirm("ยืนยันการลบรายชื่อผู้พักอาศัยนี้ออกจากห้องพัก?")) return;

    setBuildings(prev => {
        const newBuildings = JSON.parse(JSON.stringify(prev));
        const building = newBuildings.find((b: Building) => b.id === activeBuildingId);
        if(!building) return prev;

        for(const floor of building.floors) {
            const room = floor.rooms.find((r: any) => r.id === roomId);
            if(room) {
                room.residents = room.residents.filter((r: Resident) => r.id !== residentId);
                saveDataToSupabase('Residents', 'DELETE', { id: residentId });
                break;
            }
        }
        return newBuildings;
    });
  };

  const updateBill = (roomId: string, type: 'water' | 'electricity', value: number) => {
    // 1. Prepare data for Saving (Optimistic Update)
    let billPayload: any = null;
    let targetRoom: any = null;

    // Search for room in current state
    for (const b of buildings) {
        if (b.id === activeBuildingId) {
             for (const f of b.floors) {
                 const found = f.rooms.find(r => r.id === roomId);
                 if (found) {
                     targetRoom = found;
                     break;
                 }
             }
        }
    }
    
    if (targetRoom) {
        const existingBill = targetRoom.bills[currentMonth] || { water: 0, electricity: 0, waterUnits: 0, electricityUnits: 0 };
        const newBillData = { ...existingBill };
        newBillData[type] = value;

        billPayload = { 
            id: `${targetRoom.id}-${currentMonth}`, 
            roomId: targetRoom.id, 
            roomNumber: targetRoom.number,
            month: currentMonth, 
            waterUnits: newBillData.waterUnits || 0,
            waterPrice: newBillData.water || 0,
            electricityUnits: newBillData.electricityUnits || 0,
            electricityPrice: newBillData.electricity || 0
        };
        
        // Save to Supabase
        saveDataToSupabase('Bills', 'ADD', billPayload);
    }

    // 2. Update UI State
    setBuildings(prev => {
        const newBuildings = JSON.parse(JSON.stringify(prev));
        const building = newBuildings.find((b: Building) => b.id === activeBuildingId);
        if(!building) return prev;

        for(const floor of building.floors) {
            const room = floor.rooms.find((r: any) => r.id === roomId);
            if(room) {
                if (!room.bills) room.bills = {};
                if (!room.bills[currentMonth]) room.bills[currentMonth] = { water: 0, electricity: 0, waterUnits: 0, electricityUnits: 0 };
                
                room.bills[currentMonth][type] = value;
                break;
            }
        }
        return newBuildings;
    });
  };

  const updateWaterUnits = (roomId: string, units: number) => {
    // 1. Prepare Data
    let billPayload: any = null;
    let targetRoom: any = null;

     for (const b of buildings) {
        if (b.id === activeBuildingId) {
             for (const f of b.floors) {
                 const found = f.rooms.find(r => r.id === roomId);
                 if (found) { targetRoom = found; break; }
             }
        }
    }

    if (targetRoom) {
        const existingBill = targetRoom.bills[currentMonth] || { water: 0, electricity: 0, waterUnits: 0, electricityUnits: 0 };
        const price = Math.round(units * WATER_UNIT_PRICE);

        billPayload = { 
            id: `${targetRoom.id}-${currentMonth}`, 
            roomId: targetRoom.id, 
            roomNumber: targetRoom.number,
            month: currentMonth, 
            waterUnits: units,
            waterPrice: price,
            electricityUnits: existingBill.electricityUnits || 0,
            electricityPrice: existingBill.electricity || 0
        };
        
        saveDataToSupabase('Bills', 'ADD', billPayload);
    }

    // 2. Update State
    setBuildings(prev => {
        const newBuildings = JSON.parse(JSON.stringify(prev));
        const building = newBuildings.find((b: Building) => b.id === activeBuildingId);
        if(!building) return prev;

        for(const floor of building.floors) {
            const room = floor.rooms.find((r: any) => r.id === roomId);
            if(room) {
                if (!room.bills) room.bills = {};
                if (!room.bills[currentMonth]) room.bills[currentMonth] = { water: 0, electricity: 0, waterUnits: 0, electricityUnits: 0 };
                
                room.bills[currentMonth].waterUnits = units;
                room.bills[currentMonth].water = Math.round(units * WATER_UNIT_PRICE);
                break;
            }
        }
        return newBuildings;
    });
  };

  const updateElectricityUnits = (roomId: string, units: number) => {
    // 1. Prepare Data
    let billPayload: any = null;
    let targetRoom: any = null;

     for (const b of buildings) {
        if (b.id === activeBuildingId) {
             for (const f of b.floors) {
                 const found = f.rooms.find(r => r.id === roomId);
                 if (found) { targetRoom = found; break; }
             }
        }
    }

    if (targetRoom) {
        const existingBill = targetRoom.bills[currentMonth] || { water: 0, electricity: 0, waterUnits: 0, electricityUnits: 0 };
        const price = Math.round(units * ELECTRICITY_UNIT_PRICE);

        billPayload = { 
            id: `${targetRoom.id}-${currentMonth}`, 
            roomId: targetRoom.id, 
            roomNumber: targetRoom.number,
            month: currentMonth, 
            waterUnits: existingBill.waterUnits || 0,
            waterPrice: existingBill.water || 0,
            electricityUnits: units,
            electricityPrice: price
        };
        
        saveDataToSupabase('Bills', 'ADD', billPayload);
    }

    // 2. Update State
    setBuildings(prev => {
        const newBuildings = JSON.parse(JSON.stringify(prev));
        const building = newBuildings.find((b: Building) => b.id === activeBuildingId);
        if(!building) return prev;

        for(const floor of building.floors) {
            const room = floor.rooms.find((r: any) => r.id === roomId);
            if(room) {
                if (!room.bills) room.bills = {};
                if (!room.bills[currentMonth]) room.bills[currentMonth] = { water: 0, electricity: 0, waterUnits: 0, electricityUnits: 0 };
                
                room.bills[currentMonth].electricityUnits = units;
                room.bills[currentMonth].electricity = Math.round(units * ELECTRICITY_UNIT_PRICE);
                break;
            }
        }
        return newBuildings;
    });
  };

  const addRoom = (floorId: string, type: RoomType) => {
    setBuildings(prev => {
        const newBuildings = JSON.parse(JSON.stringify(prev));
        const building = newBuildings.find((b: Building) => b.id === activeBuildingId);
        if(!building) return prev;

        const floor = building.floors.find((f: Floor) => f.id === floorId);
        if(floor) {
            const nextIndex = floor.rooms.length + 1;
            // Parse IDs to generate number: b1 -> 1
            const bNum = building.id.replace(/\D/g, ''); 
            const fNum = floor.number;
            const roomSuffix = nextIndex.toString().padStart(2, '0');
            
            const newRoom = {
                id: `new-${Date.now()}-${Math.random()}`,
                number: `${bNum}${fNum}${roomSuffix}`,
                type: type,
                residents: [],
                bills: {}
            };
            floor.rooms.push(newRoom);
            
            // Only send schema-compliant fields to Supabase
            saveDataToSupabase('Rooms', 'ADD', { 
                id: newRoom.id, 
                number: newRoom.number, 
                type: newRoom.type, 
                floorId: floor.id 
            });
        }
        return newBuildings;
    });
  };

  const deleteRoom = (floorId: string, roomId: string) => {
     // Confirmation Dialog
     const confirmMsg = "⚠️ ยืนยันการลบห้องพักนี้?\n\nข้อมูลผู้พักอาศัยและประวัติบิลทั้งหมดในห้องนี้จะถูกลบถาวร";
     if (!window.confirm(confirmMsg)) return;
     
     setBuildings(prev => {
        const newBuildings = JSON.parse(JSON.stringify(prev));
        const building = newBuildings.find((b: Building) => b.id === activeBuildingId);
        if(!building) return prev;

        const floor = building.floors.find((f: Floor) => f.id === floorId);
        if(floor) {
            floor.rooms = floor.rooms.filter((r: any) => r.id !== roomId);
            saveDataToSupabase('Rooms', 'DELETE', { id: roomId });
        }
        return newBuildings;
     });
  };

  // --- Building/Floor Management ---

  const addBuilding = () => {
    setBuildings(prev => {
        // Find max ID number
        const maxId = prev.reduce((max, b) => {
            const num = parseInt(b.id.replace(/\D/g, '') || '0');
            return num > max ? num : max;
        }, 0);
        const nextId = maxId + 1;
        
        const newBuilding: Building = {
            id: `b${nextId}`,
            name: `อาคารใหม่ ${nextId}`,
            floors: [
                {
                    id: `b${nextId}-f1`,
                    number: 1,
                    rooms: Array.from({length: 4}).map((_, i) => ({
                         id: `b${nextId}-f1-r${i+1}`,
                         number: `${nextId}1${String(i+1).padStart(2, '0')}`,
                         type: i < 2 ? RoomType.SINGLE : RoomType.DOUBLE,
                         residents: [],
                         bills: {}
                    }))
                }
            ]
        };
        const updated = [...prev, newBuilding];
        
        // Sync to Supabase
        saveDataToSupabase('Buildings', 'ADD', { id: newBuilding.id, name: newBuilding.name });
        saveDataToSupabase('Floors', 'ADD', { id: newBuilding.floors[0].id, number: 1, buildingId: newBuilding.id });
        newBuilding.floors[0].rooms.forEach(r => {
            saveDataToSupabase('Rooms', 'ADD', { id: r.id, number: r.number, type: r.type, floorId: newBuilding.floors[0].id });
        });

        // Defer activating the new building slightly to allow state update
        setTimeout(() => setActiveBuildingId(newBuilding.id), 50);
        return updated;
    });
  };

  const deleteBuilding = (id: string) => {
      // Confirmation Dialog
      const confirmMsg = "⚠️ คำเตือน: คุณต้องการลบอาคารนี้ใช่หรือไม่?\n\nการลบอาคารจะทำให้ข้อมูลต่อไปนี้หายไปทั้งหมด:\n- ชั้นทั้งหมดในอาคาร\n- ห้องพักทั้งหมด\n- รายชื่อผู้พักอาศัยในอาคารนี้\n\nยืนยันการลบ?";
      if (!window.confirm(confirmMsg)) return;
      
      setBuildings(prev => {
          const filtered = prev.filter(b => b.id !== id);
          if (activeBuildingId === id) {
              // If we deleted the active building, switch to another one if available
              if (filtered.length > 0) setActiveBuildingId(filtered[0].id);
              else setActiveBuildingId('');
          }
          saveDataToSupabase('Buildings', 'DELETE', { id: id }); // Fixed: explicit property shorthand
          return filtered;
      });
  };

  const addFloor = () => {
      if (!activeBuilding) return;
      setBuildings(prev => {
          const newBuildings = JSON.parse(JSON.stringify(prev));
          const building = newBuildings.find((b: Building) => b.id === activeBuildingId);
          if (!building) return prev;
          
          const maxFloor = building.floors.reduce((max: number, f: Floor) => f.number > max ? f.number : max, 0);
          const nextFloor = maxFloor + 1;
          const buildingNumStr = building.id.replace(/\D/g, '');

          const newFloor = {
              id: `${building.id}-f${nextFloor}-${Date.now()}`,
              number: nextFloor,
              rooms: Array.from({length: 4}).map((_, i) => ({
                  id: `${building.id}-f${nextFloor}-r${i+1}-${Date.now()}`,
                  number: `${buildingNumStr}${nextFloor}${String(i+1).padStart(2, '0')}`,
                  type: i < 2 ? RoomType.SINGLE : RoomType.DOUBLE,
                  residents: [],
                  bills: {}
              }))
          };

          // Add new floor to the beginning (top)
          building.floors.unshift(newFloor);
          
          // Sync
          saveDataToSupabase('Floors', 'ADD', { id: newFloor.id, number: nextFloor, buildingId: building.id });
          newFloor.rooms.forEach(r => {
              saveDataToSupabase('Rooms', 'ADD', { id: r.id, number: r.number, type: r.type, floorId: newFloor.id });
          });

          return newBuildings;
      });
  };

  const deleteFloor = (floorId: string) => {
      // Confirmation Dialog
      const confirmMsg = "⚠️ ยืนยันการลบชั้นนี้?\n\nข้อมูลห้องพักและผู้พักอาศัยทั้งหมดในชั้นนี้จะถูกลบถาวร";
      if (!window.confirm(confirmMsg)) return;

      setBuildings(prev => {
          const newBuildings = JSON.parse(JSON.stringify(prev));
          const building = newBuildings.find((b: Building) => b.id === activeBuildingId);
          if (building) {
              building.floors = building.floors.filter((f: Floor) => f.id !== floorId);
              saveDataToSupabase('Floors', 'DELETE', { id: floorId });
          }
          return newBuildings;
      });
  };

  // --- Edit Actions ---

  const handleStartEditBuilding = (id: string, currentName: string) => {
    if (user?.role !== 'ADMIN') return; // Restriction
    setEditingBuildingId(id);
    setTempBuildingName(currentName);
  };

  const handleSaveBuildingName = () => {
    if (editingBuildingId && tempBuildingName.trim()) {
      setBuildings(prev => prev.map(b => b.id === editingBuildingId ? { ...b, name: tempBuildingName } : b));
      saveDataToSupabase('Buildings', 'ADD', { id: editingBuildingId, name: tempBuildingName }); // Upsert name
    }
    setEditingBuildingId(null);
  };

  const handleStartEditFloor = (id: string, currentName: string) => {
    if (user?.role !== 'ADMIN') return; // Restriction
    setEditingFloorId(id);
    setTempFloorName(currentName);
  };

  const handleSaveFloorName = () => {
    if (editingFloorId && tempFloorName.trim()) {
        setBuildings(prev => {
            const newBuildings = JSON.parse(JSON.stringify(prev));
            const building = newBuildings.find((b: Building) => b.id === activeBuildingId);
            if(!building) return prev;
            const floor = building.floors.find((f: Floor) => f.id === editingFloorId);
            if(floor) floor.name = tempFloorName;
            
            // Note: need to find floor number for accurate sync, but assuming just updating name is enough if we send ID
            saveDataToSupabase('Floors', 'ADD', { id: editingFloorId, name: tempFloorName, number: floor.number, buildingId: building.id });
            
            return newBuildings;
        });
    }
    setEditingFloorId(null);
  };

  const updateRoomDetails = (roomId: string, newNumber: string, newType: RoomType) => {
      setBuildings(prev => {
        const newBuildings = JSON.parse(JSON.stringify(prev));
        const building = newBuildings.find((b: Building) => b.id === activeBuildingId);
        if(!building) return prev;

        for(const floor of building.floors) {
            const room = floor.rooms.find((r: any) => r.id === roomId);
            if(room) {
                // Check capacity
                if (newType === RoomType.SINGLE && room.residents.length > 1) {
                    alert("ไม่สามารถเปลี่ยนเป็นห้องเดี่ยวได้เนื่องจากมีผู้พักอาศัยเกิน 1 คน (Cannot change to Single, too many residents)");
                    return prev;
                }
                room.number = newNumber;
                room.type = newType;
                
                saveDataToSupabase('Rooms', 'ADD', { id: roomId, number: newNumber, type: newType, floorId: floor.id });
                break;
            }
        }
        return newBuildings;
    });
  };

  // --- Render Login Screen ---
  if (isLoading) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white flex-col gap-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="font-light tracking-wide animate-pulse">กำลังโหลดข้อมูลจากระบบ...</p>
        </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-700 via-slate-900 to-black">
        {/* Background Overlay Pattern */}
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#4b5563 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>

        <div className="relative w-full max-w-4xl bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row animate-fade-in-up border border-white/10">
            {/* Left Side: Brand/Visual */}
            <div className="w-full md:w-5/12 bg-gradient-to-br from-blue-700 to-slate-800 p-8 md:p-12 text-white flex flex-col justify-between relative overflow-hidden">
                {/* Abstract shapes */}
                <div className="absolute top-0 left-0 w-40 h-40 bg-white/10 rounded-full -translate-x-10 -translate-y-10 blur-2xl"></div>
                <div className="absolute bottom-0 right-0 w-60 h-60 bg-blue-500/20 rounded-full translate-x-20 translate-y-20 blur-3xl"></div>

                <div className="relative z-10">
                    <div className="w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/20 mb-6 shadow-xl">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-white">
                            <path fillRule="evenodd" d="M19.5 22.5a1.5 1.5 0 001.5-1.5V7.5a1.5 1.5 0 00-1.5-1.5h-1.5V4.5A1.5 1.5 0 0016.5 3h-9A1.5 1.5 0 006 4.5v13.5H4.5a1.5 1.5 0 00-1.5 1.5v1.5a.75.75 0 00.75.75h16.5a.75.75 0 00.75-.75zM7.5 19.5h3v-3h-3v3zm0-4.5h3v-3h-3v3zm0-4.5h3v-3h-3v3zm6 9h3v-3h-3v3zm0-4.5h3v-3h-3v3zm0-4.5h3v-3h-3v3zm0-4.5h3v-3h-3v3zm0-4.5h3v-3h-3v3zm0-4.5h3v-3h-3v3z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold mb-2 tracking-tight leading-tight">ระบบบริหารจัดการ<br/>ที่พักอาศัย</h1>
                </div>
                <div className="relative z-10 text-xs text-blue-200/60 mt-8 font-mono">
                    System Ver 2.1.0 (Enterprise)
                </div>
            </div>

            {/* Right Side: Form */}
            <div className="w-full md:w-7/12 p-8 md:p-12 bg-white flex flex-col justify-center">
                <div className="mb-8">
                    <h2 className="text-2xl font-bold text-slate-800 mb-1">ยินดีต้อนรับ</h2>
                    <p className="text-slate-500 text-sm">กรุณาลงชื่อเข้าใช้เพื่อเข้าสู่ระบบบริหารจัดการ</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-5">
                    {loginError && (
                        <div className="bg-red-50 text-red-500 text-sm p-3 rounded-lg border border-red-100 flex items-center gap-2 animate-fade-in">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-shrink-0">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            {loginError}
                        </div>
                    )}
                    
                    <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">บัญชีผู้ใช้</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                                    <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
                                </svg>
                            </div>
                            <input 
                                type="text" 
                                required
                                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 text-black"
                                placeholder="Username"
                                value={loginUsername}
                                onChange={(e) => setLoginUsername(e.target.value)}
                            />
                        </div>
                    </div>
                    
                    <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">รหัสผ่าน</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                                    <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <input 
                                type="password" 
                                required
                                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 text-black"
                                placeholder="Password"
                                value={loginPassword}
                                onChange={(e) => setLoginPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <button 
                        type="submit"
                        className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 transform transition-all active:scale-[0.98] mt-4 flex justify-center items-center gap-2"
                    >
                        <span>เข้าสู่ระบบ</span>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                        </svg>
                    </button>
                </form>
                
                <div className="mt-8 text-center">
                    <p className="text-xs text-slate-400">
                        &copy; 2024 Government Housing Management System.<br/>All rights reserved.
                    </p>
                </div>
            </div>
        </div>
      </div>
    );
  }


  // --- Render Main App ---

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans text-slate-900 pb-20 lg:pb-0">
      {/* Header */}
      <header className="bg-slate-900 text-white shadow-md sticky top-0 z-40 border-b-4 border-yellow-500">
        <div className="max-w-[1800px] mx-auto px-4 py-3">
          <div className="flex flex-col gap-4">
            
            {/* Top Row: Logo & Title & User Info */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 md:w-14 md:h-14 bg-white rounded-lg flex items-center justify-center shadow-lg border-2 border-yellow-500 flex-shrink-0 p-2">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-full h-full text-slate-800">
                            <path fillRule="evenodd" d="M19.5 22.5a1.5 1.5 0 001.5-1.5V7.5a1.5 1.5 0 00-1.5-1.5h-1.5V4.5A1.5 1.5 0 0016.5 3h-9A1.5 1.5 0 006 4.5v13.5H4.5a1.5 1.5 0 00-1.5 1.5v1.5a.75.75 0 00.75.75h16.5a.75.75 0 00.75-.75zM7.5 19.5h3v-3h-3v3zm0-4.5h3v-3h-3v3zm0-4.5h3v-3h-3v3zm6 9h3v-3h-3v3zm0-4.5h3v-3h-3v3zm0-4.5h3v-3h-3v3zm0-4.5h3v-3h-3v3zm0-4.5h3v-3h-3v3z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-xl md:text-3xl font-semibold tracking-wide leading-tight">
                        ระบบบริหารจัดการที่พักอาศัย
                        </h1>
                        <div className="flex items-center gap-2">
                            <p className="text-slate-400 text-xs md:text-sm font-light tracking-wider uppercase">Government Housing Management</p>
                            
                            {/* Connection Status Indicator */}
                            <div className="flex items-center gap-1 bg-slate-800 rounded px-2 py-0.5 border border-slate-700 ml-2">
                                <div className={`w-2 h-2 rounded-full ${isOfflineMode ? 'bg-red-500' : 'bg-green-500'} animate-pulse`}></div>
                                <span className="text-[10px] text-slate-400 font-medium uppercase">
                                    {isOfflineMode ? 'Offline Mode (Mock)' : 'Connected (Supabase)'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                        <div className="text-sm font-bold text-white">{user.name}</div>
                        <div className="text-xs text-yellow-500 uppercase">{user.role}</div>
                    </div>
                    <button 
                        onClick={handleLogout}
                        className="bg-slate-800 hover:bg-red-600 text-slate-300 hover:text-white p-2 rounded-lg transition-colors"
                        title="ออกจากระบบ"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                            <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clipRule="evenodd" />
                            <path fillRule="evenodd" d="M19 10a.75.75 0 00-.75-.75H8.704l1.048-.943a.75.75 0 10-1.004-1.114l-2.5 2.25a.75.75 0 000 1.114l2.5 2.25a.75.75 0 101.004-1.114l-1.048-.943h9.546A.75.75 0 0019 10z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>
            </div>
            
            {/* Controls Row - Responsive Wrap */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-t border-slate-800 pt-3 md:border-0 md:pt-0">
                
                {/* Tabs */}
                <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1 self-start md:self-auto w-full md:w-auto overflow-x-auto">
                    {user.role === 'ADMIN' && (
                        <button 
                        onClick={() => setActiveTab('dashboard')}
                        className={`flex-1 md:flex-none px-4 py-2 rounded text-base font-medium transition-colors whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                        >
                        ผังห้องพัก
                        </button>
                    )}
                    
                    {(user.role === 'ADMIN' || user.role === 'WATER') && (
                        <button 
                        onClick={() => setActiveTab('water-meter')}
                        className={`flex-1 md:flex-none px-4 py-2 rounded text-base font-medium transition-colors whitespace-nowrap ${activeTab === 'water-meter' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                        >
                        บันทึกมิเตอร์น้ำ
                        </button>
                    )}

                    {(user.role === 'ADMIN' || user.role === 'ELECTRIC') && (
                        <button 
                        onClick={() => setActiveTab('electricity-meter')}
                        className={`flex-1 md:flex-none px-4 py-2 rounded text-base font-medium transition-colors whitespace-nowrap ${activeTab === 'electricity-meter' ? 'bg-amber-500 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                        >
                        บันทึกมิเตอร์ไฟ
                        </button>
                    )}
                    
                    {user.role === 'ADMIN' && (
                        <>
                            <button 
                            onClick={() => setActiveTab('analytics')}
                            className={`flex-1 md:flex-none px-4 py-2 rounded text-base font-medium transition-colors whitespace-nowrap ${activeTab === 'analytics' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                            >
                            วิเคราะห์ข้อมูล
                            </button>
                            <button 
                            onClick={() => setActiveTab('residents')}
                            className={`flex-1 md:flex-none px-4 py-2 rounded text-base font-medium transition-colors whitespace-nowrap ${activeTab === 'residents' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                            >
                            รายชื่อผู้พัก
                            </button>
                            <button 
                            onClick={() => setActiveTab('users')}
                            className={`flex-1 md:flex-none px-4 py-2 rounded text-base font-medium transition-colors whitespace-nowrap ${activeTab === 'users' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                            >
                            จัดการผู้ใช้งาน
                            </button>
                        </>
                    )}
                </div>

                {/* Right Actions */}
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
                    {errorMsg && <span className="text-red-400 text-xs md:text-sm bg-red-900/50 px-2 py-1 rounded w-full md:w-auto text-center">{errorMsg}</span>}
                    
                    {/* Month Picker - Custom Visuals for Thai Date */}
                    <div className="relative flex items-center gap-2 bg-slate-800 rounded px-3 py-2 border border-slate-700 hover:border-slate-500 transition-colors cursor-pointer group">
                        <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">รอบบิล:</span>
                        <span className="text-white text-base font-medium min-w-[100px] text-center">
                            {formatThaiDate(currentMonth)}
                        </span>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors">
                            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                        </svg>
                        
                        {/* Hidden Native Input overlaid on top */}
                        <input 
                            type="month" 
                            value={currentMonth}
                            onChange={(e) => setCurrentMonth(e.target.value)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            title="คลิกเพื่อเปลี่ยนรอบบิล"
                        />
                    </div>
                </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-[1800px] mx-auto p-3 md:p-6 lg:p-8 flex flex-col lg:flex-row gap-4 lg:gap-8">
        {/* Same Layout Logic - Content Area ... */}
        {/* Sidebar - Building Selector */}
        {activeTab !== 'users' && activeTab !== 'residents' && (
            <aside className="w-full lg:w-72 flex-shrink-0 space-y-2 lg:space-y-6">
            <div className="text-slate-500 text-base font-medium px-1 lg:px-0">
                เลือกอาคาร:
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden sticky top-28 flex flex-col">
                <div className="hidden lg:block bg-slate-50 px-4 py-3 border-b border-slate-200">
                <h2 className="font-semibold text-lg text-slate-700 flex items-center gap-2">
                    <span className="text-blue-600">🏢</span> รายชื่ออาคาร
                </h2>
                </div>
                
                {/* Horizontal Scroll on Mobile, Vertical Stack on Desktop */}
                <div className="flex flex-row lg:flex-col overflow-x-auto lg:overflow-visible p-2 lg:p-0 gap-2 lg:gap-0 lg:divide-y lg:divide-slate-100 max-h-[60vh] lg:overflow-y-auto">
                {buildings.map(b => {
                    let totalCap = 0;
                    let occupied = 0;
                    b.floors.forEach(f => {
                        f.rooms.forEach(r => {
                            totalCap += (r.type === RoomType.SINGLE ? 1 : 2);
                            occupied += r.residents.length;
                        });
                    });
                    const percent = totalCap > 0 ? Math.round((occupied / totalCap) * 100) : 0;
                    const isActive = activeBuildingId === String(b.id);
                    
                    return (
                        <div key={b.id} className="relative group flex-shrink-0 lg:w-full">
                            <button
                                onClick={() => setActiveBuildingId(String(b.id))}
                                className={`
                                    w-40 lg:w-full text-left px-3 py-3 lg:px-4 lg:py-4 transition-all duration-200 rounded lg:rounded-none border lg:border-0
                                    ${isActive 
                                        ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200 lg:ring-0' 
                                        : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'}
                                `}
                            >
                                <div className="flex justify-between items-center mb-2 pr-6">
                                    <span className={`font-medium text-lg lg:text-xl truncate ${isActive ? 'text-blue-700' : 'text-slate-700'}`}>
                                        {b.name}
                                    </span>
                                    <span className={`text-xs lg:text-sm font-semibold px-2 py-0.5 rounded-full border ${
                                        isActive 
                                        ? 'bg-blue-100 text-blue-700 border-blue-200' 
                                        : 'bg-slate-100 text-slate-500 border-slate-200'
                                    }`}>
                                        {occupied}/{totalCap}
                                    </span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div 
                                    className={`h-full rounded-full transition-all duration-500 ${
                                        percent >= 90 ? 'bg-red-500' : percent >= 50 ? 'bg-blue-500' : 'bg-green-500'
                                    }`} 
                                    style={{ width: `${percent}%` }}
                                    />
                                </div>
                            </button>
                            
                            {/* Delete Button (Admin Only) */}
                            {user.role === 'ADMIN' && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteBuilding(b.id);
                                    }}
                                    className={`
                                        absolute top-2 right-2 p-1.5 rounded-full z-10
                                        text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all
                                        ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                                    `}
                                    title="ลบอาคาร"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    );
                })}
                </div>
                {/* Add Building Button (Admin Only) */}
                {user.role === 'ADMIN' && (
                    <div className="p-2 border-t border-slate-100 bg-slate-50">
                        <button
                            onClick={addBuilding}
                            className="w-full flex items-center justify-center gap-2 py-2 px-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:text-blue-600 hover:border-blue-400 hover:bg-white transition-all font-medium text-sm"
                        >
                            <span className="text-lg font-bold">+</span> เพิ่มอาคารใหม่
                        </button>
                    </div>
                )}
            </div>
            
            {activeTab === 'dashboard' && (
                <div className="hidden lg:block bg-white rounded-lg shadow-sm border border-slate-200 p-5">
                    <h3 className="font-semibold text-slate-800 mb-3 text-base border-b border-slate-100 pb-2">สัญลักษณ์ (Legend)</h3>
                    <div className="space-y-3 text-base">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded border border-orange-200 bg-orange-50 flex items-center justify-center text-sm font-bold text-orange-600">S</div>
                        <div>
                            <div className="font-medium text-slate-700">ห้องเดี่ยว (Single)</div>
                            <div className="text-sm text-slate-400">พักได้ 1 ท่าน</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded border border-purple-200 bg-purple-50 flex items-center justify-center text-sm font-bold text-purple-600">D</div>
                        <div>
                            <div className="font-medium text-slate-700">ห้องคู่ (Double)</div>
                            <div className="text-sm text-slate-400">พักได้ 2 ท่าน</div>
                        </div>
                    </div>
                    </div>
                </div>
            )}
            </aside>
        )}

        {/* Content Area */}
        <section className="flex-1 min-w-0">
            {activeTab === 'users' && user.role === 'ADMIN' ? (
                <UserManagement 
                    users={users}
                    onAddUser={handleAddUser}
                    onEditUser={handleUpdateUser}
                    onDeleteUser={handleDeleteUser}
                    currentUser={user}
                />
            ) : activeTab === 'residents' && user.role === 'ADMIN' ? (
                <ResidentManagement
                    buildings={buildings}
                    onAddResident={handleGlobalAddResident}
                    onEditResident={handleGlobalEditResident}
                    onDeleteResident={handleGlobalDeleteResident}
                />
            ) : activeBuilding ? (
                <div className="space-y-4 lg:space-y-8 animate-fade-in">
                    {/* ... (Existing code for building header/tabs/etc is hidden here implicitly by XML structure, but ensuring the structure remains valid) */}
                    
                    {/* The content logic below switches based on activeTab, but since we are replacing the file content, we copy logic */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-2 border-b border-slate-200 pb-3">
                        <div className="w-full md:w-auto">
                            {editingBuildingId === activeBuilding.id ? (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={tempBuildingName}
                                        onChange={(e) => setTempBuildingName(e.target.value)}
                                        className="text-3xl md:text-4xl font-bold text-slate-800 tracking-tight border-b-2 border-blue-500 focus:outline-none bg-transparent w-full md:w-auto"
                                        autoFocus
                                        onKeyDown={(e) => e.key === 'Enter' && handleSaveBuildingName()}
                                    />
                                    <button onClick={handleSaveBuildingName} className="p-1 bg-green-100 text-green-600 rounded hover:bg-green-200">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
                                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <h2 className={`text-3xl md:text-4xl font-bold text-slate-800 tracking-tight flex items-center gap-2 group ${user.role === 'ADMIN' ? 'cursor-pointer' : ''}`} onClick={() => handleStartEditBuilding(activeBuilding.id, activeBuilding.name)}>
                                        {activeBuilding.name}
                                        {user.role === 'ADMIN' && (
                                            <span className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-blue-500 transition-all">
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
                                                    <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                                                    <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                                                </svg>
                                            </span>
                                        )}
                                    </h2>
                                    {/* Delete Building Button (Admin Only) */}
                                    {user.role === 'ADMIN' && (
                                        <button 
                                            onClick={() => deleteBuilding(activeBuilding.id)}
                                            className="text-slate-300 hover:text-red-500 transition-colors p-1"
                                            title="ลบอาคาร"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                </svg>
                                            </button>
                                        )}
                                </div>
                            )}
                            <p className="text-slate-500 mt-2 flex items-center gap-2 text-base md:text-lg">
                              <span>ข้อมูลประจำเดือน:</span>
                              <span className="bg-blue-100 text-blue-800 px-3 py-0.5 rounded font-semibold">
                                {formatThaiDate(currentMonth)}
                              </span>
                            </p>
                        </div>
                         {/* Add Floor Button (Admin Only) */}
                        {activeTab === 'dashboard' && user.role === 'ADMIN' && (
                             <button
                                onClick={addFloor}
                                className="px-4 py-2 bg-blue-50 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-100 hover:border-blue-300 font-medium transition-colors shadow-sm flex items-center gap-2 whitespace-nowrap self-end md:self-auto"
                            >
                                <span className="text-lg font-bold">+</span> เพิ่มชั้นอาคาร
                            </button>
                        )}
                    </div>

                    {/* DASHBOARD VIEW (Admin Only) */}
                    {activeTab === 'dashboard' && user.role === 'ADMIN' && (
                        <div className="space-y-8">
                            {/* Removed Add Floor Button from here */}
                            
                            {activeBuilding.floors.map((floor) => (
                                <div key={floor.id} className="relative pl-3 md:pl-0 animate-fade-in-up">
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-200 rounded md:hidden"></div>
                                    
                                    <div className="flex items-center gap-3 mb-4">
                                    {editingFloorId === floor.id ? (
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={tempFloorName}
                                                onChange={(e) => setTempFloorName(e.target.value)}
                                                className="text-xl md:text-2xl font-bold text-slate-700 bg-white border border-blue-400 px-2 py-0.5 rounded focus:outline-none"
                                                autoFocus
                                                onKeyDown={(e) => e.key === 'Enter' && handleSaveFloorName()}
                                            />
                                            <button onClick={handleSaveFloorName} className="p-0.5 bg-green-100 text-green-600 rounded hover:bg-green-200">
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-xl md:text-2xl font-bold text-slate-700 bg-slate-200/50 px-4 py-1.5 rounded inline-flex items-center gap-2 group cursor-pointer" onClick={() => handleStartEditFloor(floor.id, floor.name || `ชั้นที่ ${floor.number}`)}>
                                                {floor.name || `ชั้นที่ ${floor.number}`}
                                                <span className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-500 transition-all">
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                        <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                                                    </svg>
                                                </span>
                                            </h3>
                                            {/* Delete Floor Button */}
                                            <button 
                                                onClick={() => deleteFloor(floor.id)}
                                                className="text-slate-300 hover:text-red-500 transition-colors p-1"
                                                title="ลบชั้น"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                </svg>
                                            </button>
                                        </div>
                                    )}
                                    
                                    <div className="h-px bg-slate-200 flex-1"></div>
                                    <span className="text-sm text-slate-400 hidden sm:inline-block">จำนวน {floor.rooms.length} ห้อง</span>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1800px]:grid-cols-6 gap-3 md:gap-5 lg:gap-6">
                                        {floor.rooms.map(room => (
                                            <RoomCard
                                                key={room.id}
                                                room={room}
                                                buildingId={activeBuilding.id}
                                                currentMonth={currentMonth}
                                                onMoveResident={handleMoveResidentClick}
                                                onAddResident={addResident}
                                                onRemoveResident={removeResident}
                                                onUpdateBill={updateBill}
                                                onDeleteRoom={() => deleteRoom(floor.id, room.id)}
                                                onUpdateRoom={updateRoomDetails}
                                            />
                                        ))}
                                        {/* Add Room Button Card */}
                                        <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg bg-slate-50/50 p-4 min-h-[180px] gap-3 hover:bg-slate-100 transition-colors group">
                                            <span className="text-slate-500 text-sm font-medium">เพิ่มห้องพักใหม่</span>
                                            <div className="flex gap-2 w-full justify-center">
                                                <button 
                                                    onClick={() => addRoom(floor.id, RoomType.SINGLE)}
                                                    className="px-3 py-2 bg-white border border-orange-200 text-orange-600 text-xs font-bold rounded hover:bg-orange-50 hover:border-orange-300 shadow-sm transition-all"
                                                >
                                                    + Single
                                                </button>
                                                <button 
                                                    onClick={() => addRoom(floor.id, RoomType.DOUBLE)}
                                                    className="px-3 py-2 bg-white border border-purple-200 text-purple-600 text-xs font-bold rounded hover:bg-purple-50 hover:border-purple-300 shadow-sm transition-all"
                                                >
                                                    + Double
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Water Meter View */}
                    {activeTab === 'water-meter' && (user.role === 'ADMIN' || user.role === 'WATER') && (
                        <div className="space-y-8 animate-fade-in">
                            <div className="bg-blue-50 rounded-lg p-6 shadow-sm border border-blue-200">
                                <h2 className="text-2xl font-bold text-blue-800 mb-2 flex items-center gap-2">
                                    <span>💧</span> บันทึกมิเตอร์น้ำ
                                </h2>
                                <p className="text-blue-700/70 text-sm">กรอกเลขมิเตอร์ปัจจุบัน ระบบจะคำนวณยอดเงินให้อัตโนมัติ (หน่วยละ {WATER_UNIT_PRICE} บาท)</p>
                            </div>

                            {activeBuilding.floors.map(floor => (
                                <div key={floor.id} className="mb-8">
                                    <div className="flex items-center gap-2 mb-4">
                                        <span className="text-slate-400 font-medium">ชั้น</span>
                                        <h3 className="font-bold text-2xl text-slate-700">{floor.name || floor.number}</h3>
                                        <div className="h-px bg-slate-200 flex-1 ml-4"></div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                                        {floor.rooms.map(r => (
                                            <WaterMeterCard 
                                                key={r.id}
                                                room={r}
                                                currentMonth={currentMonth}
                                                onUpdate={updateWaterUnits}
                                                unitPrice={WATER_UNIT_PRICE}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Electricity Meter View */}
                    {activeTab === 'electricity-meter' && (user.role === 'ADMIN' || user.role === 'ELECTRIC') && (
                        <div className="space-y-8 animate-fade-in">
                            <div className="bg-amber-50 rounded-lg p-6 shadow-sm border border-amber-200">
                                <h2 className="text-2xl font-bold text-amber-800 mb-2 flex items-center gap-2">
                                    <span>⚡</span> บันทึกมิเตอร์ไฟ
                                </h2>
                                <p className="text-amber-700/70 text-sm">กรอกเลขมิเตอร์ปัจจุบัน ระบบจะคำนวณยอดเงินให้อัตโนมัติ (หน่วยละ {ELECTRICITY_UNIT_PRICE} บาท)</p>
                            </div>

                            {activeBuilding.floors.map(floor => (
                                <div key={floor.id} className="mb-8">
                                    <div className="flex items-center gap-2 mb-4">
                                        <span className="text-slate-400 font-medium">ชั้น</span>
                                        <h3 className="font-bold text-2xl text-slate-700">{floor.name || floor.number}</h3>
                                        <div className="h-px bg-slate-200 flex-1 ml-4"></div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                                        {floor.rooms.map(r => (
                                             <ElectricityMeterCard 
                                                key={r.id}
                                                room={r}
                                                currentMonth={currentMonth}
                                                onUpdate={updateElectricityUnits}
                                                unitPrice={ELECTRICITY_UNIT_PRICE}
                                             />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Analytics View (Admin Only) */}
                    {activeTab === 'analytics' && user.role === 'ADMIN' && analyticsData && (
                        <div className="space-y-6 animate-fade-in">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-white p-6 rounded-lg shadow-sm border border-blue-100 relative overflow-hidden">
                                    <div className="absolute right-0 top-0 p-4 opacity-10">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-24 h-24 text-blue-600">
                                            <path fillRule="evenodd" d="M12.963 2.286a.75.75 0 00-1.071-.136 9.742 9.742 0 00-3.539 6.177 7.547 7.547 0 01-1.705-1.715.75.75 0 00-1.152-.082A9 9 0 1015.68 4.534a7.46 7.46 0 01-2.717-2.248zM15.75 14.25a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="relative z-10">
                                        <div className="text-sm text-slate-500 font-medium mb-1 uppercase tracking-wider">ค่าน้ำประปารวม</div>
                                        <div className="text-3xl font-bold text-blue-700">{analyticsData.totalWaterCost.toLocaleString()} <span className="text-lg font-normal text-slate-400">บาท</span></div>
                                        <div className="mt-2 text-xs text-blue-400 font-medium bg-blue-50 inline-block px-2 py-1 rounded">
                                            {analyticsData.totalWaterUnits.toLocaleString()} หน่วย
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="bg-white p-6 rounded-lg shadow-sm border border-amber-100 relative overflow-hidden">
                                    <div className="absolute right-0 top-0 p-4 opacity-10">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-24 h-24 text-amber-600">
                                            <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 01.359.852L12.982 9.75h7.268a.75.75 0 01.548 1.262l-10.5 11.25a.75.75 0 01-1.272-.71l1.992-7.302H3.75a.75.75 0 01-.548-1.262l10.5-11.25a.75.75 0 01.913-.143z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="relative z-10">
                                        <div className="text-sm text-slate-500 font-medium mb-1 uppercase tracking-wider">ค่าไฟฟ้ารวม</div>
                                        <div className="text-3xl font-bold text-amber-700">{analyticsData.totalElecCost.toLocaleString()} <span className="text-lg font-normal text-slate-400">บาท</span></div>
                                        <div className="mt-2 text-xs text-amber-500 font-medium bg-amber-50 inline-block px-2 py-1 rounded">
                                            {analyticsData.totalElecUnits.toLocaleString()} หน่วย
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                                    <div className="text-sm text-slate-500 font-medium mb-1 uppercase tracking-wider">ห้องที่มีผู้พักอาศัย</div>
                                    <div className="text-3xl font-bold text-slate-700">{analyticsData.occupiedRooms} <span className="text-lg font-normal text-slate-400">ห้อง</span></div>
                                    <div className="mt-2 h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-green-500" style={{ width: `${Math.min(100, (analyticsData.occupiedRooms / (activeBuilding.floors.length * 12)) * 100)}%` }}></div>
                                    </div>
                                </div>
                                
                                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 flex flex-col justify-center">
                                    <div className="text-center">
                                        <div className="text-sm text-slate-500 font-medium mb-1">รายรับรวมโดยประมาณ</div>
                                        <div className="text-3xl font-bold text-emerald-600">
                                            {(analyticsData.totalWaterCost + analyticsData.totalElecCost).toLocaleString()} ฿
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {analyticsData.zeroUsageAlerts.length > 0 && (
                                <div className="bg-red-50 border border-red-100 rounded-lg p-6 shadow-sm">
                                    <h3 className="text-red-800 font-bold mb-4 flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                            <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                                        </svg>
                                        ตรวจพบความผิดปกติ (ไม่มียอดใช้งานในห้องที่มีคนอยู่)
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {analyticsData.zeroUsageAlerts.map((a, i) => (
                                            <div key={i} className="bg-white p-3 rounded border border-red-100 shadow-sm text-sm flex items-center gap-3">
                                                <div className="bg-red-100 text-red-700 font-bold px-2 py-1 rounded text-xs">{a.roomNumber}</div>
                                                <div className="text-slate-600">
                                                    <span className="block text-xs text-slate-400">{a.floorName}</span>
                                                    ไม่มีการใช้: <span className="font-medium text-red-600">{a.issue.join(' และ ')}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                                    <h3 className="font-bold text-slate-700">สรุปยอดรายชั้น</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-50 text-slate-500">
                                            <tr>
                                                <th className="p-4 font-medium">ชั้น</th>
                                                <th className="p-4 font-medium text-right">การใช้น้ำ (หน่วย)</th>
                                                <th className="p-4 font-medium text-right">การใช้ไฟ (หน่วย)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {analyticsData.floorStats.map((stat, idx) => (
                                                <tr key={stat.id} className="hover:bg-slate-50/50">
                                                    <td className="p-4 font-medium text-slate-700">{stat.name}</td>
                                                    <td className="p-4 text-right">
                                                        <span className="font-medium text-blue-600">{stat.water.toLocaleString()}</span>
                                                        <div className="h-1.5 w-24 bg-blue-100 rounded-full ml-auto mt-1 overflow-hidden">
                                                            <div className="h-full bg-blue-500" style={{ width: `${(stat.water / (analyticsData.totalWaterUnits || 1)) * 100}%` }}></div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        <span className="font-medium text-amber-600">{stat.elec.toLocaleString()}</span>
                                                        <div className="h-1.5 w-24 bg-amber-100 rounded-full ml-auto mt-1 overflow-hidden">
                                                            <div className="h-full bg-amber-500" style={{ width: `${(stat.elec / (analyticsData.totalElecUnits || 1)) * 100}%` }}></div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-slate-400 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50 gap-6">
                    <div className="text-center">
                         <span className="text-6xl mb-4 block">🏢</span>
                        <h3 className="text-xl font-bold text-slate-700 mb-2">
                             {isOfflineMode ? 'โหมดออฟไลน์ (Offline)' : 'ฐานข้อมูลว่างเปล่า'}
                        </h3>
                         <p className="text-slate-500 max-w-sm mx-auto">
                            {isOfflineMode 
                                ? 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้ ระบบกำลังใช้ข้อมูลจำลอง' 
                                : 'ยังไม่มีข้อมูลอาคารในระบบ คุณสามารถสร้างข้อมูลตัวอย่างเพื่อเริ่มต้นใช้งานได้ทันที'}
                        </p>
                    </div>

                    {!isOfflineMode && buildings.length === 0 && (
                        <button 
                            onClick={handleSeedDatabase}
                            disabled={isLoading}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/30 transform transition-all hover:-translate-y-1 active:scale-95 flex items-center gap-2"
                        >
                            {isLoading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    กำลังสร้างข้อมูล...
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z" clipRule="evenodd" />
                                    </svg>
                                    สร้างข้อมูลเริ่มต้น (Initialize Database)
                                </>
                            )}
                        </button>
                    )}
                </div>
            )}
        </section>

        {/* Move Resident Modal */}
        {moveModal && moveModal.isOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden border border-slate-200">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">ย้ายห้องพัก</h3>
                            <p className="text-sm text-slate-500">สำหรับ: <span className="font-semibold text-blue-600">{moveModal.residentName}</span></p>
                        </div>
                        <button onClick={() => setMoveModal(null)} className="text-slate-400 hover:text-red-500 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
                                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                            </svg>
                        </button>
                    </div>
                    
                    <div className="p-6 space-y-4">
                        {/* Select Building */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">ไปยังอาคาร</label>
                            <select 
                                value={targetBuildingId}
                                onChange={(e) => {
                                    setTargetBuildingId(e.target.value);
                                    setTargetFloorId('');
                                    setTargetRoomId('');
                                }}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-black"
                            >
                                <option value="">-- เลือกอาคาร --</option>
                                {buildings.map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Select Floor */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">ชั้น</label>
                            <select 
                                value={targetFloorId}
                                onChange={(e) => {
                                    setTargetFloorId(e.target.value);
                                    setTargetRoomId('');
                                }}
                                disabled={!targetBuildingId}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-slate-100 disabled:text-slate-400 bg-white text-black"
                            >
                                <option value="">-- เลือกชั้น --</option>
                                {buildings.find(b => b.id === targetBuildingId)?.floors.map(f => (
                                    <option key={f.id} value={f.id}>{f.name || `ชั้นที่ ${f.number}`}</option>
                                ))}
                            </select>
                        </div>

                        {/* Select Room */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">ห้องปลายทาง</label>
                            <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1">
                                {targetBuildingId && targetFloorId ? (
                                    buildings.find(b => b.id === targetBuildingId)?.floors.find(f => f.id === targetFloorId)?.rooms.map(r => {
                                        const capacity = r.type === RoomType.SINGLE ? 1 : 2;
                                        const isFull = r.residents.length >= capacity;
                                        const isCurrent = r.id === moveModal.sourceRoomId;
                                        const isSelected = r.id === targetRoomId;
                                        
                                        return (
                                            <button
                                                key={r.id}
                                                disabled={isFull || isCurrent}
                                                onClick={() => setTargetRoomId(r.id)}
                                                className={`
                                                    relative p-2 rounded border text-sm flex flex-col items-center justify-center gap-1 transition-all
                                                    ${isCurrent ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-60' : ''}
                                                    ${isFull && !isCurrent ? 'bg-red-50 border-red-100 text-red-300 cursor-not-allowed' : ''}
                                                    ${isSelected ? 'bg-blue-600 border-blue-600 text-white shadow-md ring-2 ring-blue-200' : ''}
                                                    ${!isFull && !isCurrent && !isSelected ? 'bg-white border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-blue-50' : ''}
                                                `}
                                            >
                                                <span className="font-bold">{r.number}</span>
                                                <span className="text-[10px] opacity-80">{isCurrent ? '(ปัจจุบัน)' : isFull ? '(เต็ม)' : `${r.residents.length}/${capacity}`}</span>
                                            </button>
                                        );
                                    })
                                ) : (
                                    <div className="col-span-3 text-center text-slate-400 py-4 text-sm border-2 border-dashed border-slate-200 rounded-lg">
                                        กรุณาเลือกอาคารและชั้นก่อน
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                        <button 
                            onClick={() => setMoveModal(null)}
                            className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 transition-colors"
                        >
                            ยกเลิก
                        </button>
                        <button 
                            onClick={handleConfirmMove}
                            disabled={!targetRoomId}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            ยืนยันการย้าย
                        </button>
                    </div>
                </div>
            </div>
        )}
      </main>
    </div>
  );
};

export default App;