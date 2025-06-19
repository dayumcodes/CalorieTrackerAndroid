"use client";

import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
// Remove the Lucide icons import
// import { Moon, Sun } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";

// Custom SVG icons for Sun and Moon
const SunIcon = () => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="18" 
    height="18" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className="text-amber-500"
  >
    <circle cx="12" cy="12" r="5" fill="currentColor" />
    <g className="animate-pulse" style={{ animationDuration: '3s' }}>
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </g>
  </svg>
);

const MoonIcon = () => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="18" 
    height="18" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className="text-indigo-300"
  >
    <path 
      d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" 
      fill="currentColor"
      className="drop-shadow-[0_0_2px_rgba(165,180,252,0.3)]"
    />
    <circle cx="8" cy="9" r="1" fill="#fff" opacity="0.4" />
    <circle cx="15" cy="14" r="0.5" fill="#fff" opacity="0.4" />
    <circle cx="12" cy="8" r="0.7" fill="#fff" opacity="0.4" />
  </svg>
);

// Animation overlay component that will be rendered in a portal
const ThemeAnimationOverlay = ({ 
  animating, 
  targetTheme,
  onAnimationComplete
}: { 
  animating: boolean; 
  targetTheme: "light" | "dark" | null;
  onAnimationComplete: () => void;
}) => {
  if (!animating || typeof window === 'undefined') return null;
  
  return createPortal(
    <AnimatePresence onExitComplete={onAnimationComplete}>
      {animating && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7 }}
          className="fixed inset-0 z-[99999] overflow-hidden pointer-events-none"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          {/* Background gradient that fades in */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            exit={{ opacity: 0 }}
            transition={{ 
              duration: 1.5, 
              ease: "easeInOut",
              exit: { duration: 0.8 } 
            }}
            className={`absolute inset-0 ${
              targetTheme === "dark"
                ? "bg-gradient-to-b from-slate-900/70 via-slate-900/60 to-indigo-950/50" // Going to dark mode
                : "bg-gradient-to-b from-blue-400/60 via-blue-500/50 to-sky-300/40" // Going to light mode
            }`}
          />
          
          {/* Stars that twinkle in - only show when going to dark mode */}
          {targetTheme === "dark" && (
            <div className="absolute inset-0">
              {[...Array(30)].map((_, i) => (
                <motion.div
                  key={`star-${i}`}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: [0, 0.8, 0.6], scale: [0, 1, 0.9] }}
                  exit={{ opacity: 0, scale: 0, transition: { duration: 0.5 } }}
                  transition={{ 
                    delay: 0.1 + (i * 0.03), 
                    duration: 1,
                  }}
                  className="absolute h-1 w-1 bg-white rounded-full"
                  style={{
                    top: `${Math.random() * 100}%`,
                    left: `${Math.random() * 100}%`,
                    boxShadow: "0 0 4px 1px rgba(255, 255, 255, 0.4)"
                  }}
                />
              ))}
            </div>
          )}
          
          {/* Sun rising animation - show when going to light mode */}
          {targetTheme === "light" && (
            <motion.div
              initial={{ y: "100vh", x: "10vw", opacity: 0 }}
              animate={{ 
                y: "20vh",
                x: "80vw", 
                opacity: [0, 1],
              }}
              exit={{ 
                opacity: [1, 0.8, 0], 
                y: ["20vh", "15vh", "5vh"], 
                x: ["80vw", "85vw", "90vw"],
                scale: [1, 1.1, 0.5],
                transition: { 
                  duration: 1, 
                  ease: "easeInOut", 
                  times: [0, 0.3, 1] 
                } 
              }}
              transition={{ 
                duration: 1.5, 
                ease: [0.2, 0.65, 0.3, 0.9],
              }}
              className="absolute"
              style={{
                marginLeft: "-90px",
                filter: "drop-shadow(0 0 60px rgba(251, 191, 36, 0.5))"
              }}
            >
              {/* Custom sun SVG - larger version for animation */}
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="180" 
                height="180" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="0.5" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="text-amber-400"
              >
                <motion.circle 
                  cx="12" 
                  cy="12" 
                  r="5" 
                  fill="#FCD34D"
                  animate={{
                    scale: [1, 1.05, 1],
                  }}
                  transition={{
                    duration: 1.5,
                  }}
                />
                <motion.g 
                  className="text-amber-400"
                  animate={{
                    opacity: [0.7, 1, 0.7],
                    rotate: [0, 120]
                  }}
                  transition={{
                    duration: 1.8,
                  }}
                >
                  <line x1="12" y1="1" x2="12" y2="3" stroke="#FBBF24" strokeWidth="2" />
                  <line x1="12" y1="21" x2="12" y2="23" stroke="#FBBF24" strokeWidth="2" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="#FBBF24" strokeWidth="2" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="#FBBF24" strokeWidth="2" />
                  <line x1="1" y1="12" x2="3" y2="12" stroke="#FBBF24" strokeWidth="2" />
                  <line x1="21" y1="12" x2="23" y2="12" stroke="#FBBF24" strokeWidth="2" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="#FBBF24" strokeWidth="2" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="#FBBF24" strokeWidth="2" />
                </motion.g>
              </svg>
              
              {/* Sun ray particles - simplified for shorter animation */}
              {[...Array(10)].map((_, i) => (
                <motion.div
                  key={`sun-particle-${i}`}
                  initial={{ opacity: 0, x: 0, y: 0 }}
                  animate={{ 
                    opacity: [0, 0.7, 0.3],
                    x: [0, (Math.random() * 100) - 50],
                    y: [0, (Math.random() * 100) - 50],
                  }}
                  exit={{ 
                    opacity: 0, 
                    scale: 0,
                    transition: { duration: 0.7, delay: i * 0.03 } 
                  }}
                  transition={{ 
                    delay: 0.2 + (i * 0.08),
                    duration: 1.2,
                  }}
                  className="absolute top-1/2 left-1/2 h-2 w-2 rounded-full bg-amber-300"
                  style={{
                    boxShadow: "0 0 10px 3px rgba(251, 191, 36, 0.5)",
                    transform: "translate(-50%, -50%)"
                  }}
                />
              ))}
            </motion.div>
          )}
          
          {/* Moon rising animation - show when going to dark mode */}
          {targetTheme === "dark" && (
            <motion.div
              initial={{ y: "100vh", x: "90vw", opacity: 0 }}
              animate={{ 
                y: "20vh",
                x: "20vw", 
                opacity: [0, 1],
              }}
              exit={{ 
                opacity: [1, 0.7, 0], 
                y: ["20vh", "15vh", "5vh"], 
                x: ["20vw", "15vw", "10vw"],
                scale: [1, 1.1, 0.6],
                transition: { 
                  duration: 1, 
                  ease: "easeInOut",
                  times: [0, 0.3, 1]
                } 
              }}
              transition={{ 
                duration: 1.5, 
                ease: [0.2, 0.65, 0.3, 0.9],
              }}
              className="absolute"
              style={{
                marginLeft: "-90px",
                filter: "drop-shadow(0 0 60px rgba(255, 248, 230, 0.4))"
              }}
            >
              {/* Custom moon SVG - larger version for animation */}
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="180" 
                height="180" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="0.5" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="text-amber-100"
              >
                {/* Simple crescent moon shape */}
                <motion.path 
                  d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" 
                  fill="#FEFCE8"
                  stroke="none"
                  animate={{
                    scale: [1, 1.05, 1],
                    rotate: [0, 10, 0]
                  }}
                  transition={{
                    duration: 1.8,
                  }}
                />
                
                {/* Moon glow effect */}
                <motion.circle 
                  cx="8" 
                  cy="9" 
                  r="1" 
                  fill="#fff" 
                  animate={{
                    opacity: [0.4, 0.7, 0.4]
                  }}
                  transition={{
                    duration: 1.5,
                  }}
                />
                <motion.circle 
                  cx="15" 
                  cy="14" 
                  r="0.5" 
                  fill="#fff" 
                  animate={{
                    opacity: [0.4, 0.6, 0.4]
                  }}
                  transition={{
                    duration: 1.8,
                    delay: 0.2
                  }}
                />
                <motion.circle 
                  cx="12" 
                  cy="8" 
                  r="0.7" 
                  fill="#fff" 
                  animate={{
                    opacity: [0.4, 0.5, 0.4]
                  }}
                  transition={{
                    duration: 1.6,
                    delay: 0.3
                  }}
                />
              </svg>
              
              {/* Moon dust particles */}
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={`moon-dust-${i}`}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ 
                    opacity: [0, 0.5, 0.2],
                    scale: [0.5, 1.2, 0.8],
                    x: [0, (Math.random() * 80) - 40],
                    y: [0, (Math.random() * 80) - 40]
                  }}
                  exit={{ 
                    opacity: 0, 
                    scale: 0,
                    transition: { duration: 0.7, delay: i * 0.04 } 
                  }}
                  transition={{ 
                    delay: 0.2 + (i * 0.1),
                    duration: 1.5,
                  }}
                  className="absolute top-1/2 left-1/2 h-1.5 w-1.5 rounded-full bg-slate-200"
                  style={{
                    boxShadow: "0 0 8px 2px rgba(226, 232, 240, 0.4)",
                    transform: "translate(-50%, -50%)"
                  }}
                />
              ))}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [targetTheme, setTargetTheme] = useState<"light" | "dark" | null>(null);

  // Ensure component is mounted before accessing theme
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  
  const isDark = theme === "dark";
  
  const handleToggle = () => {
    if (animating) return;
    
    // Set which theme we're transitioning to
    const newTheme = isDark ? "light" : "dark";
    setTargetTheme(newTheme);
    setAnimating(true);
    
    // Delay the actual theme change to allow animation to start
    setTimeout(() => {
      setTheme(newTheme);
      
      // Start hiding the animation after a delay
      setTimeout(() => {
        setAnimating(false);
      }, 2000); // Hide after 2 seconds
    }, 300);
  };
  
  const handleAnimationComplete = () => {
    setTargetTheme(null);
  };

  return (
    <div className="relative">
      {/* Main Toggle Button */}
      <button
        onClick={handleToggle}
        className={`relative z-20 h-10 w-10 rounded-full flex items-center justify-center transition-colors duration-300 ${
          isDark 
            ? "bg-slate-800 text-slate-200 border border-slate-700" 
            : "bg-sky-50 text-slate-700 border border-sky-100"
        }`}
        aria-label="Toggle theme"
        disabled={animating}
      >
        {isDark ? <MoonIcon /> : <SunIcon />}
      </button>
      
      {/* Animation overlay in portal */}
      <ThemeAnimationOverlay 
        animating={animating} 
        targetTheme={targetTheme}
        onAnimationComplete={handleAnimationComplete}
      />
    </div>
  );
};