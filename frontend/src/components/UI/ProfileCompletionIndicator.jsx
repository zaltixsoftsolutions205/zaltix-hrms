// const ProfileCompletionIndicator = ({ percentage = 0, size = 120, showLabel = true, className = '' }) => {
//   const strokeWidth = Math.max(4, Math.round(size * 0.08));
//   const radius = (size - strokeWidth) / 2;
//   const circumference = 2 * Math.PI * radius;
//   const offset = circumference - (percentage / 100) * circumference;

//   const getColor = () => {
//     if (percentage >= 100) return '#10b981';
//     if (percentage >= 75) return '#3b82f6';
//     if (percentage >= 50) return '#f59e0b';
//     return '#ef4444';
//   };

//   const color = getColor();

//   return (
//     <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
//       <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} preserveAspectRatio="xMidYMid meet" style={{ transform: 'rotate(-90deg)', display: 'block' }}>
//         {/* Background circle */}
//         <circle
//           cx={size / 2}
//           cy={size / 2}
//           r={radius}
//           fill="none"
//           stroke="#e5e7eb"
//           strokeWidth={strokeWidth}
//         />
//         {/* Progress circle */}
//         <circle
//           cx={size / 2}
//           cy={size / 2}
//           r={radius}
//           fill="none"
//           stroke={color}
//           strokeWidth={strokeWidth}
//           strokeDasharray={circumference}
//           strokeDashoffset={offset}
//           strokeLinecap="round"
//           style={{ transition: 'stroke-dashoffset 0.35s ease, stroke 0.2s' }}
//         />
//       </svg>

//       {showLabel && (
//         <div className="absolute inset-0 flex flex-col items-center justify-center">
//           <div className="font-bold" style={{ color, fontSize: Math.round(size * 0.22) }}>
//             {percentage}%
//           </div>
//           <div className="text-xs text-gray-500 font-medium">Complete</div>
//         </div>
//       )}
//     </div>
//   );
// };

// export default ProfileCompletionIndicator;
import { useState, useEffect } from 'react';

const ProfileCompletionIndicator = ({ 
  percentage = 0, 
  size = 120, 
  showLabel = true, 
  className = '',
  mobileSize = 90, // Smaller size for mobile
  responsive = true
}) => {
  const [currentSize, setCurrentSize] = useState(size);

  useEffect(() => {
    if (responsive) {
      const handleResize = () => {
        const screenWidth = window.innerWidth;
        if (screenWidth <= 640) {
          setCurrentSize(mobileSize);
        } else {
          setCurrentSize(size);
        }
      };

      handleResize(); // Set initial size
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [size, mobileSize, responsive]);

  const displaySize = responsive ? currentSize : size;
  const strokeWidth = Math.max(4, Math.round(displaySize * 0.08));
  const radius = (displaySize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  const color = percentage >= 100 ? '#10b981' : '#7C3AED'; // Green at 100%, violet otherwise

  // Mobile-specific styles as inline style objects
  const mobileContainerStyle = {
    margin: '0 auto',
    maxWidth: '100%',
  };

  const mobileTextStyle = {
    fontSize: Math.max(14, Math.round(displaySize * 0.22)),
    lineHeight: 1.2,
    textAlign: 'center',
    fontWeight: 'bold',
    color: color,
  };

  const mobileSubtextStyle = {
    fontSize: Math.max(10, Math.round(displaySize * 0.12)),
    lineHeight: 1.2,
    textAlign: 'center',
    color: '#6b7280',
    fontWeight: 500,
    marginTop: displaySize < 100 ? '2px' : '4px',
    whiteSpace: 'nowrap',
  };

  return (
    <div 
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ 
        width: displaySize, 
        height: displaySize,
        ...mobileContainerStyle,
      }}
    >
      {/* SVG Circle Progress */}
      <svg 
        width={displaySize} 
        height={displaySize} 
        viewBox={`0 0 ${displaySize} ${displaySize}`} 
        preserveAspectRatio="xMidYMid meet" 
        style={{ 
          transform: 'rotate(-90deg)', 
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      >
        {/* Background circle */}
        <circle
          cx={displaySize / 2}
          cy={displaySize / 2}
          r={radius}
          fill="none"
          stroke="rgba(124,58,237,0.15)"
          strokeWidth={strokeWidth}
        />
        
        {/* Progress circle */}
        <circle
          cx={displaySize / 2}
          cy={displaySize / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ 
            transition: 'stroke-dashoffset 0.35s ease, stroke 0.2s',
          }}
        />
      </svg>

      {/* Percentage Label */}
      {showLabel && (
        <div 
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{
            padding: displaySize < 100 ? '2px' : '4px',
          }}
        >
          <div style={mobileTextStyle}>
            {percentage}%
          </div>
          <div style={mobileSubtextStyle}>
            Complete
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileCompletionIndicator;