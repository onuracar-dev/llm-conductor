import { type FC } from "react";

interface SidebarToggleIconProps {
  isOpen: boolean;
  className?: string;
}

export const SidebarToggleIcon: FC<SidebarToggleIconProps> = ({
  isOpen,
  className = "w-4 h-4",
}) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Outer rounded container */}
      <rect width="18" height="18" x="3" y="3" rx="3.5" />
      {/* Left panel partition line */}
      <line x1="9" y1="3" x2="9" y2="21" />
      {/* Dynamic directional chevron matching user provided design */}
      {isOpen ? (
        <polyline points="15 9 12 12 15 15" />
      ) : (
        <polyline points="13 9 16 12 13 15" />
      )}
    </svg>
  );
};
