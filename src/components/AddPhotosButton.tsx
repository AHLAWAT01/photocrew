import { useRef } from 'react';
import { ImagePlus } from 'lucide-react';

interface Props {
  onFiles: (files: File[]) => void;
  raised?: boolean;
  variant?: 'fab' | 'inline';
}

export default function AddPhotosButton({ onFiles, raised = false, variant = 'fab' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      multiple
      className="hidden"
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = ''; // allow picking the same files again later
        if (files.length) onFiles(files);
      }}
    />
  );

  if (variant === 'inline') {
    return (
      <>
        {input}
        <button
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 rounded-lg bg-bone px-6 py-3.5 text-[16px] font-semibold text-ink active:bg-white"
        >
          <ImagePlus size={20} /> Add Photos
        </button>
      </>
    );
  }

  return (
    <>
      {input}
      <button
        onClick={() => inputRef.current?.click()}
        style={{ bottom: `calc(max(env(safe-area-inset-bottom), 12px) + ${raised ? 112 : 16}px)` }}
        className="fixed right-4 z-30 flex items-center gap-2 rounded-lg bg-bone py-3.5 pr-5 pl-4 font-semibold text-ink shadow-xl shadow-black/60 transition-[bottom] duration-300 active:scale-95 active:bg-white"
      >
        <ImagePlus size={20} /> Add Photos
      </button>
    </>
  );
}
