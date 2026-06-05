import type { DragEvent, MouseEvent, ReactNode } from "react";

export interface PreviewProps {
  absolutePath: string | null;
  relativePath: string;
  kind?: string;
  placeholderLabel?: string;
}

export interface BrowserItemProps {
  title: string;
  label: ReactNode;
  isPinned?: boolean;
  selected?: boolean;
  isDragOver?: boolean;
  draggable?: boolean;
  preview: ReactNode;
  metadata: ReactNode;
  overlay?: ReactNode;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
  onDoubleClick?: (event: MouseEvent<HTMLDivElement>) => void;
  onContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
}
