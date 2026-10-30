'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

// Amicro (amicro.dev) ; adapté : taille réglable, couleur héritée du texte, en <span> pour aller dans un <p> ou un <button>.
export const IOSSpinner = ({ className }: { className?: string }) => (
  <span className={cn('relative inline-block w-8 h-8', className)}>
    {Array.from({ length: 12 }).map((_, i) => (
      <motion.span
        key={i}
        className="absolute block w-full h-full"
        style={{ rotate: i * 30 }}
      >
        <motion.span
          className="block w-[8%] h-[28%] bg-current rounded-full mx-auto"
          animate={{ opacity: [1, 0.2] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * (1/12), ease: "linear" }}
        />
      </motion.span>
    ))}
  </span>
);
