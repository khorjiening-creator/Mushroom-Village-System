
import React from 'react';
import { STAFF_LIST } from '../../constants';

export const MUSHROOM_VARIETIES = ["Oyster", "Button", "Shiitake", "King Oyster"];
export const SUPERVISOR_LIST = ["Sarah Connor", "Mike Manager", "Dr. Spore"];
export const DISPOSAL_METHODS = ["Composting", "Animal Feed", "Incineration", "Other"];
export const CUSTOMER_LIST = ["Fresh Market Co.", "City Grocers", "Organic Eats Ltd.", "Local Restaurant Group"];
export const DRIVER_LIST = [
    { id: 'DRV-001', name: "John Doe" },
    { id: 'DRV-002', name: "Jane Smith" },
    { id: 'DRV-003', name: "Max Road" },
    { id: 'DRV-004', name: "Sam Wheels" }
];
export const ROUTE_LIST = ["North Sector", "City Center", "South Bay", "West Industrial"];
export const VEHICLE_LIST = [
    { id: 'VHC-A1', type: 'Refrigerated Van' },
    { id: 'VHC-B2', type: 'Light Truck' },
    { id: 'VHC-C3', type: 'Heavy Truck' }
];
export const STORAGE_LOCATIONS = ["WH-A1", "WH-A2", "WH-B1", "Cold Storage 1", "Cold Storage 2"];
export const STORAGE_TEMPS = ["2-4°C", "4-6°C", "0-2°C", "Room Temp"];

export const COLOR_THEMES = {
    green: {
        bgLight: "bg-green-200",
        textMain: "text-green-800",
        bgSoft: "bg-green-100",
        textIcon: "text-green-700",
        borderSoft: "border-green-200",
        badgeBg: "bg-green-200",
        badgeText: "text-green-900",
        button: "bg-green-600 hover:bg-green-700 text-white",
        ring: "focus:ring-green-500",
        progress: "bg-green-500"
    },
    blue: {
        bgLight: "bg-blue-200",
        textMain: "text-blue-800",
        bgSoft: "bg-blue-100",
        textIcon: "text-blue-700",
        borderSoft: "border-blue-200",
        badgeBg: "bg-blue-200",
        badgeText: "text-blue-900",
        button: "bg-blue-600 hover:bg-blue-700 text-white",
        ring: "focus:ring-blue-500",
        progress: "bg-blue-500"
    },
    slate: {
        bgLight: "bg-slate-200",
        textMain: "text-slate-800",
        bgSoft: "bg-slate-100",
        textIcon: "text-slate-700",
        borderSoft: "border-slate-200",
        badgeBg: "bg-slate-200",
        badgeText: "text-slate-900",
        button: "bg-slate-700 hover:bg-slate-800 text-white",
        ring: "focus:ring-slate-500",
        progress: "bg-slate-500"
    }
};

export const StaffMultiSelect: React.FC<{
    selected: string[];
    onChange: (selected: string[]) => void;
    label: string;
}> = ({ selected, onChange, label }) => {
    const toggleStaff = (name: string) => {
        if (selected.includes(name)) {
            onChange(selected.filter(s => s !== name));
        } else {
            onChange([...selected, name]);
        }
    };

    return (
        <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">{label}</label>
            <div className="flex flex-wrap gap-2 mb-2 p-2 border rounded bg-white min-h-[42px]">
                {selected.length === 0 && <span className="text-gray-400 text-sm italic self-center">No staff selected</span>}
                {selected.map(staff => (
                    <span key={staff} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full flex items-center">
                        {staff}
                        <button type="button" onClick={() => toggleStaff(staff)} className="ml-1 text-blue-600 hover:text-blue-900 font-bold">×</button>
                    </span>
                ))}
            </div>
            <div className="flex flex-wrap gap-1">
                {STAFF_LIST.filter(s => !selected.includes(s)).map(staff => (
                    <button 
                        key={staff} 
                        type="button" 
                        onClick={() => toggleStaff(staff)}
                        className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded border border-gray-300"
                    >
                        + {staff}
                    </button>
                ))}
            </div>
        </div>
    );
};

export const parsePackSizeToKg = (sizeStr: string): number => {
    if (!sizeStr) return 0;
    const lower = sizeStr.toLowerCase().replace(/\s/g, '');
    const num = parseFloat(lower);
    if (isNaN(num)) return 0;
    if (lower.includes('kg')) return num;
    if (lower.includes('g')) return num / 1000;
    return 0;
};
