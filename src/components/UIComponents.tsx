'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Copy, Check, Eye, EyeOff } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

interface PasswordFieldProps {
  value: string;
  label?: string;
  showCopy?: boolean;
}

export function PasswordField({ value, label, showCopy = true }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-sm text-slate-600">{label}:</span>}
      <code className="bg-slate-100 px-2 py-1 rounded text-sm font-mono">
        {visible ? value : '•'.repeat(Math.min(value.length, 20))}
      </code>
      <button onClick={() => setVisible(!visible)} className="p-1 hover:bg-slate-100 rounded">
        {visible ? <EyeOff className="w-4 h-4 text-slate-500" /> : <Eye className="w-4 h-4 text-slate-500" />}
      </button>
      {showCopy && (
        <button onClick={handleCopy} className="p-1 hover:bg-slate-100 rounded">
          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-slate-500" />}
        </button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ backgroundColor: 'var(--border-subtle)' }}>
        <div style={{ color: 'var(--muted)' }}>{icon}</div>
      </div>
      <h3 className="text-base font-semibold mb-1.5" style={{ color: 'var(--foreground)' }}>{title}</h3>
      <p className="text-sm max-w-sm mb-5 leading-relaxed" style={{ color: 'var(--muted)' }}>{description}</p>
      {action}
    </div>
  );
}

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}

export function ConfirmDialog({ isOpen, onClose, onConfirm, title, message }: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <p className="text-slate-600 mb-4">{message}</p>
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button
          onClick={() => { onConfirm(); onClose(); }}
          className="btn-danger"
        >
          Delete
        </button>
      </div>
    </Modal>
  );
}
