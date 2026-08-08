import React from 'react';
import { CameraOff } from 'lucide-react';

interface IssueImageProps {
  src?: string;
  alt?: string;
  className?: string;
  onClick?: () => void;
  title?: string;
}

export const IssueImage: React.FC<IssueImageProps> = ({
  src,
  alt = "Issue",
  className = "w-full h-full object-cover",
  onClick,
  title = ""
}) => {
  if (!src) {
    return <div className={`${className} flex flex-col items-center justify-center gap-2 bg-slate-100 text-slate-500`} onClick={onClick} role="img" aria-label="No evidence photo provided"><CameraOff className="h-7 w-7"/><span className="text-xs font-semibold">No evidence photo provided</span></div>;
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      className={className}
      onClick={onClick}
      loading="lazy"
    />
  );
};
export default IssueImage;
