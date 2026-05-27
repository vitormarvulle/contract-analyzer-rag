/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        'gray-950': '#030712',
      },
      keyframes: {
        'orb-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.15' },
          '50%': { transform: 'scale(1.15)', opacity: '0.25' },
        },
      },
      animation: {
        'orb-pulse': 'orb-pulse 8s ease-in-out infinite',
      },
      boxShadow: {
        'glow-indigo': '0 0 20px 0 rgba(99,102,241,0.35)',
        'glow-violet': '0 0 20px 0 rgba(139,92,246,0.30)',
      },
    },
  },
  plugins: [],
}
