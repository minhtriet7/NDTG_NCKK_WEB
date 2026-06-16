import React from "react";

/**
 * GlowingButton - CTA button with animated glow border effect
 */
export default function GlowingButton({
  children,
  onClick,
  variant = "primary",  // "primary" | "secondary" | "ghost"
  size = "md",          // "sm" | "md" | "lg"
  disabled = false,
  className = "",
  glowing = true,
  icon: Icon = null,
  iconPosition = "right",
  ...props
}) {
  const sizeClasses = {
    sm: "px-4 py-2 text-sm",
    md: "px-7 py-3 text-sm",
    lg: "px-9 py-4 text-base",
  };

  const variantClasses = {
    primary: `
      relative bg-indigo-600 text-white font-bold rounded-xl overflow-hidden
      hover:bg-indigo-500 transition-all duration-300
      ${glowing ? "hover:shadow-[0_0_24px_rgba(99,102,241,0.6)] hover:-translate-y-0.5" : ""}
      disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none
    `,
    secondary: `
      relative bg-transparent text-indigo-400 font-bold rounded-xl overflow-hidden
      border border-indigo-500/40 hover:border-indigo-400/70 hover:text-white
      hover:bg-indigo-500/10 transition-all duration-300
      ${glowing ? "hover:shadow-[0_0_16px_rgba(99,102,241,0.3)] hover:-translate-y-0.5" : ""}
      disabled:opacity-50 disabled:cursor-not-allowed
    `,
    ghost: `
      relative bg-white/5 text-slate-300 font-semibold rounded-xl overflow-hidden
      border border-white/10 hover:bg-white/10 hover:text-white hover:border-white/20
      transition-all duration-300
      disabled:opacity-50 disabled:cursor-not-allowed
    `,
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group inline-flex items-center justify-center gap-2 ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {/* Shimmer effect overlay (primary only) */}
      {variant === "primary" && !disabled && (
        <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
      )}

      {Icon && iconPosition === "left" && (
        <Icon className="w-4 h-4 relative z-10 shrink-0" />
      )}
      <span className="relative z-10">{children}</span>
      {Icon && iconPosition === "right" && (
        <Icon className="w-4 h-4 relative z-10 shrink-0 group-hover:translate-x-0.5 transition-transform" />
      )}
    </button>
  );
}
