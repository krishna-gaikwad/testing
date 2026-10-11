import React from 'react';

/**
 * Nagar Setu Civic Prototype Logo (Replaces official state seal)
 * Modern civic map pin with Pune municipal bridge aesthetic
 */
export function StateEmblem({ className = "w-10 h-10", variant = "default" }) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 64 64" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Nagar Setu Civic Prototype Logo"
    >
      <rect width="64" height="64" rx="14" fill="#1E4FA3"/>
      <path d="M32 12c-8.8 0-15 6.4-15 14.5C17 38 32 52 32 52s15-14 15-25.5C47 18.4 40.8 12 32 12z" fill="#ffffff"/>
      <circle cx="32" cy="26.5" r="6" fill="#1E4FA3"/>
    </svg>
  );
}

/**
 * Indian Tricolor Flag Ribbon Badge
 */
export function TricolorBadge({ className = "w-6 h-4" }) {
  return (
    <div className={`inline-flex flex-col rounded-xs overflow-hidden shadow-2xs border border-slate-300 ${className}`} title="National Flag of India">
      <div className="h-1/3 w-full bg-[#FF9933]"></div>
      <div className="h-1/3 w-full bg-white flex items-center justify-center relative">
        {/* Ashoka Chakra */}
        <div className="w-1.5 h-1.5 rounded-full border border-[#000080] flex items-center justify-center">
          <div className="w-0.5 h-0.5 bg-[#000080] rounded-full"></div>
        </div>
      </div>
      <div className="h-1/3 w-full bg-[#138808]"></div>
    </div>
  );
}
