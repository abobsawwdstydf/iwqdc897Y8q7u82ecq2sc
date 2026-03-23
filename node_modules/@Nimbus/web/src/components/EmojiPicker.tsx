import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { useLang } from '../lib/i18n';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const { lang } = useLang();

  const anchorRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const update = () => {
      const el = anchorRef.current?.parentElement;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const w = 352;
      let left = rect.right - w;
      if (left < 8) left = 8;
      setPos({ top: rect.top - 8, left });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const pickerWidth = 352;

  return (
    <>
      <div ref={anchorRef} className="hidden" />
      {createPortal(
        <>
          <div className="fixed inset-0 z-[9990]" onClick={onClose} />
          <div
            className="fixed z-[9991] rounded-2xl shadow-2xl border border-white/10"
            style={{
              width: pickerWidth,
              bottom: pos ? `${window.innerHeight - pos.top}px` : undefined,
              left: pos ? pos.left : undefined,
              background: 'rgb(17, 17, 19)',
              visibility: pos ? 'visible' : 'hidden',
            }}
          >
            <Picker
              data={data}
              onEmojiSelect={(e: { native: string }) => onSelect(e.native)}
              theme="dark"
              locale={lang === 'ru' ? 'ru' : 'en'}
              set="native"
              previewPosition="none"
              skinTonePosition="search"
              perLine={9}
              emojiSize={28}
              emojiButtonSize={36}
              maxFrequentRows={2}
              navPosition="bottom"
              dynamicWidth={false}
            />
          </div>
        </>,
        document.body
      )}
    </>
  );
}
