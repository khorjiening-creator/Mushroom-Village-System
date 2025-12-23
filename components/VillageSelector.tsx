
import React from 'react';
import { VillageType } from '../types';
import { VILLAGES } from '../constants';

interface VillageSelectorProps {
  selected: VillageType;
  onSelect: (village: VillageType) => void;
}

const VillageSelector: React.FC<VillageSelectorProps> = ({ selected, onSelect }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      {Object.values(VILLAGES).map((village) => {
        const isSelected = selected === village.id;
        
        let containerClass = "";
        let iconBgClass = "";
        let badgeClass = "";
        
        // Visual Logic based on selection and color theme
        if (isSelected) {
            if (village.color === 'green') {
                containerClass = "border-green-500 bg-green-50/10 shadow-md ring-1 ring-green-500";
                iconBgClass = "bg-green-100 text-green-600";
                badgeClass = "bg-green-100 text-green-700";
            } else if (village.color === 'blue') {
                containerClass = "border-blue-500 bg-blue-50/10 shadow-md ring-1 ring-blue-500";
                iconBgClass = "bg-blue-100 text-blue-600";
                badgeClass = "bg-blue-100 text-blue-700";
            } else if (village.color === 'slate') {
                containerClass = "border-slate-500 bg-slate-50/10 shadow-md ring-1 ring-slate-500";
                iconBgClass = "bg-slate-100 text-slate-600";
                badgeClass = "bg-slate-100 text-slate-700";
            }
        } else {
            containerClass = "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm";
            iconBgClass = "bg-gray-50 text-gray-400";
            badgeClass = "bg-gray-50 text-gray-500";
        }

        return (
          <button
            key={village.id}
            onClick={() => onSelect(village.id as VillageType)}
            className={`flex flex-col p-5 rounded-2xl border-2 text-left transition-all duration-200 group ${containerClass}`}
          >
            <div className="flex justify-between items-start mb-4">
               <div className={`p-3 rounded-xl transition-colors ${iconBgClass}`}>
                 {village.icon === 'leaf' && (
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                     <path d="M17,8C8,10,5.9,16.1,5.1,18.1C5,18.4,5.2,18.7,5.5,18.7c0.6,0,1.2-0.1,1.8-0.2c2,1,4.5,0.2,5.9-1.3c2.2,0,4.3-1.4,5.3-3.6c1.1-2.4,0.6-5.2-1.3-7.1L17,8z M12.5,15c-0.8,0.8-2,0.8-2.8,0c-0.8-0.8-0.8-2,0-2.8c0.8-0.8,2-0.8,2.8,0C13.3,13,13.3,14.2,12.5,15z" />
                   </svg>
                 )}
                 {village.icon === 'factory' && (
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                     <path d="M2 22h20V11l-4-4h-3l-4 4-4-4H4l-4 4v11zM11 6h2v3h-2V6zm-5 4l3-3v3H6zm10.3 0l-3-3v3h3z" />
                     <rect x="7" y="14" width="4" height="4" className="text-white opacity-40" rx="0.5"/>
                     <rect x="13" y="14" width="4" height="4" className="text-white opacity-40" rx="0.5"/>
                   </svg>
                 )}
               </div>
               <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${badgeClass}`}>
                 {village.role}
               </span>
            </div>
            
            <div>
              <h3 className={`text-lg font-black uppercase tracking-tight ${isSelected ? 'text-gray-900' : 'text-gray-500'}`}>
                {village.name}
              </h3>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default VillageSelector;
