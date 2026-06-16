import React from "react";

/**
 * GlassCard — Glassmorphism card wrapper
 *
 * variant:
 *   "adaptive" — auto glass-card-light (light mode) / glass-card-dark (dark mode) via CSS var
 *   "dark"     — always dark glass (hero/terminal usage)
 *   "light"    — always light glass
 *
 * hover: adds `.bento-card` lift effect
 * glow:  adds a glow utility class (`glow-${glowColor}`)
 */
export default function GlassCard({
  children,
  className = "",
  variant = "adaptive",
  hover = true,
  glow = false,
  glowColor = "indigo",
  as: Tag = "div",
  ...props
}) {
  const baseMap = {
    adaptive: "glass-card",
    dark:     "glass-card-dark",
    light:    "glass-card-light",
  };

  const baseClass  = baseMap[variant] ?? "glass-card";
  const hoverClass = hover ? "bento-card" : "";
  const glowClass  = glow  ? `glow-${glowColor}` : "";

  return (
    <Tag
      className={`rounded-2xl ${baseClass} ${hoverClass} ${glowClass} ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}
