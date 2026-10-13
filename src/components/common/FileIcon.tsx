import React from "react";
import {
  Folder,
  Image as ImageIcon,
  Film,
  Music as MusicIcon,
  Archive,
  FileCode,
  FileText,
  Smartphone,
  File,
} from "lucide-react";
import { getFileCategory } from "../../utils/format";

interface FileIconProps {
  filename: string;
  isDir: boolean;
  className?: string;
}

export const FileIcon: React.FC<FileIconProps> = ({
  filename,
  isDir,
  className = "w-5 h-5",
}) => {
  const category = getFileCategory(filename, isDir);

  switch (category) {
    case "folder":
      return <Folder className={`${className} text-amber-500 fill-amber-500/20`} />;
    case "image":
      return <ImageIcon className={`${className} text-emerald-500`} />;
    case "video":
      return <Film className={`${className} text-purple-500`} />;
    case "audio":
      return <MusicIcon className={`${className} text-pink-500`} />;
    case "archive":
      return <Archive className={`${className} text-orange-500`} />;
    case "code":
      return <FileCode className={`${className} text-cyan-500`} />;
    case "apk":
      return <Smartphone className={`${className} text-green-500`} />;
    case "document":
      return <FileText className={`${className} text-blue-500`} />;
    default:
      return <File className={`${className} text-slate-400`} />;
  }
};
