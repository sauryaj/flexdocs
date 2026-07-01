'use client';

import React from 'react';
import { useTheme } from '@/lib/ThemeContext';

interface StarBorderProps {
  children: React.ReactNode;
  className?: string;
  color?: string;
  speed?: string;
  thickness?: number;
  as?: React.ElementType;
}

export function StarBorder({
  children,
  className = '',
  color,
  speed = '6s',
  thickness = 1,
  as: Component = 'div',
}: StarBorderProps) {
  const { accent } = useTheme();
  const borderColor = color || 'var(--accent)';

  return (
    <Component
      className={`star-border-wrapper ${className}`}
      style={{ padding: `${thickness}px 0` }}
    >
      <div
        className="star-border-orbit star-border-bottom"
        style={{
          background: `radial-gradient(circle, ${borderColor}, transparent 10%)`,
          animationDuration: speed,
        }}
      />
      <div
        className="star-border-orbit star-border-top"
        style={{
          background: `radial-gradient(circle, ${borderColor}, transparent 10%)`,
          animationDuration: speed,
        }}
      />
      <div className="star-border-inner">{children}</div>
    </Component>
  );
}
