/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // STRICT 4-COLOR PALETTE SYSTEM
        obsidian: '#0B0F19', // Deep foundation canvas
        surface: '#1E293B',  // Container surface & structural glass
        emerald: {
          flux: '#10B981',   // Health, Fast-path, Healed & Eco ROI
        },
        cyan: {
          intel: '#06B6D4',  // AI Engine, Live Packets & State Beacons
        },
        slate: {
          50: '#F8FAFC',
          400: '#94A3B8',
          500: '#64748B',
          800: '#1E293B',
          900: '#0F172A',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'glow-emerald': '0 0 20px rgba(16, 185, 129, 0.45)',
        'glow-cyan': '0 0 20px rgba(6, 182, 212, 0.40)',
      }
    },
  },
  plugins: [],
}
