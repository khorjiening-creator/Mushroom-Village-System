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
        
        // Visual Logic based on selection and color
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
                iconBgClass = "bg-slate-100 text-slate-700";
                badgeClass = "bg-slate-200 text-slate-800";
            } else {
                // Fallback
                containerClass = "border-gray-400 bg-gray-50 shadow-md ring-1 ring-gray-400";
                iconBgClass = "bg-gray-200 text-gray-600";
                badgeClass = "bg-gray-200 text-gray-700";
            }
        } else {
            // Default State
            containerClass = "border-gray-200 hover:bg-white";
            
            // Hover border colors based on village type
            if (village.color === 'green') containerClass += " hover:border-green-300";
            else if (village.color === 'blue') containerClass += " hover:border-blue-300";
            else containerClass += " hover:border-slate-300";

            iconBgClass = "bg-gray-100 text-gray-400";
            
            // Hover icon colors
            if (village.color === 'green') iconBgClass += " group-hover:bg-green-50 group-hover:text-green-500";
            else if (village.color === 'blue') iconBgClass += " group-hover:bg-blue-50 group-hover:text-blue-500";
            else iconBgClass += " group-hover:bg-slate-50 group-hover:text-slate-600";

            badgeClass = "bg-gray-100 text-gray-400 group-hover:bg-gray-200 group-hover:text-gray-600";
        }

        return (
          <button
            key={village.id}
            onClick={() => onSelect(village.id)}
            className={`
              group relative flex flex-col items-center p-4 rounded-2xl border-2 transition-all duration-300 ease-out w-full
              ${containerClass}
              ${isSelected ? 'scale-[1.02]' : 'scale-100 opacity-80 hover:opacity-100'}
            `}
          >
            {isSelected && (
                <div className={`absolute top-2 right-2 h-2 w-2 rounded-full shadow-sm animate-pulse ${
                    village.color === 'green' ? 'bg-green-500' : 
                    village.color === 'blue' ? 'bg-blue-500' : 'bg-slate-600'
                }`}></div>
            )}

            <div className={`p-3 rounded-full mb-3 transition-colors duration-300 ${iconBgClass}`}>
               {/* Icons based on type */}
               {village.icon === 'mushroom' && (
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                   <path d="M12 2C7.58 2 4 5.58 4 10v1c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-1c0-4.42-3.58-8-8-8zm0 2c3.31 0 6 2.69 6 6v.5h-12V10c0-3.31 2.69-6 6-6z" opacity="0.4"/>
                   <path d="M12 2c-4.42 0-8 3.58-8 8v1a2 2 0 002 2h1.5v6c0 1.1.9 2 2 2h5c1.1 0 2-.9 2-2v-6H20a2 2 0 002-2v-1c0-4.42-3.58-8-8-8zM7.5 13H6v-1c0-2.21 1.79-4 4-4 .55 0 1 .45 1 1s-.45 1-1 1c-1.1 0-2 .9-2 2v1h-.5zM16.5 19h-5v-6h5v6z" />
                   <circle cx="9" cy="8" r="1.2" className="text-white opacity-40"/>
                   <circle cx="15" cy="7" r="1.2" className="text-white opacity-40"/>
                 </svg>
               )}
               
               {village.icon === 'flask' && (
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                   <path fillRule="evenodd" d="M7 2a1 1 0 011 1v1.323l-3.954 9.886A5 5 0 009.617 22h4.766a5 5 0 004.571-7.791L15 4.323V3a1 1 0 012 0v1.323l3.954 9.886A5 5 0 0116.383 22H9.617a5 5 0 01-4.571-7.791L9 4.323V3a1 1 0 01-2 0z" clipRule="evenodd" opacity="0.3"/>
                   <path d="M13 9V3h-2v6a4.002 4.002 0 00-3.858 3h9.716A4.002 4.002 0 0013 9z" />
                   <path d="M8 14a4 4 0 108 0 4 4 0 00-8 0z" />
                   <circle cx="12" cy="15" r="1" className="text-white opacity-50"/>
                   <circle cx="14" cy="13" r="0.5" className="text-white opacity-50"/>
                 </svg>
               )}

               {village.icon === 'production' && (
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                   <path d="M2 22h20V11l-4-4h-3l-4 4-4-4H4l-4 4v11zM11 6h2v3h-2V6zm-5 4l3-3v3H6zm10.3 0l-3-3v3h3z" />
                   <rect x="7" y="14" width="4" height="4" className="text-white opacity-40" rx="0.5"/>
                   <rect x="13" y="14" width="4" height="4" className="text-white opacity-40" rx="0.5"/>
                 </svg>
               )}

               {/* Fallback for legacy icons if needed, though replaced above */}
               {village.icon === 'leaf' && (
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.4,6.8C15.8,3.2,12.7,2,12,2S8.2,3.2,6.6,6.8c-1.8,4.1-0.2,9.3,0.3,10.6c0.1,0.2,0.3,0.3,0.5,0.3h9.1 c0.2,0,0.4-0.1,0.5-0.3C17.6,16.1,19.2,10.9,17.4,6.8z M12,15.5v-10c0.3,0.1,2.8,1.2,3.9,4.2C14.7,13.2,12.9,15.1,12,15.5z"/>
                 </svg>
               )}
            </div>
            
            <h3 className={`font-bold text-sm mb-2 transition-colors ${isSelected ? 'text-gray-900' : 'text-gray-500 group-hover:text-gray-700'}`}>{village.name}</h3>
            
            <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full transition-colors ${badgeClass}`}>
              {village.role}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default VillageSelector;